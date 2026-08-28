import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('controlled Raw Chat probe', () => {
  it('defaults to dry-run, uses one v2 endpoint, and redacts values', async () => {
    const source = await readFile(new URL('../scripts/probe-raw-chat.mjs', import.meta.url), 'utf8')
    expect(source).toContain("const live = process.argv.includes('--live')")
    expect(source).toContain('TRAE_RAW_CHAT_V2_PATH')
    expect(source).not.toContain('TRAE_RAW_CHAT_V1_PATH')
    expect(source).not.toContain('TRAE_CN_AGENT_TASK_PATH')
    expect(source).not.toContain('TRAE_CN_TITLE_PATH')
    expect(source).toContain('headerNames: Object.keys(headers).sort()')
    expect(source).not.toContain('console.log(headers)')
    expect(source).not.toContain('console.log(body)')
    expect(source).toContain('fallbackEndpoints: []')
  })
})
