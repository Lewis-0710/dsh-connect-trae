import { describe, expect, it } from 'vitest'
import { buildTraeAgentTaskBody, buildTraeCnHeaders, TRAE_CN_AGENT_TASK_PATH, TRAE_CN_TITLE_PATH, traeEndpoint } from '../src/protocol.ts'
import type { TraeCredential } from '../src/auth.ts'
import type { TraeIdentity } from '../src/identity.ts'

const credential: TraeCredential = {
  accessToken: 'secret-access', refreshToken: 'secret-refresh', userId: 'uid', host: 'https://trae-api-cn.mchost.guru',
  expiresAtMs: Date.now() + 60_000, edition: 'cn', source: 'desktop',
}
const identity: TraeIdentity = {
  edition: 'cn', machineId: 'machine-stable', deviceId: 'device-stable', buildVersion: '20260716', appVersion: '3.3.79', platform: 'darwin',
}

describe('Trae CN protocol draft', () => {
  it('keeps title and agent-task endpoints semantically separate', () => {
    expect(TRAE_CN_TITLE_PATH).toBe('/api/agent/v3/llm_utils_chat')
    expect(TRAE_CN_AGENT_TASK_PATH).toBe('/api/agent/v3/create_agent_task')
    expect(TRAE_CN_TITLE_PATH).not.toBe(TRAE_CN_AGENT_TASK_PATH)
    expect(traeEndpoint('https://host/', TRAE_CN_AGENT_TASK_PATH)).toBe('https://host/api/agent/v3/create_agent_task')
  })

  it('constructs a deterministic offline body when IDs are provided', () => {
    const body = buildTraeAgentTaskBody([{ role: 'user', content: 'hello' }], 'glm-5.2', { requestId: 'req', sessionId: 'session', maxTokens: 100 })
    expect(body).toEqual({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      model: 'glm-5.2', function: 'inline_chat', stream: true, request_id: 'req', session_id: 'session', max_tokens: 100,
    })
  })

  it('uses persisted identity and matched request IDs in CN headers', () => {
    const headers = buildTraeCnHeaders(credential, identity, { requestId: 'request-one' })
    expect(headers).toMatchObject({
      Authorization: 'Cloud-IDE-JWT secret-access', 'X-Cloudide-Token': 'secret-access', 'x-uid': 'uid',
      'x-machine-id': 'machine-stable', 'x-device-id': 'device-stable', 'x-device-type': 'mac',
      'x-request-id': 'request-one', 'x-trae-request-id': 'request-one', Accept: 'text/event-stream',
    })
  })

  it('refuses to reuse the CN request contract for SG', () => {
    expect(() => buildTraeCnHeaders({ ...credential, edition: 'sg' }, { ...identity, edition: 'sg' })).toThrow(/not verified/)
  })
})
