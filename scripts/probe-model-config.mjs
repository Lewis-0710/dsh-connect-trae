#!/usr/bin/env node
/** Read-only metadata probe for Trae's model detail endpoint. */
import {
  buildTraeCnHeaders,
  buildTraeModelDetailRequest,
  readTraeIdentity,
  refreshTraeCredential,
  TraeCredentialStore,
  TRAE_MODEL_DETAIL_PATH,
  traeEndpoint,
  traeStorageCandidates,
} from '../lib/index.js'

const live = process.argv.includes('--live')
const configName = process.argv.find(arg => arg.startsWith('--config='))?.slice('--config='.length) ?? ''
const custom = process.argv.includes('--custom')
const candidate = traeStorageCandidates().find(item => item.edition === 'cn')
if (!candidate) throw new Error('no CN Trae storage candidate')
const store = new TraeCredentialStore({ storagePath: candidate.path, edition: 'cn', refresh: refreshTraeCredential })
const credential = await store.resolve()
const identity = await readTraeIdentity(candidate)
const requestId = crypto.randomUUID()
const headers = buildTraeCnHeaders(credential, identity, { requestId, profile: 'model-detail' })
const endpoint = traeEndpoint('https://trae-api-cn.mchost.guru', TRAE_MODEL_DETAIL_PATH)
const body = buildTraeModelDetailRequest(configName, custom)
const base = {
  mode: live ? 'live' : 'dry-run', endpoint, headerNames: Object.keys(headers).sort(), bodyKeys: Object.keys(body).sort(),
  functions: body.functions, functionCount: body.functions.length, agentType: body.agent_type,
  currentConfig: { configured: body.current_config_info.config_name !== '', custom: body.current_config_info.is_custom_model },
  fallbackEndpoints: [],
}
if (!live) { console.log(JSON.stringify(base, null, 2)); process.exit(0) }
const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
const text = await response.text()
let parsed
try { parsed = JSON.parse(text) } catch { parsed = undefined }
function describe(value, depth = 0) {
  if (depth > 7) return { type: 'depth-limit' }
  if (Array.isArray(value)) return { type: 'array', length: value.length, items: value.slice(0, 4).map(item => describe(item, depth + 1)) }
  if (value && typeof value === 'object') return {
    type: 'object', keys: Object.keys(value).sort(),
    children: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, /token|secret|key|auth|user|account/i.test(key) ? { type: 'redacted' } : describe(child, depth + 1)])),
  }
  return { type: value === null ? 'null' : typeof value, ...typeof value === 'string' ? { length: value.length, value: value.length <= 80 ? value : undefined } : typeof value === 'number' || typeof value === 'boolean' ? { value } : {} }
}
console.log(JSON.stringify({
  ...base,
  httpStatus: response.status,
  contentType: response.headers.get('content-type'),
  responseShape: parsed === undefined ? { type: 'non-json', length: text.length } : describe(parsed),
}, null, 2))
