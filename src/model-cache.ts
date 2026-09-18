import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { TraeDiscoveredModel } from './model-metadata.ts'
import { parseTraeRemoteModel } from './model-metadata.ts'
import type { TraeRegion } from './region.ts'

const execFileAsync = promisify(execFile)

export interface TraeCachedModelConfig {
  name: string
  customConfig?: Record<string, unknown>
  promptMaxTokens?: number
  maxTokens?: number
  maxTurn?: number
  multimodal?: boolean
  modelType?: string
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/** Parse a safe subset of one cached model entry; credentials and endpoints are intentionally omitted. */
export function parseTraeCachedModel(value: unknown): TraeCachedModelConfig | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw['name'] !== 'string' || raw['name'] === '') return undefined
  let customConfig: Record<string, unknown> | undefined
  if (typeof raw['custom_config'] === 'string' && raw['custom_config'] !== '') {
    try {
      const parsed = JSON.parse(raw['custom_config']) as unknown
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) customConfig = parsed as Record<string, unknown>
    } catch {}
  }
  const promptMaxTokens = positive(raw['prompt_max_tokens'])
  const maxTokens = positive(raw['max_tokens'])
  const maxTurn = positive(raw['max_turn'])
  return {
    name: raw['name'],
    ...customConfig === undefined ? {} : { customConfig },
    ...promptMaxTokens === undefined ? {} : { promptMaxTokens },
    ...maxTokens === undefined ? {} : { maxTokens },
    ...maxTurn === undefined ? {} : { maxTurn },
    ...typeof raw['multimodal'] === 'boolean' ? { multimodal: raw['multimodal'] } : {},
    ...typeof raw['model_type'] === 'string' ? { modelType: raw['model_type'] } : {},
  }
}

export interface TraeCachedModelReadOptions {
  /** Platform override for testing; defaults to process.platform. */
  platform?: NodeJS.Platform
  /** Home-directory override for testing; defaults to homedir(). */
  home?: string
  /** Environment override for testing; defaults to process.env. */
  env?: NodeJS.ProcessEnv
}

/**
 * Read Trae's own current user's model map via sqlite3 without exposing
 * secrets. The sqlite3 command line is a macOS prerequisite; on Windows it is
 * typically absent, so the call fails and callers fall back gracefully.
 */


export async function readTraeCachedModel(
  functionName: string,
  modelName: string,
  userId: string,
  options: TraeCachedModelReadOptions = {},
): Promise<TraeCachedModelConfig | undefined> {
  const platform = options.platform ?? process.platform
  const home = options.home ?? homedir()
  const env = options.env ?? process.env
  const database = platform === 'win32'
    ? join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Trae CN', 'User', 'globalStorage', 'state.vscdb')
    : join(home, 'Library', 'Application Support', 'Trae CN', 'User', 'globalStorage', 'state.vscdb')
  const key = `${userId}_AI.agent.model.model_list_map`
  const sql = `select value from ItemTable where key=${JSON.stringify(key)} limit 1;`
  const { stdout } = await execFileAsync('sqlite3', [database, sql], { maxBuffer: 8 * 1024 * 1024 })
  const document = JSON.parse(stdout) as Record<string, unknown>
  const list = Array.isArray(document[functionName]) ? document[functionName] as unknown[] : []
  return parseTraeCachedModel(list.find(item => typeof item === 'object' && item !== null && (item as { name?: unknown }).name === modelName))
}

/**
 * Read the full model catalogue cached in Trae's local SQLite database.
 * This contains the active promotions, discount rates (e.g. 0.08x), and in-IDE
 * model entries that might not yet be updated on the public Web API.
 */
export async function readTraeLocalCatalog(
  region: TraeRegion = 'cn',
  userId?: string,
  options: TraeCachedModelReadOptions = {},
): Promise<TraeDiscoveredModel[]> {
  const platform = options.platform ?? process.platform
  const home = options.home ?? homedir()
  const env = options.env ?? process.env
  const folderNames = region === 'ai'
    ? ['Trae', 'Trae SG', 'Trae Solo']
    : ['Trae CN', 'Trae', 'Trae Solo']

  for (const folder of folderNames) {
    const database = platform === 'win32'
      ? join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), folder, 'User', 'globalStorage', 'state.vscdb')
      : platform === 'darwin'
        ? join(home, 'Library', 'Application Support', folder, 'User', 'globalStorage', 'state.vscdb')
        : join(home, '.config', folder, 'User', 'globalStorage', 'state.vscdb')

    try {
      const keyCondition = userId ? `key=${JSON.stringify(`${userId}_AI.agent.model.model_list_map`)}` : `key like '%AI.agent.model.model_list_map%'`
      const sql = `select value from ItemTable where ${keyCondition} limit 1;`
      const { stdout } = await execFileAsync('sqlite3', [database, sql], { maxBuffer: 8 * 1024 * 1024 })
      if (!stdout.trim()) continue
      const document = JSON.parse(stdout) as Record<string, unknown>
      const candidateKeys = ['solo_agent', 'chat_v3', 'builder_v3', 'builder', 'code_review_summary']
      const seen = new Set<string>()
      const models: TraeDiscoveredModel[] = []
      for (const key of candidateKeys) {
        const list = Array.isArray(document[key]) ? document[key] as unknown[] : []
        for (const raw of list) {
          if (typeof raw !== 'object' || raw === null) continue
          const name = (raw as { name?: unknown; model_name?: unknown }).name ?? (raw as { model_name?: unknown }).model_name
          if (typeof name !== 'string' || name.startsWith('refactor_') || name === 'code-review-judge' || name.startsWith('custom_model')) {
            continue
          }
          const model = parseTraeRemoteModel(raw)
          if (model === undefined || seen.has(model.id)) continue
          seen.add(model.id)
          models.push(model)
        }
      }
      if (models.length > 0) return models
    } catch {
      // Continue to try next candidate path or return empty
    }
  }
  return []
}
