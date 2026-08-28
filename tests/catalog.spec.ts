import { describe, expect, it } from 'vitest'
import { discoveredCatalog, FALLBACK_TRAE_MODELS, TraeCatalog } from '../src/catalog.ts'

describe('Trae catalog', () => {
  it('starts with identity-only fallback entries', () => {
    const catalog = new TraeCatalog()
    expect(catalog.current()).toEqual(FALLBACK_TRAE_MODELS)
    expect(catalog.current().some(model => model.id === 'DeepSeek-V4-Flash')).toBe(true)
    expect(catalog.current().every(model => model.contextWindow === undefined)).toBe(true)
  })

  it('uses verified metadata and creates only enabled verified 1M variants', () => {
    const models = discoveredCatalog([{
      id: 'qwen3.8-max', name: 'Qwen3.8-Max', multimodal: true,
      contextWindow: 200000, maxContextWindow: 1000000, creditMultiplier: 1.5,
      reasoningSupported: true,
      reasoning: { supported: ['low', 'high', 'xhigh'], defaultEffort: 'high' },
    }], new Set(['qwen3.8-max']))
    expect(models).toEqual([
      expect.objectContaining({ id: 'qwen3.8-max', contextWindow: 200000, creditMultiplier: 1.5 }),
      expect.objectContaining({ id: 'qwen3.8-max@1m', contextWindow: 1000000, baseModelId: 'qwen3.8-max', maxContext: true }),
    ])
  })

  it('rejects replacing the catalog with an empty list', () => {
    expect(() => new TraeCatalog().set([])).toThrow(/cannot be empty/)
  })
})
