#!/usr/bin/env node
/**
 * Controlled probe: does `llm_utils_chat` + `solo_work_lite` answer at all,
 * and can it return tool_calls that DSH executes locally?
 *
 * Same host, same path, same body — only the identity headers change, so the
 * result isolates *why* this endpoint answers 404 for us while traework2api
 * (which hard-codes an older Windows client identity) works.
 *
 * Three arms:
 *   1. spoofed        — traework2api's exact hard-coded identity (0.1.43 /
 *                       windows / 83DG) with all three token headers.
 *   2. native+tokens  — this machine's real identity, but with the same three
 *                       token headers (isolates identity from tokens).
 *   3. native-current — today's `native-curl` profile (expected 404 baseline).
 *
 * Defaults to dry-run: no network, no credits. Output is structural and
 * redacted; no token or account text is printed.
 *
 * Usage:
 *   node scripts/probe-work-identity.mjs                 # dry-run (default)
 *   node scripts/probe-work-identity.mjs --live          # real short requests
 *   node scripts/probe-work-identity.mjs --live --arm=spoofed
 */
import {
  prepareSoloBody,
  readTraeIdentity,
  refreshTraeCredential,
  SseDecoder,
  TraeCredentialStore,
  traeStorageCandidates,
} from '../lib/index.js'

const live = process.argv.includes('--live')
const armArg = process.argv.find(arg => arg.startsWith('--arm='))?.slice('--arm='.length)

const candidate = traeStorageCandidates().find(item => item.edition === 'solo')
if (!candidate) throw new Error('TRAE SOLO CN storage was not found')

const store = new TraeCredentialStore({ storagePath: candidate.path, edition: 'solo', refresh: refreshTraeCredential })
const credential = await store.resolve()
const identity = await readTraeIdentity(candidate)

const HOST = 'https://trae-api-cn.mchost.guru'
const PATH = '/api/agent/v3/llm_utils_chat'
const APP_ID = '6eefa01c-1036-4c7e-9ca5-d891f63bfcd8'

// traework2api internal/upstream/constants.go — hard-coded, "SPEC §1 实测必须".
const SPOOFED = {
  ideVersion: '0.1.43',
  ideVersionCode: '20260716',
  deviceBrand: '83DG',
  osVersion: 'Windows 11 Pro',
  deviceType: 'windows',
}

// A deliberately tiny tool. If the upstream honours caller-supplied tools, the
// model should call this instead of answering in prose.
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

/** Build one arm's header set. Token headers are the suspected missing piece. */
function buildArmHeaders(arm) {
  const token = credential.accessToken
  const traceId = crypto.randomUUID().replaceAll('-', '').slice(0, 32)
  const base = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'x-app-id': APP_ID,
    'request-traffic-type': 'prod',
    'x-custom-trace-id': traceId,
    'x-flow-traceparent': `04-${traceId}-${traceId.slice(0, 16)}-01`,
  }
  // Identity block is the only thing that differs between arm 1 and arm 2.
  const identityBlock = arm === 'spoofed'
    ? {
        'x-machine-id': identity.machineId,
        'x-device-id': identity.deviceId,
        'x-device-type': SPOOFED.deviceType,
        'x-device-brand': SPOOFED.deviceBrand,
        'x-os-version': SPOOFED.osVersion,
        'x-app-version': 'default',
        'x-ide-version': SPOOFED.ideVersion,
        'x-app-version-code': SPOOFED.ideVersionCode,
        'x-ide-version-code': SPOOFED.ideVersionCode,
        'x-ide-version-type': 'stable',
      }
    : {
        'x-machine-id': identity.machineId,
        'x-device-id': identity.deviceId,
        'x-device-type': identity.platform === 'darwin' ? 'mac' : String(identity.platform),
        'x-os-version': identity.osVersion ?? '',
        ...identity.deviceBrand === undefined ? {} : { 'x-device-brand': identity.deviceBrand },
        ...identity.deviceCpu === undefined ? {} : { 'x-device-cpu': identity.deviceCpu },
        'x-app-version': identity.appVersion ?? '',
        'x-ide-version': identity.appVersion ?? '',
        'x-app-version-code': identity.buildVersion ?? '',
        'x-ide-version-code': identity.buildVersion ?? '',
        'x-ide-version-type': 'stable',
      }

  // `native+fixcodes`: real machine/device/app-version from this machine, but the
  // version *code* uses the numeric form the server can bind. Native reads
  // iCubeLastVersion = "2.3.76922" (dotted) while the upstream binds this field
  // as a number — traework2api hard-codes "20260716". Everything else stays
  // truthful, so this arm isolates the code format as the sole variable.
  if (arm === 'native+fixcodes') {
    const real = {
      'x-machine-id': identity.machineId,
      'x-device-id': identity.deviceId,
      'x-device-type': identity.platform === 'darwin' ? 'mac' : String(identity.platform),
      'x-os-version': identity.osVersion ?? '',
      ...identity.deviceBrand === undefined ? {} : { 'x-device-brand': identity.deviceBrand },
      ...identity.deviceCpu === undefined ? {} : { 'x-device-cpu': identity.deviceCpu },
      'x-app-version': identity.appVersion ?? '',
      'x-ide-version': identity.appVersion ?? '',
      'x-app-version-code': SPOOFED.ideVersionCode,
      'x-ide-version-code': SPOOFED.ideVersionCode,
      'x-ide-version-type': 'stable',
    }
    return {
      ...base,
      ...real,
      'Authorization': `Cloud-IDE-JWT ${credential.accessToken}`,
      'X-Cloudide-Token': credential.accessToken,
      'X-Ide-Token': credential.accessToken,
    }
  }
  if (arm === 'native-current') {
    // Today's production profile: no Authorization, no X-Cloudide-Token.
    return { ...base, ...identityBlock, 'X-Ide-Token': token }
  }
  // Arms 1 and 2 both send all three token headers, as traework2api does.
  return {
    ...base,
    ...identityBlock,
    'Authorization': `Cloud-IDE-JWT ${token}`,
    'X-Cloudide-Token': token,
    'X-Ide-Token': token,
  }
}

const arms = armArg === undefined ? ['spoofed', 'native+tokens', 'native-current'] : [armArg]

// Plain OpenAI shape. `prepareSoloBody` performs the two conversions the
// upstream demands: `tools[].function.parameters` object -> JSON string (its
// Go struct types that field as `string`, which is what 4001 complained about),
// and `content` string -> [{type:'text',text}]. It also sets config_name,
// function=solo_work_lite and stream=true.
const openAIBody = {
  model: 'glm-5.2',
  messages: [{ role: 'user', content: 'Call the trae_probe_echo tool with text "OK".' }],
  tools: [probeTool],
  tool_choice: 'auto',
  max_tokens: 64,
}
const body = JSON.parse(prepareSoloBody(JSON.stringify(openAIBody)))

const summary = {
  mode: live ? 'live' : 'dry-run',
  endpoint: `${HOST}${PATH}`,
  function: 'solo_work_lite',
  question: 'Does this endpoint answer, and does it return caller-tool tool_calls?',
  toolName: probeTool.function.name,
  maxTokens: body.max_tokens,
  arms: arms.map(arm => ({
    arm,
    headerNames: Object.keys(buildArmHeaders(arm)).sort().filter(key => !/token|auth/i.test(key)),
    hasAuthorization: 'Authorization' in buildArmHeaders(arm),
    hasCloudideToken: 'X-Cloudide-Token' in buildArmHeaders(arm),
    ideVersion: buildArmHeaders(arm)['x-ide-version'],
    deviceType: buildArmHeaders(arm)['x-device-type'],
  })),
  machineIdLength: identity.machineId.length,
  deviceIdLength: identity.deviceId.length,
  fallbackEndpoints: [],
}

if (!live) {
  console.log(JSON.stringify({ ...summary, note: 'dry-run: no request sent, no credits consumed' }, null, 2))
  process.exit(0)
}

/** Send one arm and report structurally; never echo generated content. */
async function runArm(arm) {
  const headers = buildArmHeaders(arm)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(`${HOST}${PATH}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let parsed
      try { parsed = JSON.parse(text) } catch { parsed = undefined }
      return {
        arm,
        httpStatus: response.status,
        ok: false,
        errorShape: parsed && typeof parsed === 'object'
          ? { keys: Object.keys(parsed).sort() }
          : { nonJson: true, length: text.length },
        // The server's own diagnostic. This is the whole point of the probe:
        // it names what the request is missing. Truncated, never token-like.
        serverCode: parsed && typeof parsed['code'] !== 'undefined' ? parsed['code'] : undefined,
        serverMessage: parsed && typeof parsed['message'] === 'string' ? parsed['message'].slice(0, 500) : undefined,
      }
    }
    const decoder = new TextDecoder()
    const sse = new SseDecoder()
    const reader = response.body?.getReader()
    const eventStructures = new Set()
    const toolCallEvents = []
    const errorMessages = []
    let sawToolCall = false
    if (reader) {
      for (let count = 0; count < 60;) {
        const next = await reader.read()
        if (next.done) break
        for (const event of sse.push(decoder.decode(next.value, { stream: true }))) {
          count++
          let value
          try { value = JSON.parse(event.data) } catch { value = event.data }
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            eventStructures.add(JSON.stringify({
              event: event.event ?? '(data-only)',
              keys: Object.keys(value).sort().filter(key => !/token|secret|key|auth|user/i.test(key)),
            }))
            const raw = value.tool_calls ?? value.function_call
            if (raw !== undefined && raw !== null) {
              sawToolCall = true
              toolCallEvents.push({
                event: event.event ?? '(data-only)',
                shape: Array.isArray(raw) ? 'array' : typeof raw,
                keys: Array.isArray(raw) ? Object.keys(raw[0] ?? {}).sort() : Object.keys(raw).sort(),
              })
            }
            // Surface the upstream's own error text: it names what is wrong.
            if ((event.event ?? '') === 'error' || typeof value['message'] === 'string') {
              errorMessages.push({
                event: event.event ?? '(data-only)',
                code: value['code'],
                message: String(value['message']).slice(0, 500),
              })
            }
          }
        }
      }
      await reader.cancel().catch(() => {})
    }
    return {
      arm,
      httpStatus: response.status,
      ok: true,
      contentType: response.headers.get('content-type'),
      eventStructures: [...eventStructures].map(JSON.parse),
      sawToolCall,
      toolCallEventCount: toolCallEvents.length,
      toolCallEvents: toolCallEvents.slice(0, 5),
      errorMessages: errorMessages.slice(0, 5),
    }
  } catch (error) {
    return { arm, ok: false, transportError: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

const results = []
for (const arm of arms) results.push(await runArm(arm))

console.log(JSON.stringify({ ...summary, results }, null, 2))
