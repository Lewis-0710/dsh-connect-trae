import type { TraeReasoningEffort } from './reasoning.ts'

export interface TraeModelContextWindows {
  dev?: number
  max?: number
}

export interface TraeDiscoveredReasoning {
  supported: TraeReasoningEffort[]
  defaultEffort?: TraeReasoningEffort
}

export interface TraeDiscoveredModel {
  id: string
  name: string
  multimodal: boolean
  requiresMembership?: boolean
  contextWindow?: number
  maxContextWindow?: number
  creditMultiplier?: number
  reasoningSupported: boolean
  reasoning?: TraeDiscoveredReasoning
}

interface RawTraeRemoteModel {
  name?: unknown
  display_name?: unknown
  multimodal?: unknown
  max_mode?: unknown
  context_window_tokens?: unknown
  context_window_size?: unknown
  prompt_max_tokens?: unknown
  reasoning_effort_config?: unknown
  features?: unknown
}

function finitePositive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function parseFeatures(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || value === '') return undefined
  try { return record(JSON.parse(value) as unknown) } catch { return undefined }
}

const EFFORT_MAP: Readonly<Record<string, TraeReasoningEffort>> = {
  light: 'low',
  high: 'high',
  extra_high: 'xhigh',
}

/** Parse only capabilities explicitly advertised by Trae's remote model API. */
export function parseTraeRemoteModel(value: unknown): TraeDiscoveredModel | undefined {
  const raw = record(value) as RawTraeRemoteModel | undefined
  if (raw === undefined || typeof raw.name !== 'string' || raw.name === '') return undefined
  const context = record(raw.context_window_tokens)
  const features = parseFeatures(raw.features)
  const contextWindowsFeature = record(features?.['context_windows'])
  const contextWindowsData = record(contextWindowsFeature?.['data'])
  const contextWindowSize = record(raw.context_window_size)

  const dev = finitePositive(context?.['dev'])
    ?? finitePositive(contextWindowsData?.['dev_context'])
    ?? finitePositive(contextWindowSize?.['default'])
    ?? finitePositive(raw.prompt_max_tokens)

  const maxFromList = Array.isArray(contextWindowsData?.['max_context_list'])
    ? finitePositive(contextWindowsData['max_context_list'][0])
    : undefined
  const maxFromSizeList = Array.isArray(contextWindowSize?.['max'])
    ? finitePositive(contextWindowSize['max'][0])
    : undefined

  const maxVal = finitePositive(context?.['max'])
    ?? finitePositive(contextWindowsData?.['max_context'])
    ?? maxFromList
    ?? finitePositive(contextWindowSize?.['max'])
    ?? maxFromSizeList

  const max = (raw.max_mode === true || contextWindowsFeature?.['enable'] === true || maxVal !== undefined)
    && maxVal !== undefined && maxVal > (dev ?? 0)
    ? maxVal
    : undefined

  const activityDiscount = record(features?.['activity_discount'])
  const activityData = record(activityDiscount?.['data'])
  const currentDiscount = record(activityData?.['current'])
  const discountedRate = activityDiscount?.['enable'] === true ? finitePositive(currentDiscount?.['consumption_rate']) : undefined
  const consumption = record(features?.['consumption_rate'])
  const consumptionData = record(consumption?.['data'])
  const standardRate = consumption?.['enable'] === true ? finitePositive(consumptionData?.['rate']) : undefined
  const creditMultiplier = discountedRate ?? standardRate
  const reasoningFeature = record(features?.['reasoning'])
  const reasoningSupported = reasoningFeature?.['enable'] === true
  const multimodalFeature = record(features?.['multimodal'])
  const multimodal = raw.multimodal === true || multimodalFeature?.['enable'] === true
  const access = record(features?.['access'])
  const accessData = record(access?.['data'])
  const identityList = Array.isArray(accessData?.['identity_list']) ? accessData['identity_list'] : undefined
  const requiresMembership = identityList !== undefined && !identityList.includes(0)
  const reasoningConfig = record(raw.reasoning_effort_config)
  const rawOptions = Array.isArray(reasoningConfig?.['options']) ? reasoningConfig['options'] : []
  const supported = rawOptions.flatMap(option => {
    if (typeof option !== 'string') return []
    const effort = EFFORT_MAP[option]
    return effort === undefined ? [] : [effort]
  })
  const rawDefault = reasoningConfig?.['default_level']
  const mappedDefault = typeof rawDefault === 'string' ? EFFORT_MAP[rawDefault] : undefined
  const defaultEffort = mappedDefault !== undefined && supported.includes(mappedDefault) ? mappedDefault : undefined
  return {
    id: raw.name,
    name: typeof raw.display_name === 'string' && raw.display_name !== '' ? raw.display_name : raw.name,
    multimodal,
    ...requiresMembership ? { requiresMembership: true } : {},
    ...dev === undefined ? {} : { contextWindow: dev },
    ...max === undefined ? {} : { maxContextWindow: max },
    ...creditMultiplier === undefined ? {} : { creditMultiplier },
    reasoningSupported,
    ...supported.length === 0 ? {} : { reasoning: { supported, ...defaultEffort === undefined ? {} : { defaultEffort } } },
  }
}
