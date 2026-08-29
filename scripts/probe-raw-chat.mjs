#!/usr/bin/env node
/**
 * Controlled Trae Raw Chat probe. Dry-run is the default. Pass --live only
 * with explicit human approval; output is structural and never prints secrets
 * or generated content.
 */
import {
  buildTraeCnHeaders,
  buildTraeRawChatDraft,
  buildTraeFusionRawChatEnvelope,
  readTraeCachedModel,
  readTraeIdentity,
  refreshTraeCredential,
  TraeCredentialStore,
  SseDecoder,
  TRAE_RAW_CHAT_V2_PATH,
  traeEndpoint,
  traeStorageCandidates,
} from '../lib/index.js'

const live = process.argv.includes('--live')
const editionArg = process.argv.find(arg => arg.startsWith('--edition='))?.slice('--edition='.length) ?? 'cn'
if (!['cn', 'solo'].includes(editionArg)) throw new Error('probe supports only evidenced CN contracts: cn or solo')
const candidate = traeStorageCandidates().find(item => item.edition === editionArg)
if (!candidate) throw new Error(`no ${editionArg} storage candidate on this platform`)
const store = new TraeCredentialStore({ storagePath: candidate.path, edition: candidate.edition, refresh: refreshTraeCredential })
const credential = await store.resolve()
const identity = await readTraeIdentity(candidate)
const requestId = crypto.randomUUID()
const headers = buildTraeCnHeaders(credential, identity, { requestId, profile: 'raw-chat' })
const envelopeMode = process.argv.includes('--fusion-envelope')
const model = process.argv.find(arg => arg.startsWith('--model='))?.slice('--model='.length) ?? 'qwen-3.7-plus'
const core = buildTraeRawChatDraft({
  model,
  messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
  maxTokens: 8,
  temperature: 0,
})
const cached = envelopeMode ? await readTraeCachedModel('solo_agent', model, credential.userId).catch(() => undefined) : undefined
const body = envelopeMode
  ? buildTraeFusionRawChatEnvelope(core, {
      config_name: model,
      model_name: model,
      pass_back_reasoning: true,
      ...cached?.customConfig === undefined ? {} : { custom_config: cached.customConfig },
      ...cached?.promptMaxTokens === undefined ? {} : { prompt_max_tokens: cached.promptMaxTokens },
      ...cached?.maxTokens === undefined ? {} : { max_tokens: cached.maxTokens },
      ...cached?.maxTurn === undefined ? {} : { max_turn: cached.maxTurn },
      ...cached?.modelType === undefined ? {} : { model_type: cached.modelType },
      ...cached?.multimodal === undefined ? {} : { multimodal: cached.multimodal },
    })
  : core
const target = traeEndpoint('https://trae-api-cn.mchost.guru', TRAE_RAW_CHAT_V2_PATH)
const summary = {
  mode: live ? 'live' : 'dry-run',
  edition: candidate.edition,
  endpoint: target,
  method: 'POST',
  headerNames: Object.keys(headers).sort(),
  envelopeMode,
  cachedConfigFound: cached !== undefined,
  cachedConfigKeys: cached === undefined ? [] : Object.keys(cached).sort(),
  bodyKeys: Object.keys(body).sort(),
  messageRoles: core.messages.map(message => message.role),
  messageCount: core.messages.length,
  promptCharacters: typeof core.messages[0]?.content === 'string' ? core.messages[0].content.length : 0,
  machineIdLength: identity.machineId.length,
  deviceIdLength: identity.deviceId.length,
  fallbackEndpoints: [],
}

if (!live) {
  console.log(JSON.stringify(summary, null, 2))
  process.exit(0)
}

const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 30_000)
try {
  const response = await fetch(target, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
  const result = {
    ...summary,
    httpStatus: response.status,
    contentType: response.headers.get('content-type'),
    eventStructures: [],
    errorStructure: undefined,
  }
  if (!response.ok) {
    const text = (await response.text()).slice(0, 8192)
    let parsed
    try { parsed = JSON.parse(text) } catch { parsed = undefined }
    result.errorStructure = parsed && typeof parsed === 'object'
      ? { keys: Object.keys(parsed), nestedKeys: Object.fromEntries(Object.entries(parsed).filter(([, value]) => value && typeof value === 'object').map(([key, value]) => [key, Object.keys(value)])) }
      : { kind: 'non-json', length: text.length }
  } else if (response.body) {
    const decoder = new TextDecoder()
    const sse = new SseDecoder()
    const reader = response.body.getReader()
    const structures = new Set()
    let events = 0
    while (events < 30) {
      const next = await reader.read()
      if (next.done) break
      for (const event of sse.push(decoder.decode(next.value, { stream: true }))) {
        events += 1
        let value
        try { value = JSON.parse(event.data) } catch { value = event.data }
        const descriptor = JSON.stringify({
          event: event.event ?? '(data-only)',
          dataType: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value,
          keys: value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : [],
          choiceKeys: value?.choices?.[0] && typeof value.choices[0] === 'object' ? Object.keys(value.choices[0]).sort() : [],
          deltaKeys: value?.choices?.[0]?.delta && typeof value.choices[0].delta === 'object' ? Object.keys(value.choices[0].delta).sort() : [],
        })
        structures.add(descriptor)
      }
    }
    controller.abort()
    result.eventStructures = [...structures].map(item => JSON.parse(item))
  }
  console.log(JSON.stringify(result, null, 2))
} finally {
  clearTimeout(timeout)
}
