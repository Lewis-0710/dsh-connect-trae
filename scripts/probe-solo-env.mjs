#!/usr/bin/env node
/**
 * Controlled probe: does `env: 'local'` change tool execution ownership?
 *
 * Trae's desktop client can run tasks in a **local (this computer)** or
 * **cloud** environment; Work / Code / Design modes all support both. Our
 * production client hard-codes `env: 'remote'`, which is why every observed
 * tool call came back already executed inside ByteDance's sandbox
 * (Glob/LS/Read/Exec with `hasResult: true`) and our own tool definitions were
 * ignored.
 *
 * Under a local environment the upstream should hand back *pending* tool calls
 * (no result yet) for the caller — DSH — to execute with its own local tools.
 * So this probe sends the identical request twice, once per environment, and
 * compares whether tool calls arrive pending or already-executed.
 *
 * Defaults to dry-run: no network, no credits. Redacted output.
 *
 * Usage:
 *   node scripts/probe-solo-env.mjs                # dry-run (default)
 *   node scripts/probe-solo-env.mjs --live         # two real short requests
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
const MODEL = 'DeepSeek-V4-Flash' // cheapest observed rate (0.08)
const token = credential.accessToken

function userIdFrom(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64').toString('utf8'))?.data?.id ?? '0'
  } catch { return '0' }
}
const userId = userIdFrom(token)

const headers = {
  'Authorization': `Cloud-IDE-JWT ${token}`,
  'Content-Type': 'application/json',
  'x-trae-client-type': 'web',
  'x-trae-user-timezone': 'Asia/Shanghai',
  'x-preferenced-language': 'zh-cn',
  'Referer': 'https://solo.trae.cn/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

const probeTool = {
  type: 'function',
  function: {
    name: 'trae_probe_echo',
    description: 'Echo a short string back. Call this tool instead of replying in text.',
    parameters: JSON.stringify({
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo' } },
      required: ['text'],
    }),
  },
}

function buildBody(env, agentType) {
  const webId = String(Math.floor(Math.random() * 9e15) + 1e15)
  return {
    mode: 'code',
    environment_id: 'default',
    env, // the variable under test
    auto_create_project: false,
    origin: 'web',
    initial_message: {
      chat_session_id: '',
      content: [],
      query: JSON.stringify([{ type: 'text', data: { content: 'Call the trae_probe_echo tool with text "OK".' } }]),
      model_name: MODEL,
      agent_type: agentType,
      model_selection_strategy: 'manual',
      custom_model: {
        name: MODEL, multimodal: false, is_default: false, display_name: MODEL,
        config_name: MODEL, config_source: 1, provider: '', ak: '', sk: '', base_url: '',
        auth_type: 0, use_remote_service: true,
      },
      common_params: JSON.stringify({
        language: 'zh-cn', app_language: 'en', quality: 'stable', app_version: '1.0.0.1300',
        user_identity: 'Free', is_freshman: '0', scope: 'marscode', tenant: 'marscode',
        region: 'CN', aiRegion: 'CN', solo_chat_mode: 'code', is_privacy_mode: 1, privacy_mode: 'on',
        web_id: webId, biz_user_id: userId, user_unique_id: userId,
      }),
      tools: [probeTool],
      tool_choice: 'auto',
    },
  }
}

// env controls where the task runs; agent_type selects the mode. `lite` names
// are the non-remote (local-capable) variants observed in the model-detail
// function list.
const arms = [
  { env: 'remote', agentType: 'solo_agent_remote' },
  { env: 'local', agentType: 'solo_agent' },
  { env: 'local', agentType: 'solo_work_lite' },
]

const summary = {
  mode: live ? 'live' : 'dry-run',
  endpoint: `${BASE}/chat_sessions`,
  model: MODEL,
  probeTool: probeTool.function.name,
  question: 'Under a local environment, do tool calls arrive PENDING for DSH to execute?',
  arms: arms.map(arm => ({ ...arm })),
  fallbackEndpoints: [],
}

if (!live) {
  console.log(JSON.stringify({ ...summary, note: 'dry-run: no request sent, no credits consumed' }, null, 2))
  process.exit(0)
}

async function runArm(arm) {
  const createResponse = await fetch(`${BASE}/chat_sessions`, {
    method: 'POST', headers, body: JSON.stringify(buildBody(arm.env, arm.agentType)),
    signal: AbortSignal.timeout(30_000),
  })
  const createJson = await createResponse.json().catch(() => undefined)
  if (!createResponse.ok || createJson?.code !== 0 || !createJson?.data?.chat_session_id) {
    return {
      ...arm,
      httpStatus: createResponse.status,
      failed: 'session creation',
      code: createJson?.code,
      message: typeof createJson?.message === 'string' ? createJson.message.slice(0, 300) : undefined,
    }
  }
  const sessionId = createJson.data.chat_session_id
  const tools = []
  let status = undefined
  let errorText = undefined
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    const resp = await fetch(`${BASE}/chat_sessions/${sessionId}/messages?page_size=50`, { headers, signal: AbortSignal.timeout(20_000) })
    if (!resp.ok) continue
    const json = await resp.json().catch(() => undefined)
    const items = json?.data?.items ?? []
    const assistant = items.find(item => item?.role === 'assistant')
    if (assistant === undefined) continue
    status = assistant.status
    let parsed = assistant.content
    if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed) } catch { parsed = undefined } }
    const nodes = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.messages) ? parsed.messages : []
    for (const node of nodes) {
      const info = node?.plan_item?.tool_call_info
      if (info === undefined || info === null) continue
      tools.push({
        name: typeof info.name === 'string' ? info.name : '(no name)',
        hasParams: info.params !== undefined,
        paramKeys: info.params && typeof info.params === 'object' ? Object.keys(info.params).sort().slice(0, 8) : [],
        hasResult: info.result !== undefined, // true = already executed upstream
      })
    }
    if (status !== 'in_progress' && status !== 'failed') break
    if (status === 'failed') { errorText = 'assistant message failed'; break }
  }
  const pending = tools.filter(tool => tool.hasResult !== true)
  return {
    ...arm,
    status,
    errorText,
    toolCount: tools.length,
    tools: tools.slice(0, 8),
    pendingCount: pending.length,
    ourToolCalled: tools.some(tool => tool.name === probeTool.function.name),
    verdict: tools.some(tool => tool.name === probeTool.function.name && tool.hasResult !== true)
      ? 'PENDING caller-tool call — DSH can execute it locally'
      : tools.length === 0 ? 'no tool_call_info at all'
        : `only ${[...new Set(tools.map(t => t.name))].join(', ')} (all executed upstream=${tools.every(t => t.hasResult === true)})`,
  }
}

const results = []
for (const arm of arms) results.push(await runArm(arm))
console.log(JSON.stringify({ ...summary, results }, null, 2))
