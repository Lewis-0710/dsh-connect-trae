import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('production-path Raw Chat probe', () => {
  it('is dry-run first and redacts content and credentials', async () => {
    const source = await readFile(new URL('../scripts/probe-raw-runtime.mjs', import.meta.url), 'utf8')
    expect(source).toContain("process.argv.includes('--live')")
    expect(source).toContain('new TraeRawChatUpstreamClient')
    expect(source).toContain('buildTraeRawChatRuntimeConfig')
    expect(source).toContain('messageLength: result.message.length')
    expect(source).not.toContain('console.log(result.message)')
    expect(source).not.toContain('console.log(credential)')
  })
})
