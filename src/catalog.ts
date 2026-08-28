export interface TraeModelInfo {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
}

/** Conservative bootstrap catalog; live protocol verification may replace it. */
export const FALLBACK_TRAE_MODELS: readonly TraeModelInfo[] = [
  { id: 'auto', name: 'Auto', contextWindow: 128_000, maxTokens: 16_000 },
  { id: 'glm-5.2', name: 'GLM-5.2', contextWindow: 128_000, maxTokens: 16_000 },
  { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', contextWindow: 128_000, maxTokens: 16_000 },
  { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', contextWindow: 128_000, maxTokens: 16_000 },
]

export class TraeCatalog {
  private models: readonly TraeModelInfo[] = FALLBACK_TRAE_MODELS

  current(): readonly TraeModelInfo[] {
    return this.models
  }

  set(models: readonly TraeModelInfo[]): void {
    if (models.length === 0) throw new Error('trae model catalog cannot be empty')
    this.models = [...models]
  }
}
