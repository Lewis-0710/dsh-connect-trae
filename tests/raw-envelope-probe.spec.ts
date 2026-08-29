import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Raw Chat fusion envelope matrix probe', () => {
  it('is dry-run first, bounded, and never prints response bodies', async () => {
    const source = await readFile(new URL('../scripts/probe-raw-envelope-matrix.mjs', import.meta.url), 'utf8')
    expect(source).toContain("process.argv.includes('--live')")
    expect(source).toContain("id: 'object-arg-string-config'")
    expect(source).toContain("id: 'string-arg-string-config'")
    expect(source).toContain("id: 'string-arg-object-config'")
    expect(source).toContain("id: 'object-arg-object-config'")
    expect(source).toContain('responseLength: text.length')
    expect(source).not.toContain('console.log(text)')
  })
})
