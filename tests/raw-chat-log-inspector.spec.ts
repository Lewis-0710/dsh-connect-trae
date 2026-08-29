import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Raw Chat log inspector', () => {
  it('reports only structure and does not print parsed request values', async () => {
    const source = await readFile(new URL('../scripts/inspect-raw-chat-log.mjs', import.meta.url), 'utf8')
    expect(source).toContain("'[LLMAdapter] llm_raw_chat_custom_model request:'")
    expect(source).toContain('keys: Object.keys(parsed).sort()')
    expect(source).toContain('messageCount:')
    expect(source).toContain('toolCount:')
    expect(source).not.toContain('console.log(line)')
    expect(source).not.toContain('JSON.stringify(parsed)')
  })
})
