import { describe, expect, it, vi } from 'vitest'
import { TraeRawChatUpstreamClient } from '../src/raw-upstream.ts'
import type { TraeCredential } from '../src/auth.ts'
import type { TraeIdentity } from '../src/identity.ts'

const credential: TraeCredential = { accessToken: 'at', userId: 'uid', host: 'https://host', expiresAtMs: Date.now() + 1000, edition: 'cn', source: 'desktop' }
const identity: TraeIdentity = { edition: 'cn', machineId: 'machine', deviceId: 'device', platform: 'darwin' }
const config = { model: 'glm-5.2', configName: 'glm-5.2', promptSet: 'chat_completion', abVersion: 'test-ab', passBackReasoning: true }

describe('TraeRawChatUpstreamClient', () => {
  it('requires an evidence-backed config name but permits observed None optionals', () => {
    expect(() => new TraeRawChatUpstreamClient({ credential: async () => credential, identity: async () => identity, config: { ...config, configName: '' } })).toThrow(/configName/)
    expect(() => new TraeRawChatUpstreamClient({ credential: async () => credential, identity: async () => identity, config: { model: 'glm-5.2', configName: 'glm-5.2', passBackReasoning: true } })).not.toThrow()
  })

  it('posts only v2 with config fields and returns the live response', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }))
    const client = new TraeRawChatUpstreamClient({ credential: async () => credential, identity: async () => identity, config, fetchImpl })
    const result = await client.chatStream(JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 8 }))
    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://host/api/ide/v2/llm_raw_chat')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body).toMatchObject({ model: 'glm-5.2', stream: true, config_name: 'glm-5.2', prompt_set: 'chat_completion', ab_version: 'test-ab', pass_back_reasoning: true })
  })

  it('classifies upstream errors without exposing request credentials', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('', { status: 400 }))
    const client = new TraeRawChatUpstreamClient({ credential: async () => credential, identity: async () => identity, config, fetchImpl })
    await expect(client.chatStream(JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }))).resolves.toEqual({
      ok: false, status: 400, kind: 'client', message: 'Trae Raw Chat returned HTTP 400',
    })
  })

  it('rejects malformed local requests without network access', async () => {
    const fetchImpl = vi.fn()
    const client = new TraeRawChatUpstreamClient({ credential: async () => credential, identity: async () => identity, config, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(client.chatStream('{')).resolves.toMatchObject({ ok: false, status: 400 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
