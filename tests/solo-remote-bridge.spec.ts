import { describe, expect, it, vi } from 'vitest'
import { TraeSoloRemoteBridge } from '../src/solo-remote-bridge.ts'
import { TraeSoloRemoteClient } from '../src/solo-remote.ts'
import type { TraeCredential } from '../src/auth.ts'

const credential: TraeCredential = { accessToken: 'eyJhbGciOiJSUzI1NiJ9.eyJkYXRhIjp7ImlkIjoiMTI3MjU3NzA3ODM0NDQ3MiJ9LCJleHAiOjk5OTk5OTk5OTl9.signature', userId: 'uid', host: 'https://host', expiresAtMs: Date.now() + 1000, edition: 'solo', source: 'desktop' }

describe('TraeSoloRemoteBridge', () => {
  it('converts the polling result into OpenAI SSE', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = url.toString()
      if (href.endsWith('/chat_sessions')) return new Response(JSON.stringify({ code: 0, data: { chat_session_id: 's' } }), { status: 200 })
      return new Response(JSON.stringify({ code: 0, data: { items: [{ role: 'assistant', status: 'completed', content: JSON.stringify({ messages: [{ plan_item: { tool_call_info: { name: 'finish', params: { summary: 'OK' } } } }] }) }] } }), { status: 200 })
    })
    const remote = new TraeSoloRemoteClient({ credential: async () => credential, fetchImpl: fetchImpl as unknown as typeof fetch, pollIntervalMs: 1 })
    const bridge = new TraeSoloRemoteBridge(remote)
    const result = await bridge.chatStream(JSON.stringify({ model: 'DeepSeek-V4-Flash', messages: [{ role: 'user', content: 'hi' }] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const text = await result.response.text()
    expect(text).toContain('"content":"OK"')
    expect(text).toContain('"finish_reason":"stop"')
    expect(text).toContain('data: [DONE]')
  })

  it('forwards all ordered text messages instead of only the last user message', async () => {
    const remote = { chat: vi.fn(async () => ({ content: 'OK', sessionId: 's' })) } as unknown as TraeSoloRemoteClient
    const bridge = new TraeSoloRemoteBridge(remote)
    await bridge.chatStream(JSON.stringify({ model: 'm', messages: [
      { role: 'system', content: 'Current working directory: /repo' },
      { role: 'assistant', content: 'Earlier reply' },
      { role: 'tool', content: [{ type: 'text', text: 'tool result' }] },
      { role: 'user', content: 'Continue' },
    ] }))
    expect(remote.chat).toHaveBeenCalledWith([
      { role: 'system', content: 'Current working directory: /repo' },
      { role: 'assistant', content: 'Earlier reply' },
      { role: 'tool', content: 'tool result' },
      { role: 'user', content: 'Continue' },
    ], 'm', undefined)
  })

  it('rejects invalid input without calling remote', async () => {
    const remote = { chat: vi.fn() } as unknown as TraeSoloRemoteClient
    const bridge = new TraeSoloRemoteBridge(remote)
    await expect(bridge.chatStream('{')).resolves.toMatchObject({ ok: false, status: 400 })
    expect(remote.chat).not.toHaveBeenCalled()
  })
})
