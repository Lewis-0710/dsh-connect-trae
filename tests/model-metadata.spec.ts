import { describe, expect, it } from 'vitest'
import { parseTraeRemoteModel } from '../src/model-metadata.ts'

describe('Trae remote model metadata', () => {
  it('parses verified context, rate, reasoning and 1M support', () => {
    expect(parseTraeRemoteModel({
      name: 'qwen3.8-max',
      display_name: 'Qwen3.8-Max',
      multimodal: true,
      max_mode: true,
      context_window_tokens: { dev: 200000, max: 1000000 },
      reasoning_effort_config: { support_thinking: true, options: ['light', 'high', 'extra_high'], default_level: 'high' },
      features: JSON.stringify({ consumption_rate: { enable: true, data: { rate: 1.5 } }, reasoning: { enable: true }, multimodal: { enable: true } }),
    })).toEqual({
      id: 'qwen3.8-max', name: 'Qwen3.8-Max', multimodal: true,
      contextWindow: 200000, maxContextWindow: 1000000, creditMultiplier: 1.5,
      reasoningSupported: true,
      reasoning: { supported: ['low', 'high', 'xhigh'], defaultEffort: 'high' },
    })
  })

  it('does not invent levels or a 1M variant when Trae omits them', () => {
    expect(parseTraeRemoteModel({
      name: 'kimi-k2.6', display_name: 'Kimi-K2.6', multimodal: true, max_mode: false,
      context_window_tokens: { dev: 200000, max: 0 },
      features: JSON.stringify({ consumption_rate: { enable: true, data: { rate: 0.69 } }, reasoning: { enable: true } }),
    })).toEqual({
      id: 'kimi-k2.6', name: 'Kimi-K2.6', multimodal: true,
      contextWindow: 200000, creditMultiplier: 0.69, reasoningSupported: true,
    })
  })

  it('rejects malformed entries and ignores malformed feature JSON', () => {
    expect(parseTraeRemoteModel({ display_name: 'missing id' })).toBeUndefined()
    expect(parseTraeRemoteModel({ name: 'm', features: '{bad' })).toEqual({
      id: 'm', name: 'm', multimodal: false, reasoningSupported: false,
    })
  })

  it('parses requiresMembership when identity_list excludes free identity 0', () => {
    expect(parseTraeRemoteModel({
      name: 'Doubao-Seed-Evolving',
      display_name: 'Seed-Evolving',
      features: JSON.stringify({ access: { data: { identity_list: [1, 2, 3, 100] } } }),
    })).toEqual(expect.objectContaining({
      id: 'Doubao-Seed-Evolving',
      requiresMembership: true,
    }))

    const normal = parseTraeRemoteModel({
      name: 'glm-5.2',
      display_name: 'GLM-5.2',
      features: JSON.stringify({ access: { data: { identity_list: [0, 5, 1, 2, 3, 100] } } }),
    })
    expect(normal).toEqual(expect.objectContaining({ id: 'glm-5.2' }))
    expect(normal?.requiresMembership).toBeUndefined()
  })

  it('parses features when provided directly as an object (state.vscdb format)', () => {
    expect(parseTraeRemoteModel({
      name: 'Doubao-Seed-Evolving',
      display_name: 'Seed-Evolving',
      features: { consumption_rate: { enable: true, data: { rate: 0.08 } }, reasoning: { enable: true }, multimodal: { enable: true } },
    })).toEqual(expect.objectContaining({
      id: 'Doubao-Seed-Evolving',
      creditMultiplier: 0.08,
      multimodal: true,
      reasoningSupported: true,
    }))
  })

  it('prefers active activity_discount over base consumption_rate', () => {
    expect(parseTraeRemoteModel({
      name: 'Doubao-Seed-Evolving',
      display_name: 'Seed-Evolving',
      features: {
        activity_discount: {
          enable: true,
          data: { current: { consumption_rate: 0.08, discount_type: 'limited' } },
        },
        consumption_rate: { enable: true, data: { rate: 0.8 } },
      },
    })).toEqual(expect.objectContaining({
      id: 'Doubao-Seed-Evolving',
      creditMultiplier: 0.08,
    }))
  })
})
