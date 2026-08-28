import type { TraeDiscoveredModel, TraeDiscoveredReasoning } from './model-metadata.ts'
import type { TraeReasoningEffort } from './reasoning.ts'

export interface TraeModelInfo {
  id: string
  name: string
  contextWindow?: number
  maxTokens?: number
  input?: ('text' | 'image')[]
  creditMultiplier?: number
  reasoningSupported?: boolean
  reasoning?: TraeDiscoveredReasoning
  reasoningEfforts?: Partial<Record<TraeReasoningEffort, string | null>>
  baseModelId?: string
  maxContext?: boolean
  maxContextWindow?: number
}

/** Bootstrap catalog: identity only where current Trae metadata has not been fetched yet. */
export const FALLBACK_TRAE_MODELS: readonly TraeModelInfo[] = [
  { id: 'auto', name: 'Auto' },
  { id: 'DeepSeek-V4-Flash', name: 'DeepSeek-V4-Flash' },
  { id: 'DeepSeek-V4-Pro', name: 'DeepSeek-V4-Pro' },
  { id: 'Doubao-Seed-Code', name: 'Doubao-Seed-Code', input: ['text', 'image'] },
  { id: 'kimi-k2.6', name: 'Kimi-K2.6', input: ['text', 'image'] },
]

/** Convert verified Trae API metadata into normal models and optional 1M variants. */
export function discoveredCatalog(models: readonly TraeDiscoveredModel[], enabled1m: ReadonlySet<string> = new Set()): TraeModelInfo[] {
  const result: TraeModelInfo[] = []
  for (const model of models) {
    const common = {
      input: model.multimodal ? ['text', 'image'] as ('text' | 'image')[] : ['text'] as ('text' | 'image')[],
      ...model.creditMultiplier === undefined ? {} : { creditMultiplier: model.creditMultiplier },
      reasoningSupported: model.reasoningSupported,
      ...model.reasoning === undefined ? {} : {
        reasoning: model.reasoning,
        reasoningEfforts: Object.fromEntries(model.reasoning.supported.map(effort => [effort, effort === 'low' ? 'light' : effort === 'xhigh' ? 'extra_high' : 'high'])) as Partial<Record<TraeReasoningEffort, string>>,
      },
    }
    result.push({
      id: model.id,
      name: model.name,
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.maxContextWindow === undefined ? {} : { maxContextWindow: model.maxContextWindow },
      ...common,
    })
    if (model.maxContextWindow !== undefined && enabled1m.has(model.id)) {
      result.push({
        id: `${model.id}@1m`,
        name: `${model.name} (1M)`,
        contextWindow: model.maxContextWindow,
        baseModelId: model.id,
        maxContext: true,
        ...common,
      })
    }
  }
  return result
}

export class TraeCatalog {
  private models: readonly TraeModelInfo[] = FALLBACK_TRAE_MODELS

  current(): readonly TraeModelInfo[] {
    return this.models
  }

  set(models: readonly TraeModelInfo[]): void {
    if (models.length === 0) throw new Error('trae model catalog cannot be empty')
    this.models = models.map(model => ({ ...model, ...model.input === undefined ? {} : { input: [...model.input] } }))
  }
}
