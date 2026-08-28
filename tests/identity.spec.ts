import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { identityHeaders, readTraeIdentity } from '../src/identity.ts'

const cleanup: string[] = []
afterEach(async () => { await Promise.all(cleanup.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('Trae persisted identity', () => {
  it('reads Trae-owned machine and telemetry IDs without random generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trae-id-')); cleanup.push(root)
    const storage = join(root, 'User', 'globalStorage', 'storage.json')
    await mkdir(join(root, 'User', 'globalStorage'), { recursive: true })
    await writeFile(join(root, 'machineid'), 'machine-stable')
    await writeFile(storage, JSON.stringify({ 'telemetry.devDeviceId': 'device-stable', 'telemetry.machineId': 'telemetry-machine', 'iCubeAuthInfo://icube-dc:221464824136636': 'encrypted', iCubeLastVersion: '2.3.1' }))
    const first = await readTraeIdentity({ edition: 'cn', path: storage })
    const second = await readTraeIdentity({ edition: 'cn', path: storage })
    expect(first).toEqual(second)
    expect(first).toMatchObject({ machineId: 'telemetry-machine', deviceId: '221464824136636', buildVersion: '2.3.1' })
    expect(identityHeaders(first)['x-device-type']).not.toBe('windows')
  })

  it('falls back to root machineid and derives a deterministic device id only when telemetry IDs are absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trae-id-')); cleanup.push(root)
    const storage = join(root, 'User', 'globalStorage', 'storage.json')
    await mkdir(join(root, 'User', 'globalStorage'), { recursive: true })
    await writeFile(join(root, 'machineid'), 'machine-stable')
    await writeFile(storage, '{}')
    const value = await readTraeIdentity({ edition: 'cn', path: storage })
    expect(value.deviceId).toMatch(/^[a-f0-9]{32}$/)
  })
})
