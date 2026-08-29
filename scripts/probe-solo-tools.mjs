#!/usr/bin/env node
/**
 * Controlled probe: does the SOLO *remote* channel (solo.trae.cn — the one that
 * still has work_credits) honour caller-supplied tool definitions?
 *
 * The IDE endpoint (`llm_utils_chat`) advertises `native_function_call: true`
 * for every model, but its `ide_credits` bucket is empty (4008). This channel is
 * the opposite: it has credits, and its `plan_item.tool_call_info` payloads are
 * already visible in `solo-remote.ts` — but that code only keeps the `finish`
 * summary and drops every other tool call's name and arguments, and the create
 * request never sends `tools` at all.
 *
 * So: send `tools` this time, and dump the returned tool_call_info *completely*
 * instead of collapsing it to text. If the model echoes our tool name back, DSH
 * can execute it with local tools.
 *
 * Defaults to dry-run: no network, no credits. Redacted output.
 *
 * Usage:
 *   node scripts/probe-solo-tools.mjs                # dry-run (default)
 *   node scripts/probe-solo-tools.mjs --live         # one real short request
 */
import {
  readTraeIdentity,
  refreshTraeCredential,
  TraeCredentialStore,
  traeStorageCandidates,
} from '../lib/index.js'

const live = process.argv.includes('--live')
const candidate = traeStorageCandidates().find(item => item.edition === 'solo')
if (!candidate) throw new Error('TRAE SOLO CN storage was not found')

const store = new TraeCredentialStore({ storagePath: candidate.path, edition: 'solo', refresh: refreshTraeCredential })
const credential = await store.resolve()
await readTraeIdentity(candidate)

const BASE = 'https://solo.trae.cn/api/remote/v1'
const MODEL = 'DeepSeek-V4-Flash' // cheapest observed rate (0.08) — spend as little as possible
const token = credential.accessToken

function userIdFrom(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString('utf8'))?.data?.id ?? '0'
  } catch { return '0' }
}
const userId = userIdFrom(token)
const webId = String(Math.floor(Math.random() * 9e15) + 1e15)

const headers = {
  'Authorization': `Cloud-IDE-JWT ${token}`,
  'Content-Type': 'application/json',
  'x-trae-client-type': 'web',
  'x-trae-user-timezone': 'Asia/Shanghai',
  'x-preferenced-language': 'zh-cn',
  'Referer': 'https://solo.trae.cn/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

// The tool we ask the model to call. If the channel honours caller tools, this
// name should come back inside tool_call_info instead of Trae's own cloud tools.
const probeTool = {
  type: 'function',
  function: {
    name: 'trae_probe_echo',
    description: 'Echo a short string back. Call this tool instead of replying in text.',
    // The IDE endpoint requires parameters serialised to a JSON *string*; send
    // the same shape here in case the remote channel shares that contract.
    parameters: JSON.stringify({
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo' } },
      required: ['text'],
    }),
  },
}

const commonParams = JSON.stringify({
  language: 'zh-cn', app_language: 'en', quality: 'stable', app_version: '1.0.0.1300',
  user_identity: 'Free', is_freshman: '0', scope: 'marscode', tenant: 'marscode',
  region: 'CN', aiRegion: 'CN', solo_chat_mode: 'code', is_privacy_mode: 1, privacy_mode: 'on',
  web_id: webId, biz_user_id: userId, user_unique_id: userId,
})

const body = {
  mode: 'code', environment_id: 'default', env: 'remote', auto_create_project: false, origin: 'web',
  initial_message: {
    chat_session_id: '',
    content: [],
    query: JSON.stringify([{ type: 'text', data: { content: 'Call the trae_probe_echo tool with text "OK".' } }]),
    model_name: MODEL,
    agent_type: 'solo_agent_remote',
    model_selection_strategy: 'manual',
    custom_model: {
      name: MODEL, multimodal: false, is_default: false, display_name: MODEL,
      config_name: MODEL, config_source: 1, provider: '', ak: '', sk: '', base_url: '',
      auth_type: 0, use_remote_service: true,
    },
    common_params: commonParams,
    // The variable under test: today's production client never sends this.
    tools: [probeTool],
    tool_choice: 'auto',
  },
}

const summary = {
  mode: live ? 'live' : 'dry-run',
  channel: 'solo.trae.cn (remote / work_credits)',
  endpoint: `${BASE}/chat_sessions`,
  model: MODEL,
  probeTool: probeTool.function.name,
  sendsTools: true,
  question: 'Does the remote channel return caller-tool tool_calls DSH can execute?',
  fallbackEndpoints: [],
}

if (!live) {
  console.log(JSON.stringify({ ...summary, note: 'dry-run: no request sent, no credits consumed' }, null, 2))
  process.exit(0)
}

const createResponse = await fetch(`${BASE}/chat_sessions`, {
  method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
})
const createJson = await createResponse.json().catch(() => undefined)
if (!createResponse.ok || createJson?.code !== 0 || !createJson?.data?.chat_session_id) {
  console.log(JSON.stringify({
    ...summary,
    httpStatus: createResponse.status,
    failed: 'session creation',
    code: createJson?.code,
    message: typeof createJson?.message === 'string' ? createJson.message.slice(0, 300) : undefined,
  }, null, 2))
  process.exit(1)
}

const sessionId = createJson.data.chat_session_id
const toolNames = new Set()
const toolCallSamples = []
let lastMessageShape = undefined
let errorInfo = undefined

// Poll for the final assistant message, but this time keep every tool_call_info
// (name + params) instead of reducing it to the `finish` summary.
const deadline = Date.now() + 90_000
while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 2000))
  const resp = await fetch(`${BASE}/chat_sessions/${sessionId}/messages?page_size=50`, { headers, signal: AbortSignal.timeout(20_000) })
  if (!resp.ok) continue
  const json = await resp.json().catch(() => undefined)
  const items = json?.data?.items ?? []
  const assistant = items.find(item => item?.role === 'assistant')
  if (assistant === undefined) continue
  lastMessageShape = {
    role: assistant.role,
    status: assistant.status,
    contentType: Array.isArray(assistant.content) ? 'array' : typeof assistant.content,
  }
  // Walk the task tree: every plan_item carries a tool_call_info.
  let parsed = assistant.content
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = undefined }
  }
  const nodes = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.messages) ? parsed.messages : []
  for (const node of nodes) {
    const info = node?.plan_item?.tool_call_info
    if (info === undefined || info === null) continue
    const name = typeof info.name === 'string' ? info.name : '(no name)'
    toolNames.add(name)
    if (toolCallSamples.length < 6) {
      toolCallSamples.push({
        name,
        hasParams: info.params !== undefined,
        paramKeys: info.params && typeof info.params === 'object' ? Object.keys(info.params).sort().slice(0, 8) : [],
        hasResult: info.result !== undefined,
      })
    }
  }
  if (assistant.status !== 'in_progress' && assistant.status !== 'failed') break
  if (assistant.status === 'failed') { errorInfo = 'assistant message failed'; break }
}

console.log(JSON.stringify({
  ...summary,
  sessionCreated: true,
  lastMessage: lastMessageShape,
  errorInfo,
  toolNamesObserved: [...toolNames],
  ourToolWasCalled: toolNames.has(probeTool.function.name),
  toolCallSamples,
  verdict: toolNames.has(probeTool.function.name)
    ? 'our tool came back — DSH could execute it locally'
    : toolNames.size > 0
      ? `only Trae's own cloud tools returned (${[...toolNames].join(', ')}) — not caller-executable`
      : 'no tool_call_info at all',
}, null, 2))
