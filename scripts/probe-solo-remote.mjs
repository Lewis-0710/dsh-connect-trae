#!/usr/bin/env node
/** Controlled probe for the new solo.trae.cn remote API. */
import { readFile } from 'node:fs/promises'
import { normalizeTraeCredential, parseTraeStorageDocument, traeStorageCandidates } from '../lib/index.js'

const live = process.argv.includes('--live')
const candidate = traeStorageCandidates().find(item => item.edition === 'solo')
const credential = normalizeTraeCredential(parseTraeStorageDocument(await readFile(candidate.path, 'utf8')), 'solo', 'desktop')
const token = credential.accessToken
const userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')).data?.id ?? '0'
const webId = String(Math.floor(Math.random() * 9e15) + 1e15)
const base = 'https://solo.trae.cn/api/remote/v1'
const headers = {
  'Authorization': `Cloud-IDE-JWT ${token}`,
  'Content-Type': 'application/json',
  'x-trae-client-type': 'web',
  'x-trae-user-timezone': 'Asia/Shanghai',
  'x-preferenced-language': 'zh-cn',
  'Referer': 'https://solo.trae.cn/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}
const summary = { mode: live ? 'live' : 'dry-run', endpoint: `${base}/chat_sessions`, userId, model: 'DeepSeek-V4-Flash', prompt: 'Reply with exactly: OK', maxTokens: 8 }
if (!live) { console.log(JSON.stringify(summary, null, 2)); process.exit(0) }

const body = {
  mode: 'code', environment_id: 'default', env: 'remote', auto_create_project: false, origin: 'web',
  initial_message: {
    chat_session_id: '', content: [],
    query: JSON.stringify([{ type: 'text', data: { content: 'Reply with exactly: OK' } }]),
    model_name: 'DeepSeek-V4-Flash', agent_type: 'solo_agent_remote', model_selection_strategy: 'manual',
    custom_model: { name: 'DeepSeek-V4-Flash', multimodal: false, is_default: false, display_name: 'DeepSeek-V4-Flash', config_name: 'DeepSeek-V4-Flash', config_source: 1, provider: '', ak: '', sk: '', base_url: '', auth_type: 0, use_remote_service: true },
    common_params: JSON.stringify({ language: 'zh-cn', app_language: 'en', quality: 'stable', app_version: '1.0.0.1300', user_identity: 'Free', is_freshman: '0', scope: 'marscode', tenant: 'marscode', region: 'CN', aiRegion: 'CN', solo_chat_mode: 'code', is_privacy_mode: 1, privacy_mode: 'on', web_id: webId, biz_user_id: userId, user_unique_id: userId }),
  },
}
const resp = await fetch(`${base}/chat_sessions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
const text = await resp.text()
let parsed; try { parsed = JSON.parse(text) } catch {}
console.log(JSON.stringify({ ...summary, httpStatus: resp.status, contentType: resp.headers.get('content-type'), responseShape: parsed && typeof parsed === 'object' ? { code: parsed.code, msg: parsed.message ?? parsed.msg, dataKeys: parsed.data ? Object.keys(parsed.data) : undefined, sessionId: parsed.data?.chat_session_id ? 'present' : undefined } : { nonJson: true, length: text.length } }, null, 2))
