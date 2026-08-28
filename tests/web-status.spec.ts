import { describe, expect, it } from 'vitest'
import type { TraeCredential } from '../src/auth.ts'
import { TraeUsageClient, type TraeUsageOptions } from '../src/usage.ts'
import type { TraeUsageRouteOptions } from '../src/web-status.ts'
import { traeWebUsage } from '../src/web-status.ts'

const credential: TraeCredential = {
  accessToken: 'eyJhbGciOiJSUzI1NiJ9.signature',
  userId: 'uid',
  host: 'https://api.trae.cn',
  expiresAtMs: Date.now() + 1000,
  edition: 'solo',
  source: 'desktop',
}

function makeRoute(options: { fetchImpl?: typeof fetch } = {}): TraeUsageRouteOptions {
  const fetchImpl = options.fetchImpl ?? (async () => new Response('{}', { status: 200 }))
  const client = new TraeUsageClient({ credential: async () => credential, fetchImpl, baseUrl: 'https://api.trae.cn' })
  return {
    store: {
      async status() { return { state: 'signed-in', edition: 'solo', expiresAtMs: Date.now() + 1000, source: 'desktop' } },
      async resolve() { return credential },
    } as unknown as TraeUsageRouteOptions['store'],
    client,
  }
}

describe('traeWebUsage', () => {
  it('reports signed-out when no credential is present', async () => {
    const deps = makeRoute()
    deps.store = {
      async status() { return { state: 'signed-out' } },
    } as unknown as TraeUsageRouteOptions['store']
    const result = await traeWebUsage(deps)
    expect(result).toEqual({ status: 'signed-out' })
  })

  it('maps a signed-in view to the compact card document', async () => {
    let call = 0
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input)
      call += 1
      if (url.endsWith('/web_user_ent_usage')) {
        return new Response(JSON.stringify({
          is_credits_billing: true,
          is_dollar_usage_billing: false,
          is_pay_freshman: true,
          trial_status: { is_in_trial: false, trial_end_time: 0 },
          usage_summary: { total_amount: 7500, consumed_amount: 5879.63, consumption_ratio: 0.7839506666666667 },
          user_entitlement_pack_list: [
            { display_desc: '老用户福利', entitlement_base_info: { end_time: 1788340660, currency: 1, product_extra: { package_extra: { quota: { credits_limit: 2000 } } } }, usage: { credits_amount: 2000 } },
            { display_desc: '签到奖励', entitlement_base_info: { end_time: 1789837484, currency: 1, product_extra: { package_extra: { quota: { credits_limit: 200 } } } }, usage: { credits_amount: 179.6288 } },
          ],
        }), { status: 200 })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }
    const deps = makeRoute({ fetchImpl })
    const result = await traeWebUsage(deps)
    expect(result.status).toBe('signed-in')
    if (result.status !== 'signed-in') return
    expect(result.credits).toEqual({
      total: 7500,
      consumed: 5879.63,
      available: 1620.37,
      accounts: [
        { displayDesc: '老用户福利', remain: 2000, size: 2000 },
        { displayDesc: '签到奖励', remain: 179.6288, size: 200 },
      ],
    })
    expect(call).toBe(1)
  })

  it('degrades a failing credit fetch to creditsError', async () => {
    const fetchImpl = async () => { throw new Error('network down') }
    const deps = makeRoute({ fetchImpl })
    const result = await traeWebUsage(deps)
    expect(result.status).toBe('signed-in')
    if (result.status !== 'signed-in') return
    expect(result.creditsError).toContain('network down')
  })
})
