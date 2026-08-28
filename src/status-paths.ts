/**
 * Node-free constants and types shared by the Host and browser halves.
 * Mirrors the `dsh-workbuddy-connect` status-route pattern so the plugin card
 * stays consistent with that project's external presentation.
 */

/** Plugin-owned usage endpoint consumed by its browser half. */
export const TRAE_USAGE_PATH = '/plugins/dsh-connect-trae/usage'

/** One credit pack and its remaining credit. */
export interface TraeWebCreditAccount {
  displayDesc: string
  remain: number
  size: number
}

/** Aggregated usage/credit answer rendered by the plugin card. */
export interface TraeWebCredits {
  total: number
  consumed: number
  available: number
  accounts: readonly TraeWebCreditAccount[]
}

/** Daily check-in status rendered by the card. */
export interface TraeWebCheckin {
  checkedIn: boolean
  credits: number
}

/** One reward activity rule (name + work/general credits when present). */
export interface TraeWebActivity {
  activityId: string
  enabled: boolean
  workCredits?: number
  generalCredits?: number
}

/** The JSON document the plugin card renders. */
export type TraeWebUsage =
  | { status: 'signed-out' }
  | {
    status: 'signed-in'
    credits?: TraeWebCredits
    creditsError?: string
  }
  | { status: 'error'; message: string }
