import { randomUUID } from 'node:crypto'
import { SseDecoder, decodeTraeEvent } from './sse.ts'
import type { TraeChatResult, TraeUpstreamClient } from './upstream.ts'

interface OpenAIToolCallDelta {
  index: number
  id?: string
  type?: 'function'
  function?: { name?: string; arguments?: string }
}

function normalizeToolCalls(value: unknown): OpenAIToolCallDelta[] {
  if (!Array.isArray(value)) return []
  const calls: OpenAIToolCallDelta[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue
    const record = raw as Record<string, unknown>
    const rawFunction = typeof record['function_call'] === 'object' && record['function_call'] !== null
      ? record['function_call'] as Record<string, unknown>
      : typeof record['function'] === 'object' && record['function'] !== null
        ? record['function'] as Record<string, unknown>
        : {}
    const fn = {
      ...typeof rawFunction['name'] === 'string' ? { name: rawFunction['name'] } : {},
      ...typeof rawFunction['arguments'] === 'string' ? { arguments: rawFunction['arguments'] } : {},
    }
    calls.push({
      index: typeof record['index'] === 'number' ? record['index'] : calls.length,
      ...typeof record['id'] === 'string' ? { id: record['id'] } : {},
      ...record['type'] === 'function' ? { type: 'function' as const } : {},
      ...Object.keys(fn).length === 0 ? {} : { function: fn },
    })
  }
  return calls
}

/** Convert Trae's named SSE events into OpenAI chat-completion SSE chunks. */
export function bridgeTraeSoloStream(response: Response, model: string): Response {
  const source = response.body
  if (source === null) return new Response(null, { status: 502 })
  const id = `chatcmpl-${randomUUID().replaceAll('-', '').slice(0, 24)}`
  const created = Math.floor(Date.now() / 1000)
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const sse = new SseDecoder()
  let sawToolCalls = false
  let emittedDone = false
  let upstreamError: Error | undefined
  let usage: Record<string, number> | undefined

  const chunk = (delta: Record<string, unknown>, finishReason: string | null = null): Uint8Array => encoder.encode(`data: ${JSON.stringify({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...usage === undefined ? {} : { usage },
  })}\n\n`)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader()
      const consume = (event: ReturnType<SseDecoder['push']>[number]): void => {
        const decoded = decodeTraeEvent(event)
        if (decoded.type === 'unknown') {
          const payload = decoded.data as Record<string, unknown> | undefined
          const code = typeof payload?.['code'] === 'number' ? payload['code'] : undefined
          if (decoded.event === 'error' || (code !== undefined && code >= 4000)) {
            // Trae surfaces quota/authorisation failures as an `error` event.
            // Surface it as a real upstream failure instead of letting DSH see
            // a completed-but-empty response (EMPTY_RESPONSE).
            upstreamError = new Error(typeof payload?.['message'] === 'string' && payload['message'] !== ''
              ? payload['message']
              : `Trae upstream error (code ${code ?? '?'})`)
          }
          return
        }
        if (decoded.type === 'delta') {
          const delta: Record<string, unknown> = {}
          if (decoded.text !== '') delta['content'] = decoded.text
          if (decoded.reasoning !== undefined && decoded.reasoning !== '') delta['reasoning_content'] = decoded.reasoning
          const toolCalls = normalizeToolCalls(decoded.toolCalls)
          if (toolCalls.length > 0) {
            sawToolCalls = true
            delta['tool_calls'] = toolCalls
          }
          if (Object.keys(delta).length > 0) controller.enqueue(chunk(delta))
        } else if (decoded.type === 'usage') {
          usage = {
            ...decoded.inputTokens === undefined ? {} : { prompt_tokens: decoded.inputTokens },
            ...decoded.outputTokens === undefined ? {} : { completion_tokens: decoded.outputTokens },
            ...decoded.totalTokens === undefined ? {} : { total_tokens: decoded.totalTokens },
          }
        } else if (decoded.type === 'done' && !emittedDone) {
          emittedDone = true
          if (upstreamError !== undefined) {
            controller.error(upstreamError)
            return
          }
          controller.enqueue(chunk({}, sawToolCalls ? 'tool_calls' : decoded.finishReason))
        }
      }
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          for (const event of sse.push(decoder.decode(next.value, { stream: true }))) consume(event)
        }
        for (const event of sse.finish()) consume(event)
        if (upstreamError !== undefined && !emittedDone) {
          controller.error(upstreamError)
          return
        }
        if (!emittedDone) controller.enqueue(chunk({}, sawToolCalls ? 'tool_calls' : 'stop'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (error) {
        controller.error(error)
      } finally {
        reader.releaseLock()
      }
    },
    cancel(reason) { return source.cancel(reason) },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

/** Native SOLO client wrapper used by the loopback OpenAI adapter. */
export class TraeSoloBridge implements TraeUpstreamClient {
  constructor(private readonly upstream: TraeUpstreamClient) {}

  async chatStream(bodyJson: string, signal?: AbortSignal): Promise<TraeChatResult> {
    let model = 'glm-5.2'
    try {
      const input = JSON.parse(bodyJson) as Record<string, unknown>
      if (typeof input['model'] === 'string' && input['model'] !== '') model = input['model'].endsWith('@1m') ? input['model'].slice(0, -3) : input['model']
    } catch {
      return { ok: false, status: 400, kind: 'client', message: 'invalid JSON request' }
    }
    const result = await this.upstream.chatStream(bodyJson, signal)
    if (!result.ok) return result
    return { ok: true, response: bridgeTraeSoloStream(result.response, model) }
  }
}
