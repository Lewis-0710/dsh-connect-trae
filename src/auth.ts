import { readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { parseTraeStorageDocument } from './decrypt.ts'
import { traeStorageCandidates, type TraeEdition, type TraeStorageCandidate } from './paths.ts'

export interface TraeCredential {
  accessToken: string
  refreshToken?: string
  userId: string
  accountName?: string
  host: string
  expiresAtMs: number
  refreshExpiresAtMs?: number
  edition: TraeEdition
  source: 'desktop' | 'dsh'
}

export interface TraeRefreshOutcome {
  accessToken: string
  refreshToken?: string
  expiresAtMs: number
  refreshExpiresAtMs?: number
  host?: string
}

export interface TraeCredentialStoreOptions {
  storagePath?: string
  edition?: TraeEdition | 'auto'
  ownPath?: string
  refresh: (credential: TraeCredential) => Promise<TraeRefreshOutcome>
  refreshMarginMs?: number
}

const OWN_VERSION = 1
export const TRAE_AUTH_FILENAME = '.trae-auth.json'

export function traeOwnAuthPath(): string {
  return join(resolveDshHome(), TRAE_AUTH_FILENAME)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function timeToMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value > 1e12 ? value : value * 1000
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric * 1000
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function normalizeTraeCredential(raw: unknown, edition: TraeEdition, source: TraeCredential['source']): TraeCredential | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  const accessToken = optionalString(value['token']) ?? optionalString(value['accessToken'])
  if (accessToken === undefined) return undefined
  const expiresAtMs = timeToMs(value['expiredAt'] ?? value['expiresAt']) ?? 0
  const refreshExpiresAtMs = timeToMs(value['refreshExpiredAt'] ?? value['refreshExpiresAt'])
  const refreshToken = optionalString(value['refreshToken'])
  const account = typeof value['account'] === 'object' && value['account'] !== null && !Array.isArray(value['account'])
    ? value['account'] as Record<string, unknown>
    : undefined
  const accountName = optionalString(account?.['username'])
  return {
    accessToken,
    ...refreshToken === undefined ? {} : { refreshToken },
    userId: optionalString(value['userId']) ?? '',
    ...accountName === undefined ? {} : { accountName },
    host: optionalString(value['host']) ?? '',
    expiresAtMs,
    ...refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs },
    edition,
    source,
  }
}

function parseOwn(text: string): TraeCredential | undefined {
  try {
    const document = JSON.parse(text) as { version?: unknown; credential?: unknown }
    if (document.version !== OWN_VERSION || typeof document.credential !== 'object' || document.credential === null) return undefined
    const stored = document.credential as Record<string, unknown>
    const edition = stored['edition']
    if (edition !== 'cn' && edition !== 'sg' && edition !== 'solo' && edition !== 'solo-sg') return undefined
    return normalizeTraeCredential({
      token: stored['accessToken'], refreshToken: stored['refreshToken'], userId: stored['userId'], host: stored['host'],
      account: stored['accountName'] === undefined ? undefined : { username: stored['accountName'] },
      expiredAt: stored['expiresAtMs'], refreshExpiredAt: stored['refreshExpiresAtMs'],
    }, edition, 'dsh')
  } catch { return undefined }
}

export class TraeCredentialStore {
  private storagePathOverride: string | undefined
  private edition: TraeEdition | 'auto'
  private readonly ownPath: string
  private readonly refresh: TraeCredentialStoreOptions['refresh']
  private readonly refreshMarginMs: number
  private inflight: Promise<TraeCredential> | undefined

  constructor(options: TraeCredentialStoreOptions) {
    this.storagePathOverride = options.storagePath
    this.edition = options.edition ?? 'auto'
    this.ownPath = options.ownPath ?? traeOwnAuthPath()
    this.refresh = options.refresh
    this.refreshMarginMs = options.refreshMarginMs ?? 5 * 60_000
  }

  setSource(storagePath: string | undefined, edition: TraeEdition | 'auto' = 'auto'): void {
    this.storagePathOverride = storagePath
    this.edition = edition
  }

  candidates(): TraeStorageCandidate[] {
    if (this.storagePathOverride !== undefined) {
      const edition = this.edition === 'auto' ? 'cn' : this.edition
      return [{ edition, path: this.storagePathOverride }]
    }
    const all = traeStorageCandidates()
    return this.edition === 'auto' ? all : all.filter(candidate => candidate.edition === this.edition)
  }

  async current(): Promise<TraeCredential | undefined> {
    const [desktop, own] = await Promise.all([this.readDesktop(), this.readOwn()])
    // Prefer the desktop credential: it is the account currently signed in to
    // the Trae client, so usage/credits always reflect what the user sees.
    // The own cache is only a fallback when no desktop credential is present.
    return desktop ?? own
  }

  async resolve(): Promise<TraeCredential> {
    const credential = await this.current()
    if (credential === undefined) throw new Error(`trae: no signed-in account found (${this.candidates().map(item => item.path).join(' or ')})`)
    if (credential.expiresAtMs > Date.now() + this.refreshMarginMs) return credential
    this.inflight ??= this.refreshNow(credential).finally(() => { this.inflight = undefined })
    return this.inflight
  }

  async status(): Promise<{ state: 'signed-in' | 'signed-out'; edition?: TraeEdition; expiresAtMs?: number; source?: 'desktop' | 'dsh' }> {
    try {
      const value = await this.current()
      return value === undefined ? { state: 'signed-out' } : { state: 'signed-in', edition: value.edition, expiresAtMs: value.expiresAtMs, source: value.source }
    } catch { return { state: 'signed-out' } }
  }

  async desktopFilePresent(): Promise<boolean> {
    for (const candidate of this.candidates()) {
      try { if ((await stat(candidate.path)).isFile()) return true } catch {}
    }
    return false
  }

  async logout(): Promise<void> {
    await rm(this.ownPath, { force: true })
    await rm(`${this.ownPath}.lock`, { force: true })
  }

  private async readDesktop(): Promise<TraeCredential | undefined> {
    for (const candidate of this.candidates()) {
      try {
        const raw = parseTraeStorageDocument(await readFile(candidate.path, 'utf8'))
        return normalizeTraeCredential(raw, candidate.edition, 'desktop')
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') continue
        throw error
      }
    }
    return undefined
  }

  private async readOwn(): Promise<TraeCredential | undefined> {
    try { return parseOwn(await readFile(this.ownPath, 'utf8')) }
    catch { return undefined }
  }

  private async refreshNow(credential: TraeCredential): Promise<TraeCredential> {
    if (credential.refreshToken === undefined || (credential.refreshExpiresAtMs !== undefined && credential.refreshExpiresAtMs <= Date.now())) {
      if (credential.expiresAtMs > Date.now() + 30_000) return credential
      throw new Error('trae: access token expired and no valid refresh token is available; sign in again in Trae')
    }
    try {
      const outcome = await this.refresh(credential)
      const refreshed: TraeCredential = {
        ...credential,
        accessToken: outcome.accessToken,
        ...outcome.refreshToken === undefined ? {} : { refreshToken: outcome.refreshToken },
        expiresAtMs: outcome.expiresAtMs,
        ...outcome.refreshExpiresAtMs === undefined ? {} : { refreshExpiresAtMs: outcome.refreshExpiresAtMs },
        ...outcome.host === undefined ? {} : { host: outcome.host },
        source: 'dsh',
      }
      await withFileLock(this.ownPath, async () => {
        await writeFileAtomic(this.ownPath, `${JSON.stringify({ version: OWN_VERSION, credential: refreshed }, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
      })
      return refreshed
    } catch (error: unknown) {
      if (credential.expiresAtMs > Date.now() + 30_000) return credential
      throw new Error(`trae: token refresh failed and access token is expired (${String(error)}); sign in again in Trae`)
    }
  }
}
