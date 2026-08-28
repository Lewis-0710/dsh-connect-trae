#!/usr/bin/env node
/** Read-only metadata probe for Trae's model detail endpoint. */
import { buildTraeCnHeaders, readTraeIdentity, refreshTraeCredential, TraeCredentialStore, traeEndpoint, traeStorageCandidates } from '../lib/index.js'

const live = process.argv.includes('--live')
const candidate = traeStorageCandidates().find(item => item.edition === 'cn')
if (!candidate) throw new Error('no CN Trae storage candidate')
const store = new TraeCredentialStore({ storagePath: candidate.path, edition: 'cn', refresh: refreshTraeCredential })
const credential = await store.resolve()
const identity = await readTraeIdentity(candidate)
const requestId = crypto.randomUUID()
const headers = buildTraeCnHeaders(credential, identity, { requestId })
const endpoint = traeEndpoint('https://trae-api-cn.mchost.guru', '/api/ide/v1/batch_get_detail_param')
const body = {
  functions: ['builder'],
  agent_type: '',
  current_config_info: { config_name: '', is_custom_model: false },
  mode_type: 0,
  access_type: 0,
  ab_force_vids: '',
  ab_autotest_advanced_mode: 0,
}
const base = { mode: live ? 'live' : 'dry-run', endpoint, headerNames: Object.keys(headers).sort(), bodyKeys: Object.keys(body).sort(), functions: body.functions, fallbackEndpoints: [] }
if (!live) { console.log(JSON.stringify(base, null, 2)); process.exit(0) }
const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
const text = await response.text()
let parsed
try { parsed = JSON.parse(text) } catch { parsed = undefined }
function describe(value, depth = 0) {
  if (depth > 5) return { type: 'depth-limit' }
  if (Array.isArray(value)) return { type: 'array', length: value.length, items: value.slice(0, 3).map(item => describe(item, depth + 1)) }
  if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value).sort(), children: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, /token|secret|key|auth|user|account/i.test(key) ? { type: 'redacted' } : describe(child, depth + 1)])) }
  return { type: value === null ? 'null' : typeof value, ...typeof value === 'string' ? { length: value.length } : {} }
}
console.log(JSON.stringify({ ...base, httpStatus: response.status, contentType: response.headers.get('content-type'), responseShape: parsed === undefined ? { type: 'non-json', length: text.length } : describe(parsed) }, null, 2))
