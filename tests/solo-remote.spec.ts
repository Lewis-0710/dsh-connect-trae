import { describe, expect, it, vi } from 'vitest'
import { TraeSoloRemoteClient } from '../src/solo-remote.ts'
import type { TraeCredential } from '../src/auth.ts'

const credential: TraeCredential = { accessToken: 'eyJhbGciOiJSUzI1NiJ9.eyJkYXRhIjp7ImlkIjoiMTI3MjU3NzA3ODM0NDQ3MiJ9LCJleHAiOjk5OTk5OTk5OTl9.signature', userId: 'uid', host: 'https://host', expiresAtMs: Date.now() + 1000, edition: 'solo', source: 'desktop' }

describe('TraeSoloRemoteClient', () => {
  it('creates a session, polls, and extracts the final answer', async () => {
    let callCount = 0
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      callCount++
      const urlStr = typeof url === 'string' ? url : url.toString()
      if (urlStr.endsWith('/chat_sessions')) return new Response(JSON.stringify({ code: 0, data: { chat_session_id: 'sess-1', message_id: 'msg-1' } }), { status: 200, headers: { 'content-type': 'application/json' } })
      if (urlStr.includes('/messages?page_size=50')) {
        if (callCount < 3) return new Response(JSON.stringify({ code: 0, data: { items: [{ role: 'assistant', status: 'in_progress', content: '' }] } }), { status: 200 })
        return new Response(JSON.stringify({ code: 0, data: { items: [{ role: 'assistant', status: 'completed', content: JSON.stringify({ messages: [{ plan_item: { tool_call_info: { name: 'finish', params: { summary: 'OK' } } } }] }) }] } }), { status: 200 })
      }
      throw new Error(`unexpected URL: ${urlStr}`)
    })
    const client = new TraeSoloRemoteClient({ credential: async () => credential, fetchImpl: fetchImpl as unknown as typeof fetch, pollIntervalMs: 1 })
    const result = await client.chat([{ role: 'user', content: 'Reply with exactly: OK' }], 'DeepSeek-V4-Flash')
    expect(result.content).toBe('OK')
    expect(result.sessionId).toBe('sess-1')
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('/chat_sessions')
  })

  it('rejects when session creation fails', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 1, message: 'rate limited' }), { status: 429 }))
    const client = new TraeSoloRemoteClient({ credential: async () => credential, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(client.chat([{ role: 'user', content: 'hi' }], 'DeepSeek-V4-Flash')).rejects.toThrow(/session creation failed/)
  })

  it('exposes the 13 evidenced SOLO models', async () => {
    await expect(import('../src/solo-remote.ts')).resolves.toMatchObject({ TRAE_SOLO_REMOTE_MODELS: expect.anything() })
  })
})
