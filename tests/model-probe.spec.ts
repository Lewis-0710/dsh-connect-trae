import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('model metadata probe', () => {
  it('is dry-run by default, targets only detail metadata, and redacts sensitive keys', async () => {
    const source = await readFile(new URL('../scripts/probe-model-config.mjs', import.meta.url), 'utf8')
    expect(source).toContain("process.argv.includes('--live')")
    expect(source).toContain('TRAE_MODEL_DETAIL_PATH')
    expect(source).toContain('buildTraeModelDetailRequest')
    expect(source).toContain("process.argv.find(arg => arg.startsWith('--config='))")
    expect(source).toContain('/token|secret|key|auth|user|account/i')
    expect(source).toContain('fallbackEndpoints: []')
    expect(source).not.toContain('llm_raw_chat')
    expect(source).not.toContain('create_agent_task')
  })
})
