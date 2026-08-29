import type { TraeCredential } from './auth.ts'
import type { TraeIdentity } from './identity.ts'
import { buildTraeCnHeaders, traeEndpoint } from './protocol.ts'
import { buildTraeRawChatDraft, TRAE_RAW_CHAT_V2_PATH, type RawChatMessage, type RawChatTool } from './raw-chat.ts'
import type { TraeChatResult, TraeUpstreamErrorKind } from './upstream.ts'

export interface TraeRawChatConfig {
  model: string
  configName: string
  promptSet?: string
  abVersion?: string
  passBackReasoning: boolean
  extraInfo?: Record<string, unknown>
}

export interface TraeRawChatClientOptions {
  credential: () => Promise<TraeCredential>
  identity: () => Promise<TraeIdentity>
  config: TraeRawChatConfig
  baseUrl?: string
  fetchImpl?: typeof fetch
}

function errorKind(status: number): TraeUpstreamErrorKind {
  if (status === 401 || status === 403) return 'authentication'
  if (status === 402) return 'hard_credit'
  if (status === 429) return 'soft_rate'
  if (status === 404) return 'not_found'
  if (status >= 500) return 'server'
  return 'client'
}

/**
 * Evidence-gated Raw Chat client. It is fully testable through injected fetch,
 * but production callers must not construct it without verified config values.
 */
export class TraeRawChatUpstreamClient {
  private readonly fetchImpl: typeof fetch
  constructor(private readonly options: TraeRawChatClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    if (options.config.configName.trim() === '') throw new Error('Trae Raw Chat configName must be evidence-backed and non-empty')
  }

  async chatStream(bodyJson: string, signal?: AbortSignal): Promise<TraeChatResult> {
    let input: { messages?: RawChatMessage[]; tools?: RawChatTool[]; max_tokens?: number; temperature?: number }
    try { input = JSON.parse(bodyJson) as typeof input }
    catch { return { ok: false, status: 400, kind: 'client', message: 'invalid JSON request' } }
    if (!Array.isArray(input.messages) || input.messages.length === 0) return { ok: false, status: 400, kind: 'client', message: 'messages are required' }
    const [credential, identity] = await Promise.all([this.options.credential(), this.options.identity()])
    const requestId = crypto.randomUUID()
    const headers = buildTraeCnHeaders(credential, identity, { requestId, profile: 'raw-chat' })
    const core = buildTraeRawChatDraft({
      model: this.options.config.model,
      messages: input.messages,
      ...input.tools === undefined ? {} : { tools: input.tools },
      ...input.max_tokens === undefined ? {} : { maxTokens: input.max_tokens },
      ...input.temperature === undefined ? {} : { temperature: input.temperature },
    })
    const body = {
      ...core,
      config_name: this.options.config.configName,
      ...this.options.config.promptSet === undefined ? {} : { prompt_set: this.options.config.promptSet },
      ...this.options.config.abVersion === undefined ? {} : { ab_version: this.options.config.abVersion },
      pass_back_reasoning: this.options.config.passBackReasoning,
      ...this.options.config.extraInfo === undefined ? {} : { extra_info: this.options.config.extraInfo },
    }
    let response: Response
    try {
      response = await this.fetchImpl(traeEndpoint(this.options.baseUrl ?? credential.host, TRAE_RAW_CHAT_V2_PATH), {
        method: 'POST', headers, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(30_000),
      })
    } catch (error: unknown) {
      return { ok: false, status: 0, kind: 'server', message: `transport error: ${String(error)}` }
    }
    if (response.ok) return { ok: true, response }
    const text = (await response.text()).slice(0, 1024)
    return { ok: false, status: response.status, kind: errorKind(response.status), message: text || `Trae Raw Chat returned HTTP ${response.status}` }
  }
}
