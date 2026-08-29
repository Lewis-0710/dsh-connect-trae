import { describe, expect, it } from 'vitest'
import { bridgeTraeSoloStream, TraeSoloBridge } from '../src/solo-bridge.ts'
import type { TraeUpstreamClient } from '../src/upstream.ts'

function traeStream(events: string[]): Response {
  return new Response(events.join(''), { headers: { 'content-type': 'text/event-stream' } })
}

describe('TraeSoloBridge', () => {
  it('converts Trae function_call deltas into OpenAI tool_calls', async () => {
    const upstream: TraeUpstreamClient = {
      async chatStream() {
        return { ok: true, response: traeStream([
          'event: output\ndata: {"response":"","tool_calls":[{"index":0,"id":"call-1","type":"function","function_call":{"name":"read","arguments":"{\\"file_path\\":\\"README.md\\"}"}}]}\n\n',
          'event: done\ndata: {"finish_reason":"stop"}\n\n',
        ]) }
      },
    }
    const bridge = new TraeSoloBridge(upstream)
    const result = await bridge.chatStream(JSON.stringify({ model: 'glm-5.2', messages: [{ role: 'user', content: 'read' }] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const text = await result.response.text()
    expect(text).toContain('"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"read","arguments":"{\\"file_path\\":\\"README.md\\"}"}}]')
    expect(text).toContain('"finish_reason":"tool_calls"')
    expect(text).toContain('data: [DONE]')
  })

  it('preserves split tool-call argument deltas', async () => {
    const event = (name: string, data: unknown): string => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
    const response = bridgeTraeSoloStream(traeStream([
      event('output', { tool_calls: [{ index: 0, id: 'call-2', type: 'function', function_call: { name: 'edit', arguments: '{"file"' } }] }),
      event('output', { tool_calls: [{ index: 0, function_call: { name: '', arguments: ':"a"}' } }] }),
      event('done', { finish_reason: 'stop' }),
    ]), 'm')
    const text = await response.text()
    expect(text).toContain('"name":"edit"')
    expect(text).toContain('"arguments":"{\\"file\\""')
    expect(text).toContain('"arguments":":\\"a\\"}"')
  })

  it('passes through upstream failures', async () => {
    const upstream: TraeUpstreamClient = { async chatStream() { return { ok: false, status: 402, kind: 'hard_credit', message: 'quota' } } }
    const result = await new TraeSoloBridge(upstream).chatStream('{}')
    expect(result).toEqual({ ok: false, status: 402, kind: 'hard_credit', message: 'quota' })
  })
})
