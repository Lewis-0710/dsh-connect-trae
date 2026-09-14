/**
 * Same-origin usage route for the Trae plugin card: sign-in state and the
 * read-only usage/credit summary, fetched by the browser half. The route
 * answers loopback browser requests only and never carries token material.
 *
 * Follows the `dsh-workbuddy-connect` status-route pattern so the plugin card
 * stays consistent with that project's external presentation.
 *
 * @module dsh-connect-trae/web-status
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { TraeCredentialStore } from './auth.ts'
import type { TraeModelInfo } from './catalog.ts'
import type { TraeUsageClient } from './usage.ts'
import type { TraeRawDiagnostic } from './raw-diagnostic.ts'
import { regionOfCredential, type TraeRegion } from './region.ts'
import { TRAE_ACCOUNTS_REFRESH_PATH, TRAE_MODELS_REFRESH_PATH, TRAE_USAGE_PATH } from './status-paths.ts'
import type { TraeWebCredits, TraeWebUsage } from './status-paths.ts'

export { TRAE_USAGE_PATH } from './status-paths.ts'
export type { TraeWebUsage } from './status-paths.ts'

/**
 * Constructor dependencies. The model accessors are region-scoped: the CN and
 * international apps expose different rosters, so the card must be served the
 * directory of the signed-in account's own region (see region.ts).
 */
export interface TraeUsageRouteOptions {
  store: TraeCredentialStore
  client: TraeUsageClient
  /** The region's last-refreshed raw directory (one entry per upstream model) for card display. */
  displayModels(region: TraeRegion): readonly TraeModelInfo[]
  /** The user's model selection in the region, stored as model id (= Trae name). */
  enabledModelIds(region: TraeRegion): readonly string[]
  discoverModels?(signal?: AbortSignal): Promise<readonly TraeModelInfo[]>
  rawDiagnostic?(): TraeRawDiagnostic
}

/** Redact token-like content before it crosses to the browser. */
function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[redacted token]')
    .replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, '$1[redacted]')
    .slice(0, 500)
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

/** Loopback browser origins only; other devices are refused until trusted origins exist. */
function loopbackOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
  } catch {
    return false
  }
}

/** Map the credit snapshot to the card's compact credit document. */
function toCredits(snapshot: { summary: { totalAmount: number; consumedAmount: number }; packs: { displayDesc: string; availableEndpoint?: number; consumedCredits?: number; creditsLimit?: number }[] }): TraeWebCredits {
  const { totalAmount, consumedAmount } = snapshot.summary
  const credit = (value: number): number => Math.round(value * 10_000) / 10_000
  const accounts = snapshot.packs.map(pack => ({
    displayDesc: pack.displayDesc,
    remain: credit(Math.max(0, (pack.creditsLimit ?? 0) - (pack.consumedCredits ?? 0))),
    size: pack.creditsLimit ?? 0,
  }))
  // `usage.credits_amount` is consumed credit, not remaining balance. Derive
  // each bucket's balance from its quota, matching total - consumed upstream.
  const remaining = (endpoint: number): number => snapshot.packs
    .filter(pack => pack.availableEndpoint === endpoint)
    .reduce((sum, pack) => credit(sum + Math.max(0, (pack.creditsLimit ?? 0) - (pack.consumedCredits ?? 0))), 0)
  return {
    total: totalAmount,
    consumed: consumedAmount,
    available: totalAmount - consumedAmount,
    workAvailable: remaining(1),
    generalAvailable: remaining(0),
    accounts,
  }
}

/**
 * Assemble the card's usage document. Sign-in state is read-only; credit is a
 * live billing answer whose failure degrades to `creditsError` rather than
 * failing the whole document.
 */
export async function traeWebUsage(deps: TraeUsageRouteOptions): Promise<TraeWebUsage> {
  const accounts = await deps.store.accounts()
  const authStatus = await deps.store.status()
  if (authStatus.state !== 'signed-in') {
    // A bare "signed out" is undiagnosable on a machine whose layout differs
    // from the ones this plugin was written against — the reported WSL2/CLI
    // case. The probed paths and their failure reasons are safe to surface:
    // they carry paths and error text, never token material.
    const { failures } = await deps.store.diagnose()
    return {
      status: 'signed-out',
      accounts,
      searched: failures.map(failure => ({
        path: failure.path,
        edition: failure.edition,
        source: failure.source,
        reason: failure.reason,
        ...failure.message === undefined ? {} : { message: safeMessage(failure.message) },
      })),
    }
  }
  let credential
  try {
    credential = await deps.store.resolve()
  } catch (error: unknown) {
    // Account selection must remain available even when the selected token is
    // expired or its refresh request fails. Report that as account-level status
    // instead of converting the entire route into HTTP 500.
    return { status: 'signed-out', accounts, message: safeMessage(error) }
  }
  // Only user-facing identity and expiry cross to the browser. Token material
  // and stable user IDs stay on the Host.
  // Region drives which per-region model directory and selection this document
  // reports, and which usage surface the credits block reads.
  const region = regionOfCredential(credential)
  const account = {
    accountId: accounts.find(item => item.selected)?.id ?? '',
    accountName: credential.accountName ?? credential.userId,
    tokenExpiresAtMs: credential.expiresAtMs,
    region,
    accounts,
    models: deps.displayModels(region).map(model => ({ ...model, ...model.input === undefined ? {} : { input: [...model.input] } })),
    enabledModelIds: [...deps.enabledModelIds(region)],
    ...deps.rawDiagnostic === undefined ? {} : { rawChat: deps.rawDiagnostic() },
  }
  if (region === 'ai') {
    // The international region is subscription-based: read its pay status
    // instead of the CN Work-credit packs. A failure degrades to
    // payStatusError, exactly like creditsError on the CN side.
    try {
      const payStatus = await deps.client.payStatus()
      return { status: 'signed-in', ...account, payStatus }
    } catch (error: unknown) {
      return { status: 'signed-in', ...account, payStatusError: safeMessage(error) }
    }
  }
  try {
    const snapshot = await deps.client.snapshot()
    return { status: 'signed-in', ...account, credits: toCredits(snapshot) }
  } catch (error: unknown) {
    return { status: 'signed-in', ...account, creditsError: safeMessage(error) }
  }
}

/** Mount the GET usage route on an optional webServer context. */
export function registerTraeUsageRoute(ctx: Context, deps: TraeUsageRouteOptions): void {
  ctx.effect(() => {
    const disposeUsage = ctx.webServer.register({
      kind: 'exact',
      path: TRAE_USAGE_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') {
          json(res, 405, { error: 'method not allowed' })
          return
        }
        if (!loopbackOrigin(req)) {
          json(res, 403, { error: 'origin-not-trusted' })
          return
        }
        try {
          json(res, 200, await traeWebUsage(deps))
        } catch (error: unknown) {
          json(res, 500, { error: safeMessage(error) })
        }
      },
    })
    const disposeAccounts = ctx.webServer.register({
      kind: 'exact',
      path: TRAE_ACCOUNTS_REFRESH_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
        if (!loopbackOrigin(req)) return json(res, 403, { error: 'origin-not-trusted' })
        try {
          json(res, 200, { accounts: await deps.store.accounts() })
        } catch (error: unknown) {
          json(res, 500, { error: safeMessage(error) })
        }
      },
    })
    const disposeRefresh = ctx.webServer.register({
      kind: 'exact',
      path: TRAE_MODELS_REFRESH_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
        if (!loopbackOrigin(req)) return json(res, 403, { error: 'origin-not-trusted' })
        if (deps.discoverModels === undefined) return json(res, 503, { error: 'model refresh unavailable' })
        try {
          const models = await deps.discoverModels()
          json(res, 200, { models })
        } catch (error: unknown) {
          json(res, 500, { error: safeMessage(error) })
        }
      },
    })
    return () => {
      disposeRefresh()
      disposeAccounts()
      disposeUsage()
    }
  }, 'dsh-connect-trae: Web usage route')
}
