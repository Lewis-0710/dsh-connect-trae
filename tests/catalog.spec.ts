import { describe, expect, it } from 'vitest'
import { FALLBACK_TRAE_MODELS, TraeCatalog } from '../src/catalog.ts'

describe('Trae catalog', () => {
  it('starts with a conservative non-empty fallback', () => {
    const catalog = new TraeCatalog()
    expect(catalog.current()).toEqual(FALLBACK_TRAE_MODELS)
    expect(catalog.current().every(model => model.contextWindow > 0 && model.maxTokens > 0)).toBe(true)
  })

  it('rejects replacing the catalog with an empty list', () => {
    expect(() => new TraeCatalog().set([])).toThrow(/cannot be empty/)
  })
})
