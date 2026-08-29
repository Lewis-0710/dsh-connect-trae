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
import { TRAE_MODELS_REFRESH_PATH, TRAE_USAGE_PATH } from './status-paths.ts'
import type { TraeWebCredits, TraeWebUsage } from './status-paths.ts'

export { TRAE_USAGE_PATH } from './status-paths.ts'
export type { TraeWebUsage } from './status-paths.ts'

/** Constructor dependencies. */
export interface TraeUsageRouteOptions {
  store: TraeCredentialStore
  client: TraeUsageClient
  /** The last-refreshed Trae raw directory (no generated @1m variants) for card display. */
  displayModels(): readonly TraeModelInfo[]
  /** The user's ordinary-model selection stored as model id (= Trae name). */
  enabledModelIds(): readonly string[]
  /** The user's 1M selection stored as base-model id. */
  enabled1mModelIds(): readonly string[]
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
function toCredits(snapshot: { summary: { totalAmount: number; consumedAmount: number }; packs: { displayDesc: string; remainingCredits?: number; creditsLimit?: number }[] }): TraeWebCredits {
  const { totalAmount, consumedAmount } = snapshot.summary
  const accounts = snapshot.packs.map(pack => ({
    displayDesc: pack.displayDesc,
    remain: pack.remainingCredits ?? 0,
    size: pack.creditsLimit ?? 0,
  }))
  return { total: totalAmount, consumed: consumedAmount, available: totalAmount - consumedAmount, accounts }
}

/**
 * Assemble the card's usage document. Sign-in state is read-only; credit is a
 * live billing answer whose failure degrades to `creditsError` rather than
 * failing the whole document.
 */
export async function traeWebUsage(deps: TraeUsageRouteOptions): Promise<TraeWebUsage> {
  const authStatus = await deps.store.status()
  if (authStatus.state !== 'signed-in') return { status: 'signed-out' }
  const credential = await deps.store.resolve()
  // Only user-facing identity and expiry cross to the browser. Token material
  // and stable user IDs stay on the Host.
  const account = {
    accountName: credential.accountName ?? credential.userId,
    tokenExpiresAtMs: credential.expiresAtMs,
    models: deps.displayModels().map(model => ({ ...model, ...model.input === undefined ? {} : { input: [...model.input] } })),
    enabledModelIds: [...deps.enabledModelIds()],
    enabled1mModelIds: [...deps.enabled1mModelIds()],
    ...deps.rawDiagnostic === undefined ? {} : { rawChat: deps.rawDiagnostic() },
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
      disposeUsage()
    }
  }, 'dsh-connect-trae: Web usage route')
}
