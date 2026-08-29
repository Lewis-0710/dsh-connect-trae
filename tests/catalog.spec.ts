import { describe, expect, it } from 'vitest'
import { deriveCatalog, discoveredCatalog, FALLBACK_TRAE_MODELS, TraeCatalog } from '../src/catalog.ts'

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

  it('derives the runtime catalog from the raw directory plus selection', () => {
    const raw = discoveredCatalog([{
      id: 'qwen3.8-max', name: 'Qwen3.8-Max', multimodal: true,
      contextWindow: 200000, maxContextWindow: 1000000, creditMultiplier: 1.5,
      reasoningSupported: true,
      reasoning: { supported: ['low', 'high', 'xhigh'], defaultEffort: 'high' },
    }], new Set())
    const derived = deriveCatalog(raw, new Set(['qwen3.8-max']), new Set(['qwen3.8-max']))
    expect(derived).toEqual([
      expect.objectContaining({ id: 'qwen3.8-max', contextWindow: 200000 }),
      expect.objectContaining({ id: 'qwen3.8-max@1m', contextWindow: 1000000, baseModelId: 'qwen3.8-max', maxContext: true, name: 'Qwen3.8-Max 1M' }),
    ])
    // Not-enabled models never leak into the runtime catalog.
    expect(deriveCatalog(raw, new Set(), new Set())).toEqual([])
    // A 1M request without the base model enabled is dropped.
    expect(deriveCatalog(raw, new Set(['qwen3.8-max']), new Set(['other']))).toEqual([
      expect.objectContaining({ id: 'qwen3.8-max' }),
    ])
  })
})
