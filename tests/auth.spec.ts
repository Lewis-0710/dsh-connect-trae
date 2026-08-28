import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeTraeCredential, TraeCredentialStore } from '../src/auth.ts'
import { TRAE_AUTH_STORAGE_KEY } from '../src/decrypt.ts'

const cleanup: string[] = []
afterEach(async () => { await Promise.all(cleanup.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

function storage(token: string, expiresAt: number, refreshExpiresAt = Date.now() + 86_400_000): string {
  return JSON.stringify({ [TRAE_AUTH_STORAGE_KEY]: JSON.stringify({
    token, refreshToken: 'rt', userId: 'uid', host: 'https://api.trae.cn', expiredAt: new Date(expiresAt).toISOString(), refreshExpiredAt: new Date(refreshExpiresAt).toISOString(),
  }) })
}

async function temp(): Promise<string> { const dir = await mkdtemp(join(tmpdir(), 'trae-auth-')); cleanup.push(dir); return dir }

describe('Trae credential normalization', () => {
  it('normalizes ISO and numeric expiries while exposing only the display username', () => {
    expect(normalizeTraeCredential({ token: 'at', expiredAt: '2030-01-01T00:00:00.000Z', account: { username: 'LaoDing', email: 'private@example.com' } }, 'cn', 'desktop')).toMatchObject({
      accessToken: 'at', accountName: 'LaoDing', edition: 'cn', source: 'desktop', expiresAtMs: Date.parse('2030-01-01T00:00:00.000Z'),
    })
    expect(normalizeTraeCredential({}, 'cn', 'desktop')).toBeUndefined()
  })
})

describe('TraeCredentialStore', () => {
  it('reads desktop storage without modifying it', async () => {
    const dir = await temp(); const file = join(dir, 'storage.json'); const before = storage('desktop', Date.now() + 3_600_000)
    await writeFile(file, before)
    const store = new TraeCredentialStore({ storagePath: file, edition: 'cn', ownPath: join(dir, 'own.json'), refresh: async () => { throw new Error('unused') } })
    await expect(store.resolve()).resolves.toMatchObject({ accessToken: 'desktop', source: 'desktop', edition: 'cn' })
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('single-flights refresh, stores a 0600 copy, and serves it next', async () => {
    const dir = await temp(); const file = join(dir, 'storage.json'); const own = join(dir, 'own.json')
    await writeFile(file, storage('old', Date.now() - 1000))
    let refreshes = 0
    const store = new TraeCredentialStore({ storagePath: file, edition: 'cn', ownPath: own, refresh: async () => {
      refreshes += 1; await new Promise(resolve => setTimeout(resolve, 10)); return { accessToken: 'fresh', refreshToken: 'rt2', expiresAtMs: Date.now() + 3_600_000 }
    } })
    const [a, b] = await Promise.all([store.resolve(), store.resolve()])
    expect(a.accessToken).toBe('fresh'); expect(b.accessToken).toBe('fresh'); expect(refreshes).toBe(1)
    expect((await stat(own)).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(own, 'utf8')).credential.accessToken).toBe('fresh')
  })

  it('prefers the desktop credential even when the own cache expires later', async () => {
    const dir = await temp(); const file = join(dir, 'storage.json'); const own = join(dir, 'own.json')
    await writeFile(file, storage('desktop', Date.now() + 3_600_000))
    await writeFile(own, JSON.stringify({ version: 1, credential: {
      accessToken: 'stale-own', refreshToken: 'rt', userId: 'old', host: 'https://api.trae.cn',
      expiresAtMs: Date.now() + 86_400_000, source: 'dsh', edition: 'cn',
    } }))
    const store = new TraeCredentialStore({ storagePath: file, edition: 'cn', ownPath: own, refresh: async () => { throw new Error('unused') } })
    // The desktop credential (the account currently signed in to Trae) must win,
    // even though the own cache has a later expiry: the plugin should always
    // follow the account the user is logged into right now.
    await expect(store.current()).resolves.toMatchObject({ accessToken: 'desktop', source: 'desktop' })
  })

  it('uses a still-valid token when refresh fails and rejects an expired refresh token', async () => {
    const dir = await temp(); const fresh = join(dir, 'fresh.json'); const expired = join(dir, 'expired.json')
    await writeFile(fresh, storage('usable', Date.now() + 60_000))
    const fallback = new TraeCredentialStore({ storagePath: fresh, edition: 'cn', ownPath: join(dir, 'own-a'), refreshMarginMs: 300_000, refresh: async () => { throw new Error('down') } })
    await expect(fallback.resolve()).resolves.toMatchObject({ accessToken: 'usable' })
    await writeFile(expired, storage('dead', Date.now() - 1000, Date.now() - 1000))
    const rejected = new TraeCredentialStore({ storagePath: expired, edition: 'cn', ownPath: join(dir, 'own-b'), refresh: async () => ({ accessToken: 'never', expiresAtMs: Date.now() + 1000 }) })
    await expect(rejected.resolve()).rejects.toThrow(/no valid refresh token/)
  })

  it('reports signed out for a missing explicit file', async () => {
    const dir = await temp()
    const store = new TraeCredentialStore({ storagePath: join(dir, 'missing.json'), edition: 'cn', ownPath: join(dir, 'own'), refresh: async c => ({ accessToken: c.accessToken, expiresAtMs: c.expiresAtMs }) })
    await expect(store.status()).resolves.toEqual({ state: 'signed-out' })
    await expect(store.desktopFilePresent()).resolves.toBe(false)
  })
})
