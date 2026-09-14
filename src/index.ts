import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import * as dshSettings from '@deepseek-ai/dsh-settings'
import type { SettingsSectionHooks } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createTraeAdapter, TRAE_PROVIDER } from './adapter.ts'
import { TraeCredentialStore } from './auth.ts'
import { applyImageSelection, deriveCatalog, discoveredCatalog, FALLBACK_TRAE_MODELS, fallbackModelsFor, mergeTraeModelSources, sanitizeCatalog, TraeCatalog, traeInputModalities, traeModelDisplayName, type TraeModelInfo } from './catalog.ts'
import { refreshTraeCredential, type TraeRefreshDevice } from './refresh.ts'
import { pickTraeStorageIdentity, readTraeIdentity } from './identity.ts'
import { traeStorageCandidates, type TraeEdition } from './paths.ts'
import { regionOfCredential, regionOfEdition, regionOfHost, regionOfUserRegion, REGION_GATEWAYS, type TraeRegion, type TraeRegionGateways } from './region.ts'
import { createTraeShim } from './shim.ts'
import { TraeSoloUpstreamClient } from './solo.ts'
import { TraeSoloBridge } from './solo-bridge.ts'
import { TraeSoloRemoteCatalogClient } from './solo-remote.ts'
import { TraeRawChatUpstreamClient } from './raw-upstream.ts'
import { createTraeRawGateway } from './raw-gateway.ts'
import { resolveTraeRawRuntime } from './raw-resolver.ts'
import type { TraeRawDiagnostic } from './raw-diagnostic.ts'
import { TraeDelegatingUpstreamClient } from './delegating-upstream.ts'
import { TraeUsageClient } from './usage.ts'
import { registerTraeUsageRoute } from './web-status.ts'

export { createTraeAdapter, TRAE_PROVIDER, TRAE_STREAM_IDLE_TIMEOUT_MS } from './adapter.ts'
export { normalizeTraeCredential, traeOwnAuthPath, TraeCredentialStore, type TraeCredential } from './auth.ts'
export {
  regionOfCredential,
  regionOfEdition,
  regionOfHost,
  regionOfUserRegion,
  REGION_GATEWAYS,
  type TraeRegion,
  type TraeRegionGateways,
} from './region.ts'
export { applyContextBudgets, applyImageSelection, deriveCatalog, discoveredCatalog, FALLBACK_TRAE_MODELS, FALLBACK_TRAE_MODELS_AI, fallbackModelsFor, mergeTraeModelSources, sanitizeCatalog, TraeCatalog, traeInputModalities, traeModelDisplayName, type TraeContextBudget, type TraeInputModality, type TraeModelInfo, type TraeWireModel } from './catalog.ts'
export { decryptTraeStorageValue, parseTraeAuthValue, parseTraeStorageDocument } from './decrypt.ts'
export { identityHeaders, pickTraeStorageIdentity, readTraeIdentity, type TraeIdentity } from './identity.ts'
export { parseObservedModelConfig, type TraeObservedModelConfig } from './model-config.ts'
export { parseTraeCachedModel, readTraeCachedModel, type TraeCachedModelConfig } from './model-cache.ts'
export { parseTraeModelExtraConfigLogLine, parseTraeRawChatBehaviorConfig, type TraeRawChatBehaviorConfig } from './model-extra-config.ts'
export { buildTraeModelDetailRequest, TRAE_MODEL_DETAIL_FUNCTIONS, TRAE_MODEL_DETAIL_PATH, type TraeModelDetailRequest } from './model-detail.ts'
export { parseTraeRemoteModel, type TraeDiscoveredModel, type TraeDiscoveredReasoning } from './model-metadata.ts'
export { traeStorageCandidates, type TraeEdition, type TraeStorageCandidate } from './paths.ts'
export { buildTraeAgentTaskBody, buildTraeCnHeaders, normalizeTraeVersionCode, TRAE_CN_AGENT_TASK_PATH, TRAE_CN_TITLE_PATH, TRAE_VERSION_CODE_FALLBACK, traeEndpoint } from './protocol.ts'
export { buildTraeRawChatDraft, decodeRawChatChunk, TRAE_RAW_CHAT_V1_PATH, TRAE_RAW_CHAT_V2_PATH, type RawChatDelta, type RawChatMessage, type RawChatTool } from './raw-chat.ts'
export { buildTraeFusionRawChatEnvelope, hashTraeRawChatArg, type TraeFusionRawChatEnvelope } from './raw-envelope.ts'
export { buildTraeRawChatRuntimeConfig, traeRawChatExtraInfo, type TraeRawChatRuntimeConfig } from './raw-runtime-config.ts'
export { resolveTraeRawRuntime, type TraeRawResolverResult } from './raw-resolver.ts'
export { rawCapabilityFingerprint } from './raw-fingerprint.ts'
export { rawCapabilityDiagnostic, type TraeRawDiagnostic, type TraeRawDiagnosticState } from './raw-diagnostic.ts'
export { createTraeRawGateway, type TraeRawGateway, type TraeRawGatewayOptions } from './raw-gateway.ts'
export { classifyTraeRawChatFailure, TraeRawChatUpstreamClient, type TraeRawChatClientOptions, type TraeRawChatConfig, type TraeRawChatFailureReason } from './raw-upstream.ts'
export { probeTraeRawChatCapability, type TraeRawChatCapability } from './raw-capability.ts'
export { TraeRawCapabilityState, type TraeRawCapabilitySnapshot } from './raw-capability-state.ts'
export { TraeRawCapabilityController, type TraeRawCapabilityControllerOptions } from './raw-capability-controller.ts'
export { TraeFallbackUpstreamClient, type TraeFallbackUpstreamOptions } from './fallback-upstream.ts'
export { TraeGatedUpstreamClient, type TraeGatedUpstreamOptions } from './gated-upstream.ts'
export { applyReasoningEffort, parseReasoningCapability, TRAE_REASONING_EFFORTS, type TraeReasoningCapability, type TraeReasoningEffort } from './reasoning.ts'
export { refreshTraeCredential, type TraeRefreshDevice } from './refresh.ts'
export { decodeTraeEvent, SseDecoder, type SseEvent, type TraeStreamEvent } from './sse.ts'
export { prepareSoloBody, TraeSoloUpstreamClient, TRAE_SOLO_CHAT_PATH, TRAE_SOLO_FUNCTION, TRAE_SOLO_MODELS_PATH, type TraeSoloClientOptions } from './solo.ts'
export { bridgeTraeSoloStream, TraeSoloBridge } from './solo-bridge.ts'
export { TraeSoloRemoteCatalogClient, TRAE_SOLO_REMOTE_BASE, type TraeSoloRemoteCatalogOptions } from './solo-remote.ts'
export { TraeDelegatingUpstreamClient } from './delegating-upstream.ts'
export { TRAE_PAY_BASE, TraeUsageClient, type TraeActivityRule, type TraeCheckinStatus, type TraeUsageOptions, type TraeUsagePack, type TraeUsageSnapshot, type TraeUsageSummary, type TraeUsageView } from './usage.ts'
export { registerTraeUsageRoute, traeWebUsage, type TraeUsageRouteOptions } from './web-status.ts'
export { TRAE_USAGE_PATH, type TraeWebActivity, type TraeWebCheckin, type TraeWebCredits, type TraeWebUsage } from './status-paths.ts'
export { createTraeShim, type TraeShim } from './shim.ts'
export { UnconfiguredTraeUpstreamClient, type TraeChatResult, type TraeUpstreamClient } from './upstream.ts'

export const name = 'dsh-connect-trae'
export const inject = ['llm']
/**
 * Settings namespace, as a plain lowercase literal. DSH 0.1.2 removed the
 * `settingsNamespace` brand constructor from the npm package (the Desktop
 * host still ships it as a legacy shim), and every consumer of this constant —
 * `registerModelDiscovery`, `registerConfigurableProviders`,
 * `settings.installSection`, the settings test — takes it as a kebab string,
 * so no branding is needed for either host generation.
 */
export const TRAE_SETTINGS_NS = 'trae'

/** One region's saved model state: its own directory and the user's selection within it. */
export interface TraeRegionState {
  /** The last-refreshed raw directory for this region; what the card displays. */
  lastCatalog?: TraeModelInfo[]
  /** The user's selection in this region, as model ids (= Trae name). */
  enabledModelIds?: string[]
  /** Models the user explicitly enabled for image input in this region. */
  imageModelIds?: string[]
  /** Local DSH context budget per model in this region. */
  contextBudgets?: Record<string, number>
}

export interface Config {
  authFile?: string
  edition?: 'auto' | 'cn' | 'sg' | 'solo' | 'solo-sg'
  /** Stable local account selector; tokens remain outside settings. */
  accountId?: string
  /**
   * Per-region model state, keyed `cn` | `ai`. The CN and international apps
   * expose different rosters, so each keeps its own directory and selection
   * and switching accounts never drops the other region's picks.
   */
  regions?: Partial<Record<TraeRegion, TraeRegionState>>
  /**
   * @deprecated Legacy single-slot fields from before the region split. They
   * predate international support and are read as the CN region's state when
   * `regions.cn` is absent; new writes go to `regions`.
   */
  lastCatalog?: TraeModelInfo[]
  /** @deprecated See {@link Config.lastCatalog}. */
  enabledModelIds?: string[]
  /** @deprecated See {@link Config.lastCatalog}. */
  contextBudgets?: Record<string, number>
  /** @deprecated See {@link Config.lastCatalog}. */
  imageModelIds?: string[]
  /** @deprecated Legacy generated runtime catalog; kept for backwards compatibility. */
  models?: TraeModelInfo[]
}

/**
 * One region's saved state. A config written before the region split has only
 * the flat fields: those were always captured from the CN endpoint (the
 * plugin had no international support), so they are read as the CN state and
 * only when no explicit CN slot exists. The ai region never inherits them —
 * that inheritance is exactly the bug where a stale CN directory would be
 * intersected with the international catalog and silently drop the user's
 * picks (the same failure workbuddy fixed with its region split).
 */
export function regionStateOf(config: Config, region: TraeRegion): TraeRegionState {
  const stored = config.regions?.[region]
  if (stored !== undefined) return stored
  if (region !== 'cn') return {}
  return {
    ...config.lastCatalog === undefined ? {} : { lastCatalog: config.lastCatalog },
    ...config.enabledModelIds === undefined ? {} : { enabledModelIds: config.enabledModelIds },
    ...config.imageModelIds === undefined ? {} : { imageModelIds: config.imageModelIds },
    ...config.contextBudgets === undefined ? {} : { contextBudgets: config.contextBudgets },
  }
}

const modelConfig = z.object({
  id: z.string().required(),
  name: z.string().required(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  input: z.array(z.union(['text', 'image'])),
  // Declared so the multiplier survives future hosts whose settings schema
  // might strip unknown fields; it feeds the DSH-facing display name.
  creditMultiplier: z.number(),
})

const regionStateConfig = z.object({
  lastCatalog: z.array(modelConfig).default([]),
  enabledModelIds: z.array(z.string()).default([]),
  imageModelIds: z.array(z.string()).default([]),
  contextBudgets: z.dict(z.number().step(1).min(1)).default({}),
})

export const Config: z<Config> = z.object({
  authFile: z.string().description('Optional Trae storage.json path override'),
  edition: z.union(['auto', 'cn', 'sg', 'solo', 'solo-sg']).default('auto').description('Trae edition hint'),
  accountId: z.string().description('Selected local Trae account id (never a token)'),
  regions: z.dict(regionStateConfig).default({}).description('Per-region model directory and selection, keyed cn | ai'),
  lastCatalog: z.array(modelConfig).description('Deprecated: pre-region-split CN model directory') as z<TraeModelInfo[]>,
  enabledModelIds: z.array(z.string()).default([]).description('Deprecated: pre-region-split CN selection'),
  contextBudgets: z.dict(z.number().step(1).min(1)).default({}).description('Deprecated: pre-region-split CN context budgets'),
  imageModelIds: z.array(z.string()).default([]).description('Deprecated: pre-region-split CN image opt-in'),
  models: z.array(modelConfig).description('Legacy generated Trae model list') as z<TraeModelInfo[]>,
})

export function apply(ctx: Context, config: Config): void {
  const catalog = new TraeCatalog()
  // Region of the selected account, tracked so a settings change can recompute
  // the runtime catalog without re-resolving the credential synchronously.
  // Every path that reads the credential (startup seed, discovery, card route)
  // refreshes it, so it converges on the real region. Unsigned/unresolvable
  // credentials keep the last known region so the catalog still reflects the
  // account the user last had selected.
  let currentRegion: TraeRegion = 'cn'
  const convergeRegion = async (): Promise<TraeRegion> => {
    try { currentRegion = regionOfCredential(await store.resolve()) } catch { /* keep the last known region */ }
    return currentRegion
  }
  const enabledSet = (value: Config, region: TraeRegion): ReadonlySet<string> => new Set(regionStateOf(value, region).enabledModelIds ?? [])
  const imageSet = (value: Config, region: TraeRegion): ReadonlySet<string> => new Set(regionStateOf(value, region).imageModelIds ?? [])
  // Display keys (lowercased id AND name) of every model known to be callable
  // via `llm_utils_chat`, populated once `discoverModels` merges Remote with
  // `get_detail_param`. A model whose id and name are both absent here is a dead
  // config_name (Remote advertises it, `get_detail_param` has no match, e.g.
  // `Doubao-Seed-Code` / `glm-5.3`) and must never be served — even from a stale
  // saved `lastCatalog` / `models` / `enabledModelIds` that still lists it.
  const callableKeys = new Set<string>()
  // Whether discovery has actually produced a directory this run. Only a
  // completed merge may filter anything: an empty `callableKeys` means "no wire
  // answer yet" (no credentials, startup discovery failed or still in flight)
  // and must not be read as "nothing is callable".
  let wireResolved = false
  // Drop dead rows from a (possibly stale) saved directory. No-op when the wire
  // map has not been resolved yet, so a transient network failure never hides
  // the whole catalog.
  const dropDeadModels = (rows: readonly TraeModelInfo[]): readonly TraeModelInfo[] => {
    if (!wireResolved) return rows
    return rows.filter(model =>
      callableKeys.has(model.id.trim().toLowerCase()) || callableKeys.has(model.name.trim().toLowerCase()))
  }
  // Runtime catalog derives from the last-refreshed raw directory plus the
  // user's selection and context budgets. Legacy `models` and pre-budget
  // `lastCatalog` rows are sanitized, so saved `@1m` variants cannot return.
  // Dead config_names are dropped against the live wire map, so a stale save
  // cannot resurrect `Doubao-Seed-Code` / `glm-5.3`. An empty selection serves
  // the whole directory, so a never-configured plugin still exposes models.
  // Built-in last resort. It is this plugin's own static list, never a row
  // Remote advertised, so it must NOT be run through `dropDeadModels`: the
  // live wire map can only ever confirm the ids it happens to know, and
  // filtering against it would let a partial catalog delete the safety net
  // precisely when it is needed. Its ids are the well-known Trae model names.
  // Region-scoped: the two regions expose different rosters, so an account
  // must never see the other region's fallback list.
  const fallbackModels = (value: Config, region: TraeRegion): readonly TraeModelInfo[] =>
    applyImageSelection(fallbackModelsFor(region), imageSet(value, region))
  const derive = (value: Config, raw: readonly TraeModelInfo[], region: TraeRegion): readonly TraeModelInfo[] => {
    const selectedImages = imageSet(value, region)
    const derived = deriveCatalog(applyImageSelection(sanitizeCatalog(dropDeadModels(raw)), selectedImages), enabledSet(value, region), regionStateOf(value, region).contextBudgets ?? {})
    return derived.length > 0 ? derived : fallbackModels(value, region)
  }
  // Runtime catalog for one region: that region's saved directory (explicit
  // slot, else the pre-split flat fields which are CN-only), else the legacy
  // `models` list (also CN-only), else the region's fallback.
  const configuredModels = (value: Config, region: TraeRegion): readonly TraeModelInfo[] => {
    const state = regionStateOf(value, region)
    return state.lastCatalog?.length ? derive(value, state.lastCatalog, region)
      : region === 'cn' && value.models?.length ? derive(value, value.models, region)
        : fallbackModels(value, region)
  }
  // What the plugin card displays: the region's last-refreshed raw directory,
  // so the user re-reads the current Trae catalog rather than a stale snapshot.
  const displayModels = (value: Config, region: TraeRegion): readonly TraeModelInfo[] => {
    const state = regionStateOf(value, region)
    return state.lastCatalog?.length ? dropDeadModels(sanitizeCatalog(state.lastCatalog))
      : region === 'cn' && value.models?.length ? dropDeadModels(sanitizeCatalog(value.models))
        : fallbackModelsFor(region)
  }
  const store = new TraeCredentialStore({
    ...config.authFile === undefined ? {} : { storagePath: config.authFile },
    edition: config.edition ?? 'auto',
    ...config.accountId === undefined ? {} : { accountId: config.accountId },
    // The refresh callback resolves the device identity lazily so an
    // international SOLO account refreshes with its own installation's
    // machine/device ids (the official client sends a DeviceInfo body there).
    refresh: async credential => refreshTraeCredential(credential, undefined, await refreshDeviceSafe()),
  })
  /**
   * Best-effort device identity for the SOLO-international refresh body.
   * Resolution failures degrade to omitting DeviceInfo (its being required is
   * unverified, docs/INTL_SG_EVIDENCE.md §5) rather than failing the refresh.
   */
  async function refreshDeviceSafe(): Promise<TraeRefreshDevice | undefined> {
    try {
      const value = await identity()
      return { deviceId: value.deviceId, machineId: value.machineId }
    } catch {
      return undefined
    }
  }
  const identity = async () => {
    // Prefer the selected credential's own edition so an international
    // account reads its own installation's identity (machine/device ids are
    // per-install), mirroring the credential store's account binding. The
    // explicit `edition` config still wins as the user's own narrowing.
    let preferred: TraeEdition | undefined
    try { preferred = (await store.current())?.edition } catch { /* fall through to every candidate */ }
    const hint = config.edition !== undefined && config.edition !== 'auto' ? config.edition : preferred
    // Pick the first desktop candidate whose storage file actually exists,
    // mirroring the credential store's skip-missing semantics. Windows machines
    // often install only SOLO, so pinning the first (cn) candidate and reading a
    // missing file used to throw ENOENT and break every refresh/chat request.
    const candidates = config.authFile === undefined
      ? traeStorageCandidates().filter(item => item.source === 'desktop' && (hint === undefined || item.edition === hint))
      : [{ edition: hint ?? 'solo' as const, path: config.authFile, source: 'desktop' as const }]
    if (candidates.length === 0) throw new Error('Trae storage was not found')
    return pickTraeStorageIdentity(candidates)
  }
  // No baseUrl: the chat gateway follows the selected credential's region
  // (`trae-api-cn.mchost.guru` for CN, `coresg-normal.trae.ai` for ai).
  const solo = new TraeSoloUpstreamClient({
    credential: () => store.resolve(),
    identity,
    log: (message, detail) => ctx.logger.warn(message, detail),
  })
  const remoteCatalog = new TraeSoloRemoteCatalogClient({ credential: () => store.resolve() })
  // Keep the native llm_utils_chat bridge as the only chat route: unlike the
  // polling Remote session API, it preserves Trae's structured tool_calls so
  // DSH can execute local read/write/bash tools and continue the agent loop.
  // A wire resolver maps each display model id to its real llm_utils_chat
  // config_name. It is populated once at startup from get_detail_param and
  // never depends on a user-refreshed or re-saved directory, so Seed-Code and
  // other models whose wire id differs from the display id resolve correctly
  // even on a fresh install.
  const wireById = new Map<string, string>()
  const wireByName = new Map<string, string>()
  const wireResolver = (displayId: string): string | undefined =>
    wireById.get(displayId) ?? wireByName.get(displayId.trim().toLowerCase())
  const upstream = new TraeSoloBridge(solo, catalog, wireResolver)
  // The shim always sees a stable client; the Raw gateway may replace the
  // delegate asynchronously, but it stays disabled until a probe succeeds.
  const delegating = new TraeDelegatingUpstreamClient(upstream)
  const shim = createTraeShim({ catalog, client: delegating, logger: ctx.logger })
  let rawDiagnostic = (): TraeRawDiagnostic => ({ state: 'disabled' })
  void (async () => {
    try {
      const probeModel = 'qwen-3.7-plus'
      const { identity, runtime } = await resolveTraeRawRuntime(store, probeModel)
      const rawClient = new TraeRawChatUpstreamClient({
        credential: () => store.resolve(),
        identity: async () => identity,
        config: { model: runtime.modelName, configName: runtime.configName, passBackReasoning: true, runtime },
      })
      // The raw-chat endpoint is region-scoped like every other gateway: the
      // probe model is CN-only, so a CN catalog drives this disabled path today.
      const rawRegion = regionOfCredential(await store.resolve())
      const gateway = createTraeRawGateway({
        raw: rawClient,
        solo: upstream,
        endpoint: `${REGION_GATEWAYS[rawRegion].chat}/api/ide/v2/llm_raw_chat`,
        edition: identity.edition,
        identity: { appVersion: identity.appVersion ?? '', buildVersion: identity.buildVersion ?? '' },
        runtime,
        // Raw Chat stays opt-in and unverified; SOLO remains the only live path.
        enabled: false,
      })
      delegating.replace(gateway.upstream)
      rawDiagnostic = () => gateway.diagnostic()
      ctx.effect(() => () => gateway.invalidate(), 'dsh-connect-trae: Raw capability invalidation')
    } catch (error: unknown) {
      ctx.logger.warn('dsh-connect-trae: Raw gateway unavailable; continuing with native SOLO tool-call channel', error)
    }
  })()

  // Read-only usage/credit summary served to the browser half. Optional on the
  // `webServer` seam; absent in headless runs, the host provider still works.
  //
  // Account selection is strictly the user's choice: the store resolves the
  // explicitly selected `accountId` verbatim, and only falls back to the first
  // discovered account when nothing has been selected yet. The plugin must NOT
  // silently switch to a different account that happens to have general credits
  // — that would bill the wrong account against the user's intent.
  const usageClient = new TraeUsageClient({ credential: () => store.resolve() })
  let current = () => config
  let invalidateAdapter = (): void => {}
  const discoverModels = async (signal?: AbortSignal): Promise<readonly TraeModelInfo[]> => {
    // Converge the tracked region on the selected credential first: the
    // merged catalog below is persisted into the live bridge catalog and the
    // card writes its draft into the region's own slot afterwards.
    await convergeRegion()
    // The Remote /models directory is the model skeleton (display id, name,
    // context, credit, reasoning). get_detail_param only supplies the real
    // llm_utils_chat config_name for models whose display id differs from the
    // wire id (e.g. Seed-Code); it does not define the catalog itself.
    const [remote, wire] = await Promise.all([
      remoteCatalog.fetchModels(signal),
      solo.fetchModels(signal),
    ])
    const merged = mergeTraeModelSources(remote, wire)
    // Record every callable display key (id and name) so stale saved catalogs
    // are filtered against the live wire map and dead config_names cannot be
    // resurrected from an old `lastCatalog` / `models` / `enabledModelIds`.
    callableKeys.clear()
    for (const model of merged) {
      callableKeys.add(model.id.trim().toLowerCase())
      callableKeys.add(model.name.trim().toLowerCase())
    }
    // Mark the wire map authoritative only once a merge produced rows. A live
    // Trae account that reports only part of the catalog (or an edition whose
    // `/models` list is a subset) would otherwise let this filter delete every
    // model it did not mention — including the built-in fallback set, which
    // Remote never advertised and so can never appear in `callableKeys`.
    wireResolved = merged.length > 0
    // Populate the startup wire resolver (display id and display name → wire
    // config_name) so the chat bridge resolves the real config_name even when
    // the persisted catalog lacks `wireConfigName` (the settings schema drops
    // unknown fields on save/load).
    wireById.clear()
    wireByName.clear()
    for (const model of merged) {
      if (model.wireConfigName !== undefined) {
        wireById.set(model.id, model.wireConfigName)
        wireByName.set(model.name.trim().toLowerCase(), model.wireConfigName)
      }
    }
    // Discovery is a pure data return (workbuddy semantics): the card's
    // "refresh" drafts this list for an explicit save, and the startup seed
    // below installs it into the live catalog. Writing it here would leak
    // un-enabled models into the runtime catalog until the next save.
    return merged
  }
  ctx.inject(['webServer'], (webCtx) => registerTraeUsageRoute(webCtx, {
    store,
    client: usageClient,
    // Region-scoped accessors: the card is served the signed-in account's own
    // region directory and selection, and the save writes back into that
    // region's slot.
    displayModels: region => displayModels(current(), region),
    enabledModelIds: region => regionStateOf(current(), region).enabledModelIds ?? [],
    discoverModels,
    rawDiagnostic: () => rawDiagnostic(),
  }))

  const sectionHooks: SettingsSectionHooks<Config> = {
    setSource(source) { current = source },
    onChange() {
      const next = current()
      store.setSource(next.authFile, next.edition ?? 'auto', next.accountId)
      catalog.set(configuredModels(next, currentRegion))
      invalidateAdapter()
      // The account may have changed region (CN ↔ ai); converge the runtime
      // catalog on the selected credential's own region.
      void convergeRegion().then(region => {
        catalog.set(configuredModels(current(), region))
        invalidateAdapter()
      })
    },
  }
  // DSH 0.1.2 replaced the free `installSettingsSection` helper with the
  // `settings` service's `installSection` method. The Desktop host keeps the
  // old helper as a legacy shim, but npm installs of 0.1.2 do not — and a
  // named import of a missing export fails at ESM link time, so the plugin
  // reads it defensively off the module namespace. Prefer the helper when it
  // exists (0.1.1 hosts and shimmed 0.1.2 hosts) and fall back to the service
  // method everywhere else, so one build serves both host generations.
  const legacyInstallSettingsSection = (dshSettings as {
    installSettingsSection?: (ctx: Context, ns: string, schema: z<Config>, entry: Config, hooks: SettingsSectionHooks<Config>) => void
  }).installSettingsSection
  if (typeof legacyInstallSettingsSection === 'function') {
    legacyInstallSettingsSection(ctx, TRAE_SETTINGS_NS, Config, config, sectionHooks)
  } else {
    ctx.inject(['settings'], settingsCtx => {
      settingsCtx.settings.installSection(ctx, TRAE_SETTINGS_NS, Config, config, sectionHooks)
    })
  }

  let stopped = false
  ctx.effect(() => () => {
    stopped = true
    void shim.close()
  })

  void shim.ready.then(async () => {
    if (stopped) return
    // Resolve the wire-id map once at startup before serving requests, so the
    // chat bridge can translate display ids to real config_names without the
    // user ever opening the model card or re-saving the directory.
    //
    // Startup seed (workbuddy semantics): the runtime catalog derives from the
    // LIVE directory of the selected account's region, so DSH serves what the
    // upstream actually answers today — an account on a never-configured
    // region gets its real roster (with wire ids) immediately, without
    // pressing "refresh" + "save" first. `lastCatalog` is deliberately NOT
    // seeded here: it belongs to the user's explicit save. A discovery
    // failure (no credentials, upstream down) degrades to the configured
    // state — the saved directory, else the region's fallback.
    try {
      const models = await discoverModels()
      if (stopped) return
      catalog.set(derive(current(), models, currentRegion))
    } catch (error: unknown) {
      ctx.logger.warn('dsh-connect-trae: live model directory unavailable; serving the configured catalog', error)
      catalog.set(configuredModels(current(), currentRegion))
    }
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
      ctx.llm.registerModelDiscovery(TRAE_SETTINGS_NS, async (request, signal) => {
        if (request.provider !== TRAE_PROVIDER) return []
        // Discovery must advertise the same image capability as the live
        // adapter catalog. The upstream flag is deliberately ignored; only the
        // user's explicit `imageModelIds` selection is authoritative.
        //
        // DSH 0.1.2 moved discovery cancellation from `request.signal` onto
        // the callback's second argument; 0.1.1 hosts still pass it on the
        // request object, so read both.
        const cancellation = signal ?? (request as { signal?: AbortSignal }).signal
        const next = applyImageSelection(
          await discoverModels(cancellation),
          imageSet(current(), currentRegion),
        )
        return next.map(model => ({
          id: model.id,
          name: traeModelDisplayName(model),
          ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
          ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
          // Current dsh-llm discovery types do not yet declare this field, but
          // model-management consumers already understand it. Keep the value
          // aligned with the adapter catalog; DSH core may discard it today.
          inputModalities: traeInputModalities(model),
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
