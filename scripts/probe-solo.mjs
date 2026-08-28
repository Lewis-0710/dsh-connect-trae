#!/usr/bin/env node
/** Controlled SOLO model/chat probe. Defaults to dry-run; structural output only. */
import {
  readTraeIdentity,
  refreshTraeCredential,
  SseDecoder,
  TraeCredentialStore,
  TraeSoloUpstreamClient,
  traeStorageCandidates,
} from '../lib/index.js'

const live = process.argv.includes('--live')
const requested = process.argv.find(arg => arg.startsWith('--model='))?.slice(8) ?? 'DeepSeek-V4-Flash-Official'
const skipDiscovery = process.argv.includes('--skip-discovery')
const candidate = traeStorageCandidates().find(item => item.edition === 'solo')
if (!candidate) throw new Error('TRAE SOLO CN storage was not found')
const store = new TraeCredentialStore({ storagePath: candidate.path, edition: 'solo', refresh: refreshTraeCredential })
const client = new TraeSoloUpstreamClient({ credential: () => store.resolve(), identity: () => readTraeIdentity(candidate) })
const summary = { mode: live ? 'live' : 'dry-run', edition: 'solo', requestedModel: requested, modelEndpoint: '/api/ide/v1/get_detail_param', chatEndpoint: '/api/agent/v3/llm_utils_chat', function: 'solo_work_lite', promptCharacters: 22, maxTokens: 8, fallbackEndpoints: [] }
if (!live) { console.log(JSON.stringify(summary, null, 2)); process.exit(0) }
let models = []
if (!skipDiscovery) {
  try { models = await client.fetchModels() }
  catch (error) {
    console.log(JSON.stringify({ ...summary, modelDiscovery: { ok: false, error: error instanceof Error ? error.message : String(error) }, chatSkipped: true }, null, 2))
    process.exit(1)
  }
}
const normalized = requested.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
const selected = skipDiscovery ? { id: requested } : models.find(model => model.id.toLowerCase().replaceAll(/[^a-z0-9]/g, '') === normalized)
  ?? models.find(model => model.id.toLowerCase().includes('deepseek') && model.id.toLowerCase().includes('flash'))
if (!selected) {
  console.log(JSON.stringify({ ...summary, modelFound: false, availableModelIds: models.map(model => model.id) }, null, 2))
  process.exit(2)
}
const response = await client.chatStream(JSON.stringify({ model: selected.id, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 8, stream: true }))
if (!response.ok) {
  console.log(JSON.stringify({ ...summary, modelFound: true, selectedModel: selected.id, reasoning: selected.reasoning, chat: { ok: false, status: response.status, kind: response.kind, messageLength: response.message.length } }, null, 2))
  process.exit(1)
}
const reader = response.response.body?.getReader()
const decoder = new TextDecoder()
const sse = new SseDecoder()
const structures = new Set()
if (reader) for (let count = 0; count < 30;) {
  const next = await reader.read(); if (next.done) break
  for (const event of sse.push(decoder.decode(next.value, { stream: true }))) {
    count++
    let value; try { value = JSON.parse(event.data) } catch { value = event.data }
    structures.add(JSON.stringify({ event: event.event ?? '(data-only)', dataType: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value, keys: value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : [] }))
  }
}
console.log(JSON.stringify({ ...summary, modelFound: true, selectedModel: selected.id, reasoning: selected.reasoning, chat: { ok: true, httpStatus: response.response.status, eventStructures: [...structures].map(JSON.parse) } }, null, 2))
