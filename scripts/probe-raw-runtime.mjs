#!/usr/bin/env node
/** Probe through the production TraeRawChatUpstreamClient path; dry-run first. */
import {
  buildTraeRawChatRuntimeConfig,
  classifyTraeRawChatFailure,
  readTraeCachedModel,
  readTraeIdentity,
  refreshTraeCredential,
  TraeCredentialStore,
  TraeRawChatUpstreamClient,
  traeStorageCandidates,
} from '../lib/index.js'

const live = process.argv.includes('--live')
const model = process.argv.find(arg => arg.startsWith('--model='))?.slice('--model='.length) ?? 'qwen-3.7-plus'
const candidate = traeStorageCandidates().find(item => item.edition === 'cn')
if (!candidate) throw new Error('no CN Trae storage candidate')
const store = new TraeCredentialStore({ storagePath: candidate.path, edition: 'cn', refresh: refreshTraeCredential })
const credential = await store.resolve()
const identity = await readTraeIdentity(candidate)
const cached = await readTraeCachedModel('solo_agent', model, credential.userId).catch(() => undefined)
const runtime = buildTraeRawChatRuntimeConfig(model, cached, {
  passBackReasoning: true,
  nativeFunctionCall: cached?.customConfig?.native_function_call === true,
  useV2Process: cached?.customConfig?.use_v2_process === true,
})
const summary = {
  mode: live ? 'live' : 'dry-run', model, cached: cached !== undefined,
  runtimeKeys: Object.keys(runtime).sort(),
  customConfigKeys: runtime.customConfig === undefined ? [] : Object.keys(runtime.customConfig).sort(),
  request: { messageCount: 1, toolCount: 0, reasoningEffort: 'high', maxTokens: 8 },
}
if (!live) { console.log(JSON.stringify(summary, null, 2)); process.exit(0) }
const client = new TraeRawChatUpstreamClient({
  credential: async () => credential,
  identity: async () => identity,
  config: { model, configName: model, passBackReasoning: true, runtime },
  baseUrl: 'https://trae-api-cn.mchost.guru',
})
const result = await client.chatStream(JSON.stringify({
  messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
  reasoning_effort: 'high',
  max_tokens: 8,
  temperature: 0,
}))
if (!result.ok) {
  console.log(JSON.stringify({ ...summary, result: { ok: false, status: result.status, kind: result.kind, failureReason: classifyTraeRawChatFailure(result.message), messageLength: result.message.length } }, null, 2))
  process.exit(0)
}
console.log(JSON.stringify({ ...summary, result: { ok: true, status: result.response.status, contentType: result.response.headers.get('content-type') } }, null, 2))
result.response.body?.cancel().catch(() => {})
