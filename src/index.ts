import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createTraeAdapter, TRAE_PROVIDER } from './adapter.ts'
import { TraeCredentialStore } from './auth.ts'
import { deriveCatalog, discoveredCatalog, FALLBACK_TRAE_MODELS, TraeCatalog, type TraeModelInfo } from './catalog.ts'
import { refreshTraeCredential } from './refresh.ts'
import { createTraeShim } from './shim.ts'
import { TraeSoloRemoteClient } from './solo-remote.ts'
import { TraeSoloRemoteBridge } from './solo-remote-bridge.ts'
import { TraeUsageClient } from './usage.ts'
import { registerTraeUsageRoute } from './web-status.ts'

export { createTraeAdapter, TRAE_PROVIDER, TRAE_STREAM_IDLE_TIMEOUT_MS } from './adapter.ts'
export { normalizeTraeCredential, traeOwnAuthPath, TraeCredentialStore, type TraeCredential } from './auth.ts'
export { discoveredCatalog, FALLBACK_TRAE_MODELS, TraeCatalog, type TraeModelInfo } from './catalog.ts'
export { decryptTraeStorageValue, parseTraeAuthValue, parseTraeStorageDocument } from './decrypt.ts'
export { identityHeaders, readTraeIdentity, type TraeIdentity } from './identity.ts'
export { parseObservedModelConfig, type TraeObservedModelConfig } from './model-config.ts'
export { buildTraeModelDetailRequest, TRAE_MODEL_DETAIL_FUNCTIONS, TRAE_MODEL_DETAIL_PATH, type TraeModelDetailRequest } from './model-detail.ts'
export { parseTraeRemoteModel, type TraeDiscoveredModel, type TraeDiscoveredReasoning } from './model-metadata.ts'
export { traeStorageCandidates, type TraeEdition, type TraeStorageCandidate } from './paths.ts'
export { buildTraeAgentTaskBody, buildTraeCnHeaders, TRAE_CN_AGENT_TASK_PATH, TRAE_CN_TITLE_PATH, traeEndpoint } from './protocol.ts'
export { buildTraeRawChatDraft, decodeRawChatChunk, TRAE_RAW_CHAT_V1_PATH, TRAE_RAW_CHAT_V2_PATH, type RawChatDelta, type RawChatMessage, type RawChatTool } from './raw-chat.ts'
export { buildTraeFusionRawChatEnvelope, hashTraeRawChatArg, type TraeFusionRawChatEnvelope } from './raw-envelope.ts'
export { TraeRawChatUpstreamClient, type TraeRawChatClientOptions, type TraeRawChatConfig } from './raw-upstream.ts'
export { TraeFallbackUpstreamClient, type TraeFallbackUpstreamOptions } from './fallback-upstream.ts'
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
  /** The last-refreshed Trae raw directory; what the plugin card displays. */
  lastCatalog?: TraeModelInfo[]
  /** The user's ordinary-model selection, as model id (= Trae name). */
  enabledModelIds?: string[]
  /** The user's 1M selection, as base-model id. */
  enabled1mModels?: string[]
  /** Legacy generated runtime catalog; kept for backwards compatibility. */
  models?: TraeModelInfo[]
}

const modelConfig = z.object({
  id: z.string().required(),
  name: z.string().required(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  input: z.array(z.union(['text', 'image'])),
})

export const Config: z<Config> = z.object({
  authFile: z.string().description('Optional Trae storage.json path override'),
  edition: z.union(['auto', 'cn', 'sg', 'solo', 'solo-sg']).default('auto').description('Trae edition hint'),
  lastCatalog: z.array(modelConfig).description('Last refreshed Trae raw model directory shown by the plugin card') as z<TraeModelInfo[]>,
  enabledModelIds: z.array(z.string()).default([]).description('Trae model ids the user enabled'),
  enabled1mModels: z.array(z.string()).default([]).description('Trae model ids whose 1M variants are enabled'),
  models: z.array(modelConfig).description('Legacy generated Trae model list') as z<TraeModelInfo[]>,
})

export function apply(ctx: Context, config: Config): void {
  const catalog = new TraeCatalog()
  const enabledSet = (value: Config): ReadonlySet<string> => new Set(value.enabledModelIds ?? [])
  const enabled1mSet = (value: Config): ReadonlySet<string> => new Set(value.enabled1mModels ?? [])
  // Runtime catalog derives from the last-refreshed raw directory plus the
  // user's selection. The legacy `models` field remains as a fallback for
  // configurations saved before this split.
  const configuredModels = (value: Config): readonly TraeModelInfo[] => {
    if (value.lastCatalog?.length) return deriveCatalog(value.lastCatalog, enabledSet(value), enabled1mSet(value))
    return value.models?.length ? value.models : FALLBACK_TRAE_MODELS
  }
  // What the plugin card displays: the last-refreshed raw directory, so the
  // user re-reads the current Trae catalog rather than a stale saved snapshot.
  const displayModels = (value: Config): readonly TraeModelInfo[] =>
    value.lastCatalog?.length ? value.lastCatalog : (value.models?.length ? value.models : FALLBACK_TRAE_MODELS)
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
  let current = () => config
  let invalidateAdapter = (): void => {}
  const discoverModels = async (signal?: AbortSignal): Promise<readonly TraeModelInfo[]> => {
    const discovered = await remote.fetchModels(signal)
    // Discovery is a draft operation: do not mutate the runtime catalog until
    // the user explicitly saves the selected snapshot and 1M switches.
    return discoveredCatalog(discovered, new Set())
  }
  ctx.inject(['webServer'], (webCtx) => registerTraeUsageRoute(webCtx, {
    store,
    client: usageClient,
    displayModels: () => displayModels(current()),
    enabledModelIds: () => current().enabledModelIds ?? [],
    enabled1mModelIds: () => current().enabled1mModels ?? [],
    discoverModels,
  }))

  installSettingsSection(ctx, TRAE_SETTINGS_NS, Config, config, {
    setSource(source) { current = source },
    onChange() {
      const next = current()
      store.setSource(next.authFile, next.edition ?? 'auto')
      catalog.set(configuredModels(next))
      invalidateAdapter()
    },
  })

  let stopped = false
  ctx.effect(() => () => {
    stopped = true
    void shim.close()
  })

  void shim.ready.then(() => {
    if (stopped) return
    catalog.set(configuredModels(current()))
    const trae = createTraeAdapter({
      shim,
      catalog,
      resolveAttachments: () => ctx.get('attachments'),
    })
    invalidateAdapter = () => { trae.invalidate() }
    let releaseAdapter: (() => void) | undefined
    let releaseDirectory: (() => void) | undefined
    try {
      releaseAdapter = ctx.llm.registerAdapter([TRAE_PROVIDER], trae.adapter)
      ctx.llm.registerModelDiscovery(TRAE_SETTINGS_NS, async (request) => {
        if (request.provider !== TRAE_PROVIDER) return []
        const next = await discoverModels(request.signal)
        return next.map(model => ({
          id: model.id,
          name: model.name,
          ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
          ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
        }))
      })
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
