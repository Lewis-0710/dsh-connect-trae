#!/usr/bin/env node
/**
 * Read-only scanner for Trae's own Raw Chat debug record. It emits structural
 * metadata only and never prints request content, model credentials, or tokens.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const roots = [
  join(homedir(), 'Library', 'Application Support', 'Trae CN', 'logs'),
  join(homedir(), 'Library', 'Application Support', 'TRAE SOLO CN', 'logs'),
]
const marker = '[LLMAdapter] llm_raw_chat_custom_model request:'
const files = []
async function walk(path, depth = 0) {
  if (depth > 4) return
  let entries
  try { entries = await readdir(path, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) await walk(child, depth + 1)
    else if (entry.isFile() && /ai-agent.*stdout\.log$|\.alaudalog$/.test(entry.name)) files.push(child)
  }
}
for (const root of roots) await walk(root)
const matches = []
for (const file of files) {
  let text
  try { text = await readFile(file, 'utf8') } catch { continue }
  let at = -1
  while ((at = text.indexOf(marker, at + 1)) !== -1) {
    const tail = text.slice(at + marker.length, at + marker.length + 64 * 1024)
    const line = tail.split('\n', 1)[0]?.trim() ?? ''
    let parsed
    try { parsed = JSON.parse(line) } catch { parsed = undefined }
    const descriptor = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? {
          parsed: true,
          keys: Object.keys(parsed).sort(),
          messageCount: Array.isArray(parsed.messages) ? parsed.messages.length : undefined,
          toolCount: Array.isArray(parsed.tools) ? parsed.tools.length : undefined,
          messageRoles: Array.isArray(parsed.messages) ? parsed.messages.map(message => message && typeof message === 'object' ? message.role : undefined).filter(value => typeof value === 'string') : undefined,
        }
      : { parsed: false, capturedCharacters: line.length }
    matches.push({ file: file.replace(homedir(), '~'), ...descriptor })
  }
}
files.sort(async (a, b) => (await stat(b)).mtimeMs - (await stat(a)).mtimeMs)
console.log(JSON.stringify({ scannedFiles: files.length, marker, matches }, null, 2))
