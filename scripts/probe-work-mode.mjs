#!/usr/bin/env node
/**
 * Controlled probe: Work mode + local environment.
 *
 * Trae bills by mode, not by transport:
 *   - Work / Design mode -> draws Work credits first (this account has 1817)
 *   - Code mode (Solo coding agent) -> draws general credits ONLY; Work
 *     credits are invalid there (that bucket is 0 here, hence 4008).
 *
 * Every request this plugin has ever sent used `mode: 'code'` with a
 * `solo_agent*` type, so it could never spend the available Work credits. This
 * probe switches to Work mode and asks for the local execution environment,
 * then checks whether tool calls come back PENDING (for DSH to run locally)
 * instead of already executed in ByteDance's sandbox.
 *
 * Defaults to dry-run: no network, no credits. Redacted output.
 *
 * Usage:
 *   node scripts/probe-work-mode.mjs                # dry-run (default)
 *   node scripts/probe-work-mode.mjs --live         # real short requests
 */
import {
  buildTraeCnHeaders,
  prepareSoloBody,
  readTraeIdentity,
  refreshTraeCredential,
  SseDecoder,
  TraeCredentialStore,
  traeStorageCandidates,
} from '../lib/index.js'

const live = process.argv.includes('--live')
const candidate = traeStorageCandidates().find(item => item.edition === 'solo')
if (!candidate) throw new Error('TRAE SOLO CN storage was not found')

const store = new TraeCredentialStore({ storagePath: candidate.path, edition: 'solo', refresh: refreshTraeCredential })
const credential = await store.resolve()
const identity = await readTraeIdentity(candidate)

const HOST = 'https://trae-api-cn.mchost.guru'
const PATH = '/api/agent/v3/llm_utils_chat'
const MODEL = 'glm-5.2' // traework2api's known-good default for this endpoint

const probeTool = {
  type: 'function',
  function: {
    name: 'trae_probe_echo',
    description: 'Echo a short string back. Call this tool instead of replying in text.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo' } },
      required: ['text'],
    },
  },
}

/** Build the endpoint body for one mode/env combination. */
function buildBody(mode, env, agentType) {
  // prepareSoloBody sets function=solo_work_lite, config_name/model,
  // stream=true and serialises tools[].function.parameters to a JSON string.
  const core = JSON.parse(prepareSoloBody(JSON.stringify({
    model: MODEL,
    messages: [{ role: 'user', content: 'Call the trae_probe_echo tool with text "OK".' }],
    tools: [probeTool],
    tool_choice: 'auto',
    max_tokens: 64,
  })))
  return {
    ...core,
    mode,
    env,
    agent_type: agentType,
    environment_id: 'default',
    auto_create_project: false,
    origin: 'desktop',
  }
}

const arms = [
  { mode: 'code', env: 'remote', agentType: 'solo_agent_remote' }, // known-4008 baseline
  { mode: 'work', env: 'remote', agentType: 'solo_work_remote' },
  { mode: 'work', env: 'local', agentType: 'solo_work_lite' },     // the hypothesis
]

const summary = {
  mode: live ? 'live' : 'dry-run',
  endpoint: `${HOST}${PATH}`,
  model: MODEL,
  probeTool: probeTool.function.name,
  question: 'In Work mode + local env, does it bill Work credits and return PENDING tool calls?',
  arms: arms.map(arm => ({ ...arm })),
  fallbackEndpoints: [],
}

if (!live) {
  console.log(JSON.stringify({ ...summary, note: 'dry-run: no request sent, no credits consumed' }, null, 2))
  process.exit(0)
}

async function runArm(arm) {
  const headers = buildTraeCnHeaders(credential, identity)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch(`${HOST}${PATH}`, {
      method: 'POST', headers, body: JSON.stringify(buildBody(arm.mode, arm.env, arm.agentType)),
      signal: controller.signal,
    })
    const decoder = new TextDecoder()
    const sse = new SseDecoder()
    const reader = response.body?.getReader()
    const eventTypes = new Set()
    const errors = []
    const toolCalls = []
    let creditsRemaining = undefined
    let notifyUsage = undefined
    if (reader) {
      for (let count = 0; count < 80;) {
        const next = await reader.read()
        if (next.done) break
        for (const event of sse.push(decoder.decode(next.value, { stream: true }))) {
          count++
          const name = event.event ?? '(data-only)'
          eventTypes.add(name)
          let value
          try { value = JSON.parse(event.data) } catch { value = undefined }
          if (value === undefined || typeof value !== 'object') continue
          if (name === 'notify_usage') {
            notifyUsage = {
              billingMode: value.billing_mode,
              usageType: value.usage_type,
              remainCnCredits: value.remain_usage?.cn_credits,
              ideCredits: value.cn_credits_remain_info?.ide_credits,
              workCredits: value.cn_credits_remain_info?.work_credits,
            }
            creditsRemaining = value.cn_credits_remain_info
          }
          if (name === 'error' || typeof value.code === 'number' && value.code >= 4000) {
            errors.push({ code: value.code, message: String(value.message ?? '').slice(0, 300) })
          }
          // Any tool/function payload, and whether it already carries a result.
          const raw = value.tool_calls ?? value.function_call
          if (raw !== undefined && raw !== null) {
            const list = Array.isArray(raw) ? raw : [raw]
            for (const call of list) {
              const fn = call?.function ?? call?.function_call
              toolCalls.push({
                name: typeof fn?.name === 'string' ? fn.name : '(no name)',
                hasArguments: fn?.arguments !== undefined,
                hasResult: call?.result !== undefined,
              })
            }
          }
        }
      }
      await reader.cancel().catch(() => {})
    }
    return {
      ...arm,
      httpStatus: response.status,
      eventTypes: [...eventTypes],
      notifyUsage,
      errors,
      toolCallCount: toolCalls.length,
      toolCalls: toolCalls.slice(0, 6),
      ourToolCalled: toolCalls.some(call => call.name === probeTool.function.name),
      pendingCallerTool: toolCalls.some(call => call.name === probeTool.function.name && call.hasResult !== true),
      verdict: errors.some(error => /quota/i.test(error.message ?? ''))
        ? 'quota error (wrong credit bucket for this mode)'
        : toolCalls.some(call => call.name === probeTool.function.name && call.hasResult !== true)
          ? 'PENDING caller tool call — DSH can execute locally'
          : toolCalls.length === 0 ? 'no tool_calls in stream' : 'tool calls returned but all executed upstream',
    }
  } catch (error) {
    return { ...arm, transportError: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

const results = []
for (const arm of arms) results.push(await runArm(arm))
console.log(JSON.stringify({ ...summary, results }, null, 2))
