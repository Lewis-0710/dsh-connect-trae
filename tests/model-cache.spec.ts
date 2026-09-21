import { describe, expect, it } from 'vitest'
import { parseTraeCachedModel, readTraeLocalCatalog } from '../src/model-cache.ts'

describe('Trae cached model config', () => {
  it('keeps only safe prompt/model fields and parses custom_config', () => {
    expect(parseTraeCachedModel({
      name: 'qwen-3.7-plus', multimodal: true, model_type: 'reasoning_model',
      custom_config: '{"native_function_call":true,"use_v2_process":true}',
      prompt_max_tokens: 168000, max_tokens: 32000, max_turn: 500,
      ak: 'must-not-leak', base_url: 'must-not-leak', icon: { dark: 'must-not-leak' },
    })).toEqual({
      name: 'qwen-3.7-plus', multimodal: true, modelType: 'reasoning_model',
      customConfig: { native_function_call: true, use_v2_process: true },
      promptMaxTokens: 168000, maxTokens: 32000, maxTurn: 500,
    })
  })

  it('does not invent invalid or missing values', () => {
    expect(parseTraeCachedModel({ name: 'm', custom_config: '{bad', max_tokens: 0 })).toEqual({ name: 'm' })
    expect(parseTraeCachedModel({})).toBeUndefined()
  })

  it('gracefully returns empty array on nonexistent database path', async () => {
    const result = await readTraeLocalCatalog('cn', 'nonexistent-user', { home: '/nonexistent/path' })
    expect(result).toEqual([])
  })

  it('deduplicates models by id and display name across candidate keys', async () => {
    const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { execFileSync } = await import('node:child_process')

    const tempDir = mkdtempSync(join(tmpdir(), 'trae-test-'))
    try {
      const folder = join(tempDir, 'Library', 'Application Support', 'Trae', 'User', 'globalStorage')
      mkdirSync(folder, { recursive: true })
      const dbPath = join(folder, 'state.vscdb')
      const doc = {
        solo_agent: [
          { name: 'gemini-3.1-pro', display_name: 'Gemini-3.1-Pro-Preview', features: { context_windows: { enable: true, data: { dev_context: 200000, max_context: 1000000 } } } },
          { name: 'gemini-3-flash-solo', display_name: 'Gemini-3-Flash-Preview', features: { context_windows: { enable: true, data: { dev_context: 200000, max_context: 1000000 } } } },
        ],
        chat_v3: [
          { name: 'gemini-3-flash-premium', display_name: 'Gemini-3-Flash-Preview', features: { context_windows: { enable: true, data: { dev_context: 200000, max_context: 1000000 } } } },
          { name: 'deepseek-v3.2', display_name: 'DeepSeek-V3.2', features: { context_windows: { enable: true, data: { dev_context: 128000 } } } },
        ],
        code_review_summary: [
          { name: 'gemini-3-pro', display_name: 'Gemini-3.1-Pro-Preview', features: { context_windows: { enable: true, data: { dev_context: 200000, max_context: 1000000 } } } },
        ],
      }
      const val = JSON.stringify(doc).replace(/'/g, "''")
      execFileSync('sqlite3', [dbPath, `CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT); INSERT INTO ItemTable VALUES ('test_user_AI.agent.model.model_list_map', '${val}');`])

      const result = await readTraeLocalCatalog('ai', 'test_user', { home: tempDir, platform: 'darwin' })
      expect(result.map(model => model.id)).toEqual(['gemini-3.1-pro', 'gemini-3-flash-solo', 'deepseek-v3.2'])
      expect(result.map(model => model.name)).toEqual(['Gemini-3.1-Pro-Preview', 'Gemini-3-Flash-Preview', 'DeepSeek-V3.2'])
      expect(result[0]).toMatchObject({ contextWindow: 200000, maxContextWindow: 1000000 })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
