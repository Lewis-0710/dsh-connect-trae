import type { TraeCredential } from './auth.ts'
import { parseTraeRemoteModel, type TraeDiscoveredModel } from './model-metadata.ts'

export const TRAE_SOLO_REMOTE_BASE = 'https://solo.trae.cn/api/remote/v1'

export const TRAE_SOLO_REMOTE_MODELS: readonly { name: string; displayName: string; multimodal: boolean }[] = [
  { name: 'DeepSeek-V4-Flash', displayName: 'DeepSeek-V4-Flash', multimodal: false },
  { name: 'DeepSeek-V4-Pro', displayName: 'DeepSeek-V4-Pro', multimodal: false },
  { name: 'Doubao_1_6', displayName: 'Doubao-Seed-Code', multimodal: true },
  { name: 'Doubao-Seed-2.0-Code', displayName: 'Doubao-Seed-2.0-Code', multimodal: true },
  { name: 'kimi-k2.6', displayName: 'Kimi-K2.6', multimodal: true },
  { name: 'kimi-k2.5', displayName: 'Kimi-K2.5', multimodal: true },
  { name: 'qwen-3.6-plus', displayName: 'Qwen3.6-Plus', multimodal: true },
  { name: 'qwen-3.5', displayName: 'Qwen3.5', multimodal: true },
  { name: 'glm-5.1', displayName: 'GLM-5.1', multimodal: false },
  { name: 'glm-5', displayName: 'GLM-5', multimodal: false },
  { name: 'glm-5v-turbo', displayName: 'GLM-5V-Turbo', multimodal: true },
  { name: 'minimax-m2.7', displayName: 'MiniMax-M2.7', multimodal: false },
  { name: 'minimax-m2.5', displayName: 'MiniMax-M2.5', multimodal: false },
]

export interface TraeSoloRemoteOptions {
  credential(): Promise<TraeCredential>
  fetchImpl?: typeof fetch
  baseUrl?: string
  pollIntervalMs?: number
  timeoutMs?: number
}

interface SoloRemoteSessionResponse {
  code: number
  message?: string
  data?: { chat_session_id?: string; message_id?: string }
}

interface SoloRemoteMessage {
  role?: string
  status?: string
  content?: string
}

export interface TraeRemoteInputMessage {
  role: string
  content: string
}

/**
 * Preserve DSH's complete text conversation in the one query accepted by the
 * SOLO Remote create-session endpoint. System instructions (including DSH's
 * workspace/cwd context), assistant history, tool-result text and the newest
 * user request stay ordered instead of collapsing to the last user message.
 */
export function serializeTraeConversation(messages: readonly TraeRemoteInputMessage[]): string {
  if (messages.length === 1 && messages[0]?.role === 'user') return messages[0].content
  return messages.map(message => `<dsh-message role="${message.role}">\n${message.content}\n</dsh-message>`).join('\n\n')
}

function decodeUserId(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString('utf8')) as { data?: { id?: string } }
    return payload.data?.id ?? '0'
  } catch { return '0' }
}

function generateWebId(): string {
  return String(Math.floor(Math.random() * 9e15) + 1e15)
}

function buildCommonParams(userId: string, webId: string, sessionId?: string): string {
  return JSON.stringify({
    language: 'zh-cn', app_language: 'en', quality: 'stable', app_version: '1.0.0.1300',
    user_identity: 'Free', is_freshman: '0', scope: 'marscode', tenant: 'marscode',
    region: 'CN', aiRegion: 'CN', solo_chat_mode: 'code', is_privacy_mode: 1, privacy_mode: 'on',
    ...sessionId === undefined ? {} : { biz_session_id: sessionId },
    web_id: webId, biz_user_id: userId, user_unique_id: userId,
  })
}

function extractContent(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed.filter((c): c is { text_content?: string } => typeof c === 'object' && c !== null && (c as { type?: string }).type === 'text').map(c => c.text_content ?? '').join('')
    if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { messages?: unknown }).messages)) {
      const parts: string[] = []
      for (const msg of (parsed as { messages: unknown[] }).messages) {
        if (typeof msg !== 'object' || msg === null) continue
        const pi = (msg as { plan_item?: unknown }).plan_item
        if (typeof pi !== 'object' || pi === null) continue
        const tc = (pi as { tool_call_info?: unknown }).tool_call_info
        if (typeof tc !== 'object' || tc === null) continue
        const tool = tc as { name?: string; params?: { summary?: string }; result?: { data?: { summary?: string } } }
        if (tool.name === 'finish' && tool.params?.summary) parts.push(tool.params.summary)
        else if (tool.result?.data?.summary && tool.name !== 'finish') parts.push(tool.result.data.summary)
      }
      return parts.join('\n\n')
    }
  } catch { /* not JSON */ }
  return raw
}

export class TraeSoloRemoteClient {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly pollIntervalMs: number
  private readonly timeoutMs: number

  constructor(private readonly options: TraeSoloRemoteOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.baseUrl = options.baseUrl ?? TRAE_SOLO_REMOTE_BASE
    this.pollIntervalMs = options.pollIntervalMs ?? 2000
    this.timeoutMs = options.timeoutMs ?? 120_000
  }

  private async headers(): Promise<Record<string, string>> {
    const credential = await this.options.credential()
    return {
      'Authorization': `Cloud-IDE-JWT ${credential.accessToken}`,
      'Content-Type': 'application/json',
      'x-trae-client-type': 'web',
      'x-trae-user-timezone': 'Asia/Shanghai',
      'x-preferenced-language': 'zh-cn',
      'Referer': 'https://solo.trae.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
  }

  async chat(messages: readonly TraeRemoteInputMessage[], model: string, signal?: AbortSignal): Promise<{ content: string; sessionId: string }> {
    const headers = await this.headers()
    const token = (await this.options.credential()).accessToken
    const userId = decodeUserId(token)
    const webId = generateWebId()
    const modelInfo = TRAE_SOLO_REMOTE_MODELS.find(m => m.name.toLowerCase() === model.toLowerCase()) ?? { name: model, displayName: model, multimodal: false }
    const conversation = serializeTraeConversation(messages)
    const body = {
      mode: 'code', environment_id: 'default', env: 'remote', auto_create_project: false, origin: 'web',
      initial_message: {
        chat_session_id: '', content: [],
        query: JSON.stringify([{ type: 'text', data: { content: conversation } }]),
        model_name: modelInfo.name, agent_type: 'solo_agent_remote', model_selection_strategy: 'manual',
        custom_model: { name: modelInfo.name, multimodal: modelInfo.multimodal, is_default: false, display_name: modelInfo.displayName, config_name: modelInfo.name, config_source: 1, provider: '', ak: '', sk: '', base_url: '', auth_type: 0, use_remote_service: true },
        common_params: buildCommonParams(userId, webId),
      },
    }
    const createResponse = await this.fetchImpl(`${this.baseUrl}/chat_sessions`, { method: 'POST', headers, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(30_000) })
    const createJson = await createResponse.json() as SoloRemoteSessionResponse
    if (!createResponse.ok || createJson.code !== 0 || !createJson.data?.chat_session_id) {
      throw new Error(`SOLO remote session creation failed (http ${createResponse.status}): ${createJson.message ?? 'unknown error'}`)
    }
    const sessionId = createJson.data.chat_session_id
    const start = Date.now()
    while (Date.now() - start < this.timeoutMs) {
      if (signal?.aborted) throw new Error('SOLO remote polling aborted')
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs))
      const messageResponse = await this.fetchImpl(`${this.baseUrl}/chat_sessions/${sessionId}/messages?page_size=50`, { headers, ...signal === undefined ? {} : { signal } })
      if (!messageResponse.ok) continue
      const messageJson = await messageResponse.json() as { code?: number; data?: { items?: SoloRemoteMessage[] } }
      const items = messageJson.data?.items ?? []
      const assistant = items.find(item => item.role === 'assistant')
      if (assistant && assistant.status !== 'in_progress' && assistant.status !== 'failed') {
        return { content: extractContent(assistant.content ?? ''), sessionId }
      }
      if (assistant?.status === 'failed') throw new Error('SOLO remote assistant message failed')
    }
    throw new Error('SOLO remote polling timed out')
  }

  async fetchModels(signal?: AbortSignal): Promise<TraeDiscoveredModel[]> {
    const headers = await this.headers()
    const response = await this.fetchImpl(`${this.baseUrl}/models?functions=solo_agent_remote,solo_work_remote`, { headers, signal: signal ?? AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`SOLO remote models returned HTTP ${response.status}`)
    const json = await response.json() as { code?: number; data?: { list?: { function?: string; models?: unknown[] }[] } }
    // The two function groups largely overlap. Prefer solo_agent_remote and
    // deduplicate by Trae's exact wire model name.
    const groups = json.data?.list ?? []
    const preferred = groups.find(group => group.function === 'solo_agent_remote') ?? groups[0]
    const seen = new Set<string>()
    const models: TraeDiscoveredModel[] = []
    for (const raw of preferred?.models ?? []) {
      const model = parseTraeRemoteModel(raw)
      if (model === undefined || seen.has(model.id)) continue
      seen.add(model.id)
      models.push(model)
    }
    return models
  }
}
