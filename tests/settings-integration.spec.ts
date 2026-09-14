import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SettingsProvider from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import * as Trae from '../src/index.ts'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  private storedDocument: Record<string, unknown> = {}
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve(structuredClone(this.storedDocument)) }
  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.storedDocument[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

let context: Context | undefined
afterEach(async () => { await context?.fiber.dispose(); context = undefined })

/**
 * Fully isolate a plugin instance from the host machine's real Trae state:
 * a nonexistent authFile detaches the desktop and CLI candidates, and a
 * temporary DSH_HOME detaches the plugin-owned credential copy. Without this
 * the startup seed — which now serves the LIVE directory whenever a
 * credential resolves, and converges the tracked region on it (workbuddy
 * semantics) — would surface the machine's real roster and region, making
 * every fallback assertion depend on who happens to be signed in.
 */
async function isolatedPlugin(ctx: Context, config: Partial<Trae.Config> = {}): Promise<() => Promise<void>> {
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = await mkdtemp(join(tmpdir(), 'dsh-trae-test-home-'))
  await ctx.plugin(Trae, { edition: 'auto', ...config, authFile: '/nonexistent/dsh-connect-trae-test-storage.json' })
  return async () => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }
}

describe('Trae provider registration', () => {
  it('registers provider, settings, and fallback models after shim startup', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(MemorySettings)
    const restore = await isolatedPlugin(ctx)
    try {
      await expect.poll(() => ctx.llm.listProviders().map(provider => provider.id)).toContain('trae')
      expect(ctx.llm.listConfigurableProviders()).toContainEqual({
        provider: 'trae', displayName: 'Trae', settingsNs: 'trae', settingsPath: [], declared: false,
      })
      expect(ctx.settings.describe().some(entry => entry.ns === Trae.TRAE_SETTINGS_NS)).toBe(true)
      const models = await ctx.llm.listModels('trae')
      expect(models.map(model => model.id)).toContain('DeepSeek-V4-Flash')
      expect(models.map(model => model.id)).toContain('DeepSeek-V4-Pro')
      expect(models.find(model => model.id === 'glm-5.2')?.inputModalities).toEqual(['text'])
      expect(models.find(model => model.id === 'kimi-k2.6')?.inputModalities).toEqual(['text'])
      expect(models.find(model => model.id === 'DeepSeek-V4-Pro')?.inputModalities).toEqual(['text'])
    } finally { await restore() }
  })

  it('applies the explicit image opt-in to the live adapter catalog', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(MemorySettings)
    const restore = await isolatedPlugin(ctx)
    try {
      await expect.poll(() => ctx.llm.listProviders().map(provider => provider.id)).toContain('trae')

      await ctx.settings.update(Trae.TRAE_SETTINGS_NS, { imageModelIds: ['DeepSeek-V4-Pro'] })

      const models = await ctx.llm.listModels('trae')
      expect(models.find(model => model.id === 'DeepSeek-V4-Pro')?.inputModalities).toEqual(['text', 'image'])
      expect(models.find(model => model.id === 'DeepSeek-V4-Flash')?.inputModalities).toEqual(['text'])
    } finally { await restore() }
  })

  it('embeds the saved credit multiplier into the registered model name', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(MemorySettings)
    const restore = await isolatedPlugin(ctx)
    try {
      await expect.poll(() => ctx.llm.listProviders().map(provider => provider.id)).toContain('trae')

      // Saving the directory persists the multiplier; the adapter then exposes
      // the DSH-facing name `Name · x<rate>` while the model id stays pure.
      await ctx.settings.update(Trae.TRAE_SETTINGS_NS, {
        lastCatalog: [
          { id: 'glm-5.2', name: 'GLM-5.2', input: ['text'], creditMultiplier: 0.79 },
          { id: 'DeepSeek-V4-Flash', name: 'DeepSeek-V4-Flash', input: ['text'] },
        ],
        enabledModelIds: ['glm-5.2'],
      })

      const models = await ctx.llm.listModels('trae')
      const glm = models.find(model => model.id === 'glm-5.2')
      expect(glm?.name).toBe('GLM-5.2 · x0.79')
    } finally { await restore() }
  })
})

describe('built-in fallback is a safety net, not a filter target', () => {
  it('serves every built-in fallback model when discovery yields nothing', async () => {
    // A machine with no Trae credentials (or a startup discovery failure) must
    // still expose the plugin's own fallback catalog. Regression guard: the
    // fallback list used to be run through the live-wire filter, so a *partial*
    // live catalog (a subset of ids) deleted every fallback model it did not
    // mention, leaving the plugin serving almost nothing on real installs.
    const ctx = new Context()
    context = ctx
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(MemorySettings)
    const restore = await isolatedPlugin(ctx)
    try {
      await expect.poll(() => ctx.llm.listProviders().map(provider => provider.id)).toContain('trae')

      const ids = (await ctx.llm.listModels('trae')).map(model => model.id)
      for (const fallback of ['auto', 'DeepSeek-V4-Flash', 'DeepSeek-V4-Pro', 'glm-5.2', 'kimi-k2.6']) {
        expect(ids).toContain(fallback)
      }
    } finally { await restore() }
  })
})

describe('per-region model slots', () => {
  it('an explicit regions.cn slot wins over the deprecated flat fields', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(MemorySettings)
    const restore = await isolatedPlugin(ctx)
    try {
      await expect.poll(() => ctx.llm.listProviders().map(provider => provider.id)).toContain('trae')

      // Both shapes present: the explicit slot must be what the runtime serves.
      await ctx.settings.update(Trae.TRAE_SETTINGS_NS, {
        lastCatalog: [
          { id: 'glm-5.2', name: 'GLM-5.2', input: ['text'] },
        ],
        regions: {
          cn: {
            lastCatalog: [
              { id: 'kimi-k2.6', name: 'Kimi-K2.6', input: ['text'] },
              { id: 'glm-5.2', name: 'GLM-5.2', input: ['text'] },
            ],
            enabledModelIds: ['kimi-k2.6'],
          },
        },
      })

      const ids = (await ctx.llm.listModels('trae')).map(model => model.id)
      expect(ids).toContain('kimi-k2.6')
      // The flat-field-only selection is gone: the slot owns the runtime catalog.
      expect(ids).not.toContain('DeepSeek-V4-Flash')
    } finally { await restore() }
  })

  it('saving an ai slot never leaks its roster into the CN runtime', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(MemorySettings)
    const restore = await isolatedPlugin(ctx)
    try {
      await expect.poll(() => ctx.llm.listProviders().map(provider => provider.id)).toContain('trae')

      // An international directory saved into the ai slot: with no signed-in
      // international account the tracked region stays cn, so the runtime catalog
      // must keep serving the CN roster and never the ai one.
      await ctx.settings.update(Trae.TRAE_SETTINGS_NS, {
        regions: {
          ai: {
            lastCatalog: [
              { id: 'gemini-3.1-pro', name: 'Gemini-3.1-Pro-Preview', input: ['text'] },
              { id: 'gpt-5.4', name: 'GPT-5.4', input: ['text'] },
            ],
            enabledModelIds: ['gpt-5.4'],
          },
        },
      })

      const ids = (await ctx.llm.listModels('trae')).map(model => model.id)
      expect(ids).not.toContain('gemini-3.1-pro')
      expect(ids).not.toContain('gpt-5.4')
      for (const fallback of ['auto', 'DeepSeek-V4-Flash', 'glm-5.2']) {
        expect(ids).toContain(fallback)
      }
    } finally { await restore() }
  })
})
