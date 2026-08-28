import { describe, expect, it, vi } from 'vitest'
import { prepareSoloBody, TraeSoloUpstreamClient } from '../src/solo.ts'
import { decodeTraeEvent } from '../src/sse.ts'
import type { TraeCredential } from '../src/auth.ts'
import type { TraeIdentity } from '../src/identity.ts'

const credential: TraeCredential = { accessToken: 'at', userId: 'uid', host: 'https://host', expiresAtMs: Date.now() + 1000, edition: 'solo', source: 'desktop' }
const identity: TraeIdentity = { edition: 'solo', machineId: 'machine', deviceId: 'device', appVersion: '0.1.43', platform: 'darwin' }

describe('Trae SOLO protocol', () => {
  it('converts OpenAI messages, model and tools to the evidenced SOLO format', () => {
    const prepared = JSON.parse(prepareSoloBody(JSON.stringify({
      model: 'glm-5.2', messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', tool_calls: [{ id: '1', function: { name: 'read', arguments: '{}' } }] }],
      tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object' } } }], stream: false,
    })))
    expect(prepared).toMatchObject({ model: 'glm-5.2', config_name: 'glm-5.2', function: 'solo_work_lite', stream: true })
    expect(prepared.messages[0].content).toEqual([{ type: 'text', text: 'hello' }])
    expect(prepared.messages[1].tool_calls[0].function_call).toEqual({ name: 'read', arguments: '{}' })
    expect(prepared.messages[1].tool_calls[0].function).toBeUndefined()
    expect(prepared.tools[0].function.parameters).toBe('{"type":"object"}')
  })

  it('parses model discovery including reasoning effort capabilities', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ config_info_list: [{
      config_name: 'glm-5.2', display_config: { display_name: 'GLM-5.2' },
      model_detail_list: [{ model_name: 'glm-5.2', max_input_tokens: 168000, max_output_tokens: 32000, reasoning_effort_options: ['low', 'medium', 'high'], default_reasoning_effort: 'medium' }],
    }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new TraeSoloUpstreamClient({ credential: async () => credential, identity: async () => identity, fetchImpl })
    await expect(client.fetchModels()).resolves.toEqual([{ id: 'glm-5.2', name: 'GLM-5.2', contextWindow: 168000, maxTokens: 32000, reasoning: { supported: ['low', 'medium', 'high'], defaultEffort: 'medium' } }])
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://host/api/ide/v1/get_detail_param')
  })

  it('parses SOLO output, usage and reasoning tokens', () => {
    expect(decodeTraeEvent({ event: 'output', data: '{"response":"a","reasoning_content":"r","tool_calls":[{"index":0}]}' })).toEqual({ type: 'delta', text: 'a', reasoning: 'r', toolCalls: [{ index: 0 }] })
    expect(decodeTraeEvent({ event: 'token_usage', data: '{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5,"reasoning_tokens":2}' })).toEqual({ type: 'usage', inputTokens: 2, outputTokens: 3, totalTokens: 5, reasoningTokens: 2 })
  })

  it('calls only the evidenced llm_utils_chat endpoint with required headers', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('event: done\ndata: {"finish_reason":"stop"}\n\n', { status: 200 }))
    const client = new TraeSoloUpstreamClient({ credential: async () => credential, identity: async () => identity, fetchImpl })
    const result = await client.chatStream(JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }))
    expect(result.ok).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://host/api/agent/v3/llm_utils_chat')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-Ide-Token']).toBe('at')
    expect(headers['User-Agent']).toBe('Trae/0.1.43')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
