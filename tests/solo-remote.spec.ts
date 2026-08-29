import { describe, expect, it, vi } from 'vitest'
import { serializeTraeConversation, TraeSoloRemoteClient } from '../src/solo-remote.ts'
import type { TraeCredential } from '../src/auth.ts'

const credential: TraeCredential = { accessToken: 'eyJhbGciOiJSUzI1NiJ9.eyJkYXRhIjp7ImlkIjoiMTI3MjU3NzA3ODM0NDQ3MiJ9LCJleHAiOjk5OTk5OTk5OTl9.signature', userId: 'uid', host: 'https://host', expiresAtMs: Date.now() + 1000, edition: 'solo', source: 'desktop' }

describe('TraeSoloRemoteClient', () => {
  it('preserves complete ordered DSH text context, including cwd-bearing system instructions', () => {
    expect(serializeTraeConversation([
      { role: 'system', content: 'Current working directory: /workspace/project' },
      { role: 'assistant', content: 'I will inspect it.' },
      { role: 'tool', content: 'package.json contents' },
      { role: 'user', content: 'Continue.' },
    ])).toBe('<dsh-message role="system">\nCurrent working directory: /workspace/project\n</dsh-message>\n\n<dsh-message role="assistant">\nI will inspect it.\n</dsh-message>\n\n<dsh-message role="tool">\npackage.json contents\n</dsh-message>\n\n<dsh-message role="user">\nContinue.\n</dsh-message>')
    expect(serializeTraeConversation([{ role: 'user', content: 'hi' }])).toBe('hi')
  })

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
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined
    expect(request?.body).toContain('Reply with exactly: OK')
  })

  it('rejects when session creation fails', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 1, message: 'rate limited' }), { status: 429 }))
    const client = new TraeSoloRemoteClient({ credential: async () => credential, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(client.chat([{ role: 'user', content: 'hi' }], 'DeepSeek-V4-Flash')).rejects.toThrow(/session creation failed/)
  })

  it('parses model capabilities from the preferred solo_agent_remote group', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 0, data: { list: [
      { function: 'solo_agent_remote', models: [{
        name: 'qwen3.8-max', display_name: 'Qwen3.8-Max', multimodal: true, max_mode: true,
        context_window_tokens: { dev: 200000, max: 1000000 },
        reasoning_effort_config: { support_thinking: true, options: ['light', 'high', 'extra_high'], default_level: 'high' },
        features: JSON.stringify({ consumption_rate: { enable: true, data: { rate: 1.5 } }, reasoning: { enable: true } }),
      }] },
      { function: 'solo_work_remote', models: [{ name: 'ignored' }] },
    ] } }), { status: 200 }))
    const client = new TraeSoloRemoteClient({ credential: async () => credential, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(client.fetchModels()).resolves.toEqual([{
      id: 'qwen3.8-max', name: 'Qwen3.8-Max', multimodal: true,
      contextWindow: 200000, maxContextWindow: 1000000, creditMultiplier: 1.5,
      reasoningSupported: true,
      reasoning: { supported: ['low', 'high', 'xhigh'], defaultEffort: 'high' },
    }])
  })
})
