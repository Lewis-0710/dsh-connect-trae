import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createTraeAdapter, TRAE_PROVIDER } from './adapter.ts'
import { TraeCredentialStore } from './auth.ts'
import { TraeCatalog } from './catalog.ts'
import { refreshTraeCredential } from './refresh.ts'
import { createTraeShim } from './shim.ts'
import { TraeSoloRemoteClient } from './solo-remote.ts'
import { TraeSoloRemoteBridge } from './solo-remote-bridge.ts'
import { TraeUsageClient } from './usage.ts'
import { registerTraeUsageRoute } from './web-status.ts'

export { createTraeAdapter, TRAE_PROVIDER, TRAE_STREAM_IDLE_TIMEOUT_MS } from './adapter.ts'
export { normalizeTraeCredential, traeOwnAuthPath, TraeCredentialStore, type TraeCredential } from './auth.ts'
export { FALLBACK_TRAE_MODELS, TraeCatalog, type TraeModelInfo } from './catalog.ts'
export { decryptTraeStorageValue, parseTraeAuthValue, parseTraeStorageDocument } from './decrypt.ts'
export { identityHeaders, readTraeIdentity, type TraeIdentity } from './identity.ts'
export { parseObservedModelConfig, type TraeObservedModelConfig } from './model-config.ts'
export { traeStorageCandidates, type TraeEdition, type TraeStorageCandidate } from './paths.ts'
export { buildTraeAgentTaskBody, buildTraeCnHeaders, TRAE_CN_AGENT_TASK_PATH, TRAE_CN_TITLE_PATH, traeEndpoint } from './protocol.ts'
export { buildTraeRawChatDraft, decodeRawChatChunk, TRAE_RAW_CHAT_V1_PATH, TRAE_RAW_CHAT_V2_PATH, type RawChatDelta, type RawChatMessage, type RawChatTool } from './raw-chat.ts'
export { TraeRawChatUpstreamClient, type TraeRawChatClientOptions, type TraeRawChatConfig } from './raw-upstream.ts'
export { applyReasoningEffort, parseReasoningCapability, TRAE_REASONING_EFFORTS, type TraeReasoningCapability, type TraeReasoningEffort } from './reasoning.ts'
export { refreshTraeCredential } from './refresh.ts'
export { decodeTraeEvent, SseDecoder, type SseEvent, type TraeStreamEvent } from './sse.ts'
export { prepareSoloBody, TraeSoloUpstreamClient, TRAE_SOLO_CHAT_PATH, TRAE_SOLO_FUNCTION, TRAE_SOLO_MODELS_PATH, type TraeSoloClientOptions } from './solo.ts'
export { TraeSoloRemoteClient, TRAE_SOLO_REMOTE_BASE, TRAE_SOLO_REMOTE_MODELS, type TraeSoloRemoteOptions } from './solo-remote.ts'
export { TraeSoloRemoteBridge } from './solo-remote-bridge.ts'
export { TRAE_PAY_BASE, TraeUsageClient, type TraeActivityRule, type TraeCheckinStatus, type TraeUsageOptions, type TraeUsagePack, type TraeUsageSnapshot, type TraeUsageSummary, type TraeUsageView } from './usage.ts'
export { registerTraeUsageRoute, traeWebUsage, type TraeUsageRouteOptions } from './web-status.ts'
export { TRAE_USAGE_PATH, type TraeWebActivity, type TraeWebCheckin, type TraeWebCredits, type TraeWebUsage } from './status-paths.ts'
export { createTraeShim, type TraeShim } from './shim.ts'
export { UnconfiguredTraeUpstreamClient, type TraeChatResult, type TraeUpstreamClient } from './upstream.ts'

export const name = 'llm-trae'
export const inject = ['llm']
export const TRAE_SETTINGS_NS = settingsNamespace('trae')

export interface Config {
  authFile?: string
  edition?: 'auto' | 'cn' | 'sg' | 'solo' | 'solo-sg'
}

export const Config: z<Config> = z.object({
  authFile: z.string().description('Optional Trae storage.json path override'),
  edition: z.union(['auto', 'cn', 'sg', 'solo', 'solo-sg']).default('auto').description('Trae edition hint'),
})

export function apply(ctx: Context, config: Config): void {
  const catalog = new TraeCatalog()
  const store = new TraeCredentialStore({
    ...config.authFile === undefined ? {} : { storagePath: config.authFile },
    edition: config.edition ?? 'auto',
    refresh: credential => refreshTraeCredential(credential),
  })
  const remote = new TraeSoloRemoteClient({ credential: () => store.resolve() })
  const upstream = new TraeSoloRemoteBridge(remote)
  const shim = createTraeShim({ catalog, client: upstream, logger: ctx.logger })

  // Read-only usage/credit summary served to the browser half. Optional on the
  // `webServer` seam; absent in headless runs, the host provider still works.
  const usageClient = new TraeUsageClient({ credential: () => store.resolve() })
  ctx.inject(['webServer'], (webCtx) => registerTraeUsageRoute(webCtx, { store, client: usageClient }))

  let current = () => config
  installSettingsSection(ctx, TRAE_SETTINGS_NS, Config, config, {
    setSource(source) { current = source },
    onChange() {
      const next = current()
      store.setSource(next.authFile, next.edition ?? 'auto')
    },
  })

  let stopped = false
  ctx.effect(() => () => {
    stopped = true
    void shim.close()
  })

  void shim.ready.then(() => {
    if (stopped) return
    catalog.set([
      { id: 'DeepSeek-V4-Flash', name: 'DeepSeek-V4-Flash', contextWindow: 168_000, maxTokens: 32_000 },
      { id: 'DeepSeek-V4-Pro', name: 'DeepSeek-V4-Pro', contextWindow: 168_000, maxTokens: 32_000 },
      { id: 'Doubao_1_6', name: 'Doubao-Seed-Code', contextWindow: 168_000, maxTokens: 32_000 },
      { id: 'kimi-k2.6', name: 'Kimi-K2.6', contextWindow: 168_000, maxTokens: 32_000 },
      { id: 'qwen-3.6-plus', name: 'Qwen3.6-Plus', contextWindow: 168_000, maxTokens: 32_000 },
      { id: 'glm-5.1', name: 'GLM-5.1', contextWindow: 168_000, maxTokens: 32_000 },
      { id: 'minimax-m2.7', name: 'MiniMax-M2.7', contextWindow: 168_000, maxTokens: 32_000 },
    ])
    const trae = createTraeAdapter({
      shim,
      catalog,
      resolveAttachments: () => ctx.get('attachments'),
    })
    let releaseAdapter: (() => void) | undefined
    let releaseDirectory: (() => void) | undefined
    try {
      releaseAdapter = ctx.llm.registerAdapter([TRAE_PROVIDER], trae.adapter)
      releaseDirectory = ctx.llm.registerConfigurableProviders([{
        provider: TRAE_PROVIDER,
        displayName: 'Trae',
        settingsNs: TRAE_SETTINGS_NS,
        settingsPath: [],
        declared: false,
      }])
    } finally {
      if (releaseAdapter === undefined || releaseDirectory === undefined) {
        releaseAdapter?.()
        releaseDirectory?.()
      }
    }
    try {
      ctx.effect(() => () => {
        releaseAdapter?.()
        releaseDirectory?.()
      })
    } catch {
      releaseAdapter?.()
      releaseDirectory?.()
    }
  }).catch((error: unknown) => {
    ctx.logger.error('dsh-connect-trae: loopback shim failed; provider not registered', error)
  })
}
