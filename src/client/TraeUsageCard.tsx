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
import { TRAE_USAGE_PATH } from '../status-paths.ts'
import type { TraeWebUsage } from '../status-paths.ts'
import { TRAE_PLUGIN_ICON } from './icon.ts'
import { TRAE_CARD_CSS } from './styles.ts'
import type { TraeSettingsKey } from './locales.ts'

/** Localized copy injected by the browser-plugin registration. */
export interface TraeUsageCardInjected {
  t: (key: TraeSettingsKey, params?: Record<string, unknown>) => string
}

/** Props delivered by the Plugin configuration item slot. */
export type TraeUsageCardProps =
  PropsRuntime<'settings.plugin.item'>
  & Partial<TraeUsageCardInjected>

const POLL_INTERVAL_MS = 60_000

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

function dotStyle(status: TraeWebUsage['status']): Record<string, string> {
  const color = status === 'signed-in'
    ? 'var(--dsw-alias-state-success-primary, #22a06b)'
    : status === 'error'
      ? 'var(--dsw-alias-state-error-primary, #d92d20)'
      : 'var(--dsw-alias-label-dimmed, #9aa0a6)'
  return { background: color }
}

/** Render Trae sign-in state and the total usage summary as one expandable card. */
export function TraeUsageCard({ t }: TraeUsageCardProps) {
  if (t === undefined) throw new Error('Trae usage card requires its translation function')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<TraeWebUsage>({ status: 'signed-out' })
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

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

  const title = t('row.title')
  const label = status.status === 'signed-in'
    ? t('row.signedIn')
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
                <div className="dsm-trae-usage-status" role="status">
                  <span aria-hidden="true" className="dsm-trae-usage-dot" style={dotStyle(status.status)} />
                  <span>{label}</span>
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
                  </>
                : null}
              {status.status === 'signed-out' ? <p className="dsm-trae-usage-text">{t('row.signedOutHint')}</p> : null}
              {status.status === 'error' ? <p className="dsm-trae-usage-error">{status.message}</p> : null}
            </div>
          : null}
      </div>
    </li>
  )
}
