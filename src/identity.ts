import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { cpus, release } from 'node:os'
import type { TraeEdition, TraeStorageCandidate } from './paths.ts'

export interface TraeIdentity {
  edition: TraeEdition
  machineId: string
  deviceId: string
  appVersion?: string
  buildVersion?: string
  deviceBrand?: string
  deviceCpu?: string
  osVersion?: string
  platform: NodeJS.Platform
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function deviceCenterId(storage: Record<string, unknown>): string | undefined {
  const prefix = 'iCubeAuthInfo://icube-dc:'
  const ids = Object.keys(storage).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length)).filter(Boolean)
  return ids.length === 1 ? ids[0] : undefined
}

/** Read stable identity from Trae-owned files without generating impersonated IDs. */
export async function readTraeIdentity(candidate: TraeStorageCandidate): Promise<TraeIdentity> {
  const storage = JSON.parse(await readFile(candidate.path, 'utf8')) as Record<string, unknown>
  const appRoot = dirname(dirname(dirname(candidate.path)))
  const machineFile = nonEmpty(await readFile(join(appRoot, 'machineid'), 'utf8').catch(() => ''))
  const telemetryMachine = nonEmpty(storage['telemetry.machineId'])
  const devDevice = nonEmpty(storage['telemetry.devDeviceId'])
  const dcDevice = deviceCenterId(storage)
  // Historical official chat logs use the 64-char telemetry.machineId as
  // x-machine-id. The root machineid file remains a fallback only.
  const machineId = telemetryMachine ?? machineFile
  if (machineId === undefined) throw new Error(`Trae ${candidate.edition} has no stable machine identity`)
  // The numeric suffix of iCubeAuthInfo://icube-dc:<id> exactly matches the
  // x-device-id observed in official CN chat logs. Telemetry remains fallback.
  const deviceId = dcDevice ?? devDevice ?? createHash('sha256').update(machineId).digest('hex').slice(0, 32)
  const buildVersion = nonEmpty(storage['iCubeLastVersion'])
  const productPaths = candidate.edition === 'cn' || candidate.edition === 'solo'
    ? [candidate.edition === 'cn' ? '/Applications/Trae CN.app/Contents/Resources/app/product.json' : '/Applications/TRAE SOLO CN.app/Contents/Resources/app/product.json']
    : []
  let product: Record<string, unknown> = {}
  for (const path of productPaths) {
    try { product = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>; break } catch {}
  }
  const appVersion = nonEmpty(product['appVersion'])
  const deviceBrand = process.platform === 'darwin' ? nonEmpty(process.env['TRAE_DEVICE_BRAND']) : undefined
  const deviceCpu = cpus()[0]?.model.split(' ')[0]
  const osVersion = `${process.platform === 'darwin' ? 'macOS' : process.platform} ${release()}`
  return {
    edition: candidate.edition,
    machineId,
    deviceId,
    ...appVersion === undefined ? {} : { appVersion },
    ...buildVersion === undefined ? {} : { buildVersion },
    ...deviceBrand === undefined ? {} : { deviceBrand },
    ...deviceCpu === undefined ? {} : { deviceCpu },
    osVersion,
    platform: process.platform,
  }
}

/** Headers derived from actual persisted identity, never a new random identity per request. */
export function identityHeaders(identity: TraeIdentity): Record<string, string> {
  return {
    'x-machine-id': identity.machineId,
    'x-device-id': identity.deviceId,
    'x-device-type': identity.platform === 'darwin' ? 'mac' : identity.platform === 'win32' ? 'windows' : identity.platform,
    ...identity.deviceBrand === undefined ? {} : { 'x-device-brand': identity.deviceBrand },
    ...identity.deviceCpu === undefined ? {} : { 'x-device-cpu': identity.deviceCpu },
    ...identity.osVersion === undefined ? {} : { 'x-os-version': identity.osVersion },
    ...identity.appVersion === undefined ? {} : { 'x-app-version': identity.appVersion, 'x-ide-version': identity.appVersion },
    ...identity.buildVersion === undefined ? {} : { 'x-app-version-code': identity.buildVersion, 'x-ide-version-code': identity.buildVersion },
    'x-ide-version-type': 'stable',
  }
}
