import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import type { TraeCredential } from './auth.ts'
import { TraeSoloRemoteClient } from './solo-remote.ts'
import type { TraeChatResult, TraeUpstreamErrorKind, TraeUpstreamClient } from './upstream.ts'

function classify(status: number): TraeUpstreamErrorKind {
  if (status === 401 || status === 403) return 'authentication'
  if (status === 402) return 'hard_credit'
  if (status === 429) return 'soft_rate'
  if (status === 404) return 'not_found'
  if (status >= 500) return 'server'
  return 'client'
}

/**
 * Bridges the SOLO remote polling-based API into the shim's stream interface.
 * The remote API uses create-session + poll-messages rather than raw SSE,
 * so this bridge converts the final result into a synthetic OpenAI SSE stream.
 */
export class TraeSoloRemoteBridge implements TraeUpstreamClient {
  constructor(private readonly remote: TraeSoloRemoteClient) {}

  async chatStream(bodyJson: string, signal?: AbortSignal): Promise<TraeChatResult> {
    let parsed: { model?: string; messages?: { role?: string; content?: string }[] }
    try { parsed = JSON.parse(bodyJson) as typeof parsed }
    catch { return { ok: false, status: 400, kind: 'client', message: 'invalid JSON request' } }
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      return { ok: false, status: 400, kind: 'client', message: 'messages are required' }
    }
    const messages = parsed.messages.filter((message): message is { role: string; content: string } =>
      typeof message.role === 'string' && typeof message.content === 'string')
    if (messages.length === 0) return { ok: false, status: 400, kind: 'client', message: 'text messages are required' }
    const model = typeof parsed.model === 'string' && parsed.model !== '' ? parsed.model : 'DeepSeek-V4-Flash'
    const upstreamModel = model.endsWith('@1m') ? model.slice(0, -3) : model
    try {
      const result = await this.remote.chat(messages, upstreamModel, signal)
      const chunks = buildOpenAISseChunks(result.content, model)
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      })
      return { ok: true, response: new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }) }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const status = /timed out/i.test(message) ? 504 : /session creation failed/i.test(message) ? 502 : 502
      return { ok: false, status, kind: classify(status), message: message.slice(0, 400) }
    }
  }
}

function buildOpenAISseChunks(content: string, model: string): string[] {
  const id = `chatcmpl-${randomUUID().replaceAll('-', '').slice(0, 24)}`
  const created = Math.floor(Date.now() / 1000)
  const chunks: string[] = []
  if (content !== '') {
    chunks.push(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`)
  }
  chunks.push(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
  chunks.push('data: [DONE]\n\n')
  return chunks
}
