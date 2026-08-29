#!/usr/bin/env node
/**
 * Bounded Raw Chat fusion-envelope probe. Dry-run by default; --live performs
 * exactly four evidence-motivated candidates and reports structure/status only.
 */
import {
  buildTraeCnHeaders,
  buildTraeRawChatDraft,
  readTraeIdentity,
  refreshTraeCredential,
  TraeCredentialStore,
  TRAE_RAW_CHAT_V2_PATH,
  traeEndpoint,
  traeStorageCandidates,
} from '../lib/index.js'
import { createHash } from 'node:crypto'

const live = process.argv.includes('--live')
const candidate = traeStorageCandidates().find(item => item.edition === 'cn')
if (!candidate) throw new Error('no CN Trae storage candidate')
const store = new TraeCredentialStore({ storagePath: candidate.path, edition: 'cn', refresh: refreshTraeCredential })
const credential = await store.resolve()
const identity = await readTraeIdentity(candidate)
const model = 'qwen-3.7-plus'
const argObject = buildTraeRawChatDraft({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], maxTokens: 8, temperature: 0 })
const argString = JSON.stringify(argObject)
const modelConfig = { config_name: model, model_name: model, pass_back_reasoning: true }
const configString = JSON.stringify(modelConfig)
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const candidates = [
  { id: 'object-arg-string-config', body: { arg: argObject, args_hash: hash(argObject), config_json: configString } },
  { id: 'string-arg-string-config', body: { arg: argString, args_hash: hash(argString), config_json: configString } },
  { id: 'string-arg-object-config', body: { arg: argString, args_hash: hash(argString), config_json: modelConfig } },
  { id: 'object-arg-object-config', body: { arg: argObject, args_hash: hash(argObject), config_json: modelConfig } },
]
const endpoint = traeEndpoint('https://trae-api-cn.mchost.guru', TRAE_RAW_CHAT_V2_PATH)
const summary = candidates.map(item => ({ id: item.id, keys: Object.keys(item.body), argType: typeof item.body.arg, configType: typeof item.body.config_json, bytes: Buffer.byteLength(JSON.stringify(item.body)) }))
if (!live) { console.log(JSON.stringify({ mode: 'dry-run', endpoint, candidates: summary }, null, 2)); process.exit(0) }
const results = []
for (const item of candidates) {
  const headers = buildTraeCnHeaders(credential, identity, { requestId: crypto.randomUUID(), profile: 'raw-chat' })
  try {
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(item.body), signal: AbortSignal.timeout(30_000) })
    const text = await response.text()
    results.push({ id: item.id, status: response.status, contentType: response.headers.get('content-type'), responseLength: text.length, responseKind: text.trim().startsWith('{') ? 'json' : text.includes('data:') ? 'sse' : 'other' })
  } catch (error) {
    results.push({ id: item.id, transportError: error instanceof Error ? error.name : 'unknown' })
  }
}
console.log(JSON.stringify({ mode: 'live', endpoint, candidates: summary, results }, null, 2))
