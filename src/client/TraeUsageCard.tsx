/**
 * Trae usage card contributed to Harness Plugin configuration.
 *
 * Structure, CSS classes, and button primitives mirror `dsh-subagent-default-model`'s
 * `SubagentModelCard` so the two plugins share one external-presentation language.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createElement as h } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { TRAE_MODELS_REFRESH_PATH, TRAE_USAGE_PATH } from '../status-paths.ts'
import type { TraeWebUsage } from '../status-paths.ts'
import { TRAE_PLUGIN_ICON } from './icon.ts'
import { TRAE_CARD_CSS } from './styles.ts'
import type { TraeSettingsKey } from './locales.ts'

/** Localized copy injected by the browser-plugin registration. */
export interface TraeUsageCardInjected {
  t: (key: TraeSettingsKey, params?: Record<string, unknown>) => string
  settingsScope: {
    getSnapshot(): { status: string; value?: unknown; writable: boolean }
    subscribe(listener: () => void): () => void
    set(field: string, value: unknown): Promise<void>
  }
}

/** Props delivered by the Plugin configuration item slot. */
export type TraeUsageCardProps =
  PropsRuntime<'settings.plugin.item'>
  & Partial<TraeUsageCardInjected>

const POLL_INTERVAL_MS = 60_000
const TRAE_GITHUB_URL = 'https://github.com/dingminhua/dsh-connect-trae'

/** Inject the shared card CSS once. */
if (typeof document !== 'undefined') {
  const cssId = 'dsh-connect-trae/client.css'
  if (!document.querySelector(`style[data-plugin-css="${cssId}"]`)) {
    const styleTag = document.createElement('style')
    styleTag.dataset.plugin = 'dsh-connect-trae'
    styleTag.dataset.pluginCss = cssId
    styleTag.textContent = TRAE_CARD_CSS
    document.head.appendChild(styleTag)
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined).format(value)
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function formatCapacity(value: number | undefined, unknown: string): string {
  if (value === undefined) return unknown
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}M`
  if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000}K`
  return formatNumber(value)
}

const EFFORT_LABELS: Readonly<Record<string, string>> = { low: '轻', high: '高', xhigh: '极高' }

function dotStyle(status: TraeWebUsage['status']): Record<string, string> {
  const color = status === 'signed-in'
    ? 'var(--dsw-alias-state-success-primary, #22a06b)'
    : status === 'error'
      ? 'var(--dsw-alias-state-error-primary, #d92d20)'
      : 'var(--dsw-alias-label-dimmed, #9aa0a6)'
  return { background: color }
}

/** Render Trae sign-in state and the total usage summary as one expandable card. */
export function TraeUsageCard({ t, settingsScope }: TraeUsageCardProps) {
  if (t === undefined) throw new Error('Trae usage card requires its translation function')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<TraeWebUsage>({ status: 'signed-out' })
  const [busy, setBusy] = useState(false)
  const [settingsRevision, setSettingsRevision] = useState(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => settingsScope?.subscribe(() => { setSettingsRevision(value => value + 1) }), [settingsScope])

  const refresh = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const response = await fetch(TRAE_USAGE_PATH, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
        ...signal === undefined ? {} : { signal },
      })
      const value: unknown = await response.json().catch(() => undefined)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (mounted.current && signal?.aborted !== true) setStatus(value as TraeWebUsage)
    } catch (error: unknown) {
      if (mounted.current && signal?.aborted !== true) {
        setStatus({ status: 'error', message: error instanceof Error ? error.message : t('row.requestFailed') })
      }
    }
  }, [t])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => { controller.abort() }
  }, [open, refresh])

  useEffect(() => {
    if (!open || status.status !== 'signed-in') return
    const controller = new AbortController()
    const timer = window.setInterval(() => { void refresh(controller.signal) }, POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
      controller.abort()
    }
  }, [open, refresh, status.status])

  const manualRefresh = async (): Promise<void> => {
    setBusy(true)
    try {
      await refresh()
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const refreshModels = async (): Promise<void> => {
    setBusy(true)
    try {
      const response = await fetch(TRAE_MODELS_REFRESH_PATH, {
        method: 'POST',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      await refresh()
    } catch (error: unknown) {
      if (mounted.current) setStatus({ status: 'error', message: error instanceof Error ? error.message : t('row.requestFailed') })
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const settingsValue = settingsScope?.getSnapshot().value
  const enabled1mModels = new Set(
    typeof settingsValue === 'object' && settingsValue !== null && Array.isArray((settingsValue as { enabled1mModels?: unknown }).enabled1mModels)
      ? (settingsValue as { enabled1mModels: unknown[] }).enabled1mModels.filter((value): value is string => typeof value === 'string')
      : [],
  )
  void settingsRevision
  const toggle1m = async (modelId: string): Promise<void> => {
    if (settingsScope === undefined) return
    const next = new Set(enabled1mModels)
    if (!next.delete(modelId)) next.add(modelId)
    await settingsScope.set('enabled1mModels', [...next])
    await refreshModels()
  }

  const title = t('row.title')
  const label = status.status === 'signed-in'
    ? t('row.signedIn', { accountName: status.accountName })
    : status.status === 'error'
      ? t('row.requestFailed')
      : t('row.signedOut')

  return (
    <li className={`dsm-plugin-card${open ? ' dsm-plugin-card-open' : ''}`}>
      <button
        type="button"
        className="dsm-plugin-card-header"
        aria-expanded={open}
        aria-label={`${t(open ? 'row.collapse' : 'row.expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <img className="dsm-plugin-card-icon" src={TRAE_PLUGIN_ICON} alt="" />
        <span className="dsm-plugin-card-head">
          <span className="dsm-plugin-card-title">{title}</span>
          <span className="dsm-plugin-card-description">{t('row.desc')}</span>
        </span>
        <span
          aria-hidden="true"
          className={`dsm-plugin-card-chevron${open ? ' dsm-plugin-card-chevron-open' : ''}`}
        >
          {h(IconChevronDownOutline14, { size: 14 })}
        </span>
      </button>
      <div className="dsm-plugin-card-body" hidden={!open}>
        {open
          ? <div className="dsm-trae-usage">
              <div className="dsm-trae-usage-account">
                <div className="dsm-trae-usage-account-copy" role="status">
                  <div className="dsm-trae-usage-status">
                    <span aria-hidden="true" className="dsm-trae-usage-dot" style={dotStyle(status.status)} />
                    <span>{label}</span>
                  </div>
                  {status.status === 'signed-in'
                    ? <span className="dsm-trae-usage-expiry">
                        {t('row.tokenExpiry', { expiresAt: formatDateTime(status.tokenExpiresAtMs) })}
                      </span>
                    : null}
                </div>
                <button
                  type="button"
                  className="dsm-btn dsm-btn-outline"
                  disabled={busy}
                  onClick={() => { void manualRefresh() }}
                >
                  {busy ? t('row.refreshing') : t('row.refresh')}
                </button>
              </div>
              {status.status === 'signed-in'
                ? <>
                    {status.credits === undefined ? null : (
                      <div className="dsm-trae-usage-list">
                        <div className="dsm-trae-usage-stats">
                          <div className="dsm-trae-usage-stat">
                            <span className="dsm-trae-usage-stat-label">{t('row.creditsAvailableLabel')}</span>
                            <span className="dsm-trae-usage-stat-value">{formatNumber(status.credits.available)}</span>
                          </div>
                          <div className="dsm-trae-usage-stat">
                            <span className="dsm-trae-usage-stat-label">{t('row.creditsConsumedLabel')}</span>
                            <span className="dsm-trae-usage-stat-value">{formatNumber(status.credits.consumed)}</span>
                          </div>
                          <div className="dsm-trae-usage-stat">
                            <span className="dsm-trae-usage-stat-label">{t('row.creditsTotalLabel')}</span>
                            <span className="dsm-trae-usage-stat-value">{formatNumber(status.credits.total)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {status.creditsError === undefined ? null
                      : <p className="dsm-trae-usage-error">{t('row.creditsError', { message: status.creditsError })}</p>}
                    <section className="dsm-trae-models" aria-label={t('row.modelsTitle')}>
                      <div className="dsm-trae-models-head">
                        <div>
                          <h3 className="dsm-trae-models-title">{t('row.modelsTitle')}</h3>
                          <p className="dsm-trae-models-summary">{t('row.modelsSummary', { count: status.models.length })}</p>
                        </div>
                        <button
                          type="button"
                          className="dsm-btn dsm-btn-outline"
                          disabled={busy}
                          onClick={() => { void refreshModels() }}
                        >
                          {busy ? t('row.modelsRefreshing') : t('row.modelsRefresh')}
                        </button>
                      </div>
                      <div className="dsm-trae-model-list">
                        {status.models.map(model => (
                          <div className="dsm-trae-model" key={model.id}>
                            <div className="dsm-trae-model-head">
                              <div className="dsm-trae-model-copy">
                                <span className="dsm-trae-model-name">{model.name}</span>
                                <span className="dsm-trae-model-id">{model.id}</span>
                              </div>
                              {model.maxContextWindow === undefined || model.maxContext === true ? null
                                : <label className="dsm-trae-model-toggle">
                                    <input
                                      type="checkbox"
                                      checked={enabled1mModels.has(model.id)}
                                      disabled={settingsScope === undefined || settingsScope.getSnapshot().writable !== true || busy}
                                      onChange={() => { void toggle1m(model.id) }}
                                    />
                                    <span>{t('row.modelEnable1m')}</span>
                                  </label>}
                            </div>
                            <div className="dsm-trae-model-meta">
                              <span>{t('row.modelContext', { context: formatCapacity(model.contextWindow, t('row.modelUnknown')) })}</span>
                              {model.maxTokens === undefined ? null
                                : <span>{t('row.modelOutput', { output: formatCapacity(model.maxTokens, t('row.modelUnknown')) })}</span>}
                              {model.creditMultiplier === undefined ? null
                                : <span>{t('row.modelRate', { rate: model.creditMultiplier.toFixed(2) })}</span>}
                              {model.maxContext === true ? <span>{t('row.modelMaxContext')}</span> : null}
                              {model.reasoning === undefined ? null
                                : <span>{t('row.modelReasoning', { efforts: model.reasoning.supported.map(effort => EFFORT_LABELS[effort] ?? effort).join(' / ') })}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="dsm-trae-model-capability-note">{t('row.modelCapabilityPending')}</p>
                    </section>
                  </>
                : null}
              {status.status === 'signed-out' ? <p className="dsm-trae-usage-text">{t('row.signedOutHint')}</p> : null}
              {status.status === 'error' ? <p className="dsm-trae-usage-error">{status.message}</p> : null}
              <div className="dsm-trae-usage-footer">
                <div className="dsm-trae-usage-footer-left">
                  <a
                    className="dsm-trae-usage-cheer"
                    href={TRAE_GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('row.cheer')}
                    <span className="dsm-trae-usage-cheer-star" aria-hidden="true">★</span>
                  </a>
                </div>
              </div>
            </div>
          : null}
      </div>
    </li>
  )
}
