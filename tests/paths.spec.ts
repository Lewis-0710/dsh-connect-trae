import { describe, expect, it } from 'vitest'
import { traeStorageCandidates } from '../src/paths.ts'

describe('Trae storage paths', () => {
  it('uses the four observed macOS application-support paths', () => {
    const paths = traeStorageCandidates('darwin', '/Users/test', {}).map(item => item.path)
    expect(paths).toEqual([
      '/Users/test/Library/Application Support/Trae CN/User/globalStorage/storage.json',
      '/Users/test/Library/Application Support/Trae/User/globalStorage/storage.json',
      '/Users/test/Library/Application Support/TRAE SOLO CN/User/globalStorage/storage.json',
      '/Users/test/Library/Application Support/TRAE SOLO/User/globalStorage/storage.json',
    ])
  })

  it('uses APPDATA on Windows and XDG_CONFIG_HOME on Linux', () => {
    expect(traeStorageCandidates('win32', 'C:/home', { APPDATA: 'C:/Roaming' })[0]?.path).toContain('C:/Roaming/Trae CN')
    expect(traeStorageCandidates('linux', '/home/test', { XDG_CONFIG_HOME: '/cfg' })[0]?.path).toBe('/cfg/Trae CN/User/globalStorage/storage.json')
  })
})
