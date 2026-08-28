/**
 * Plugin-card copy registered under the settings.trae locale namespace.
 * Key shape follows `dsh-subagent-default-model`'s `row.*` convention so the
 * two plugins share one external-presentation language.
 */

export const en = {
  'row.title': 'Trae credits & models (DSH Connect Trae)',
  'row.desc': 'Use the models in the Trae desktop app directly in DSH, and see your remaining credits at a glance.',
  'row.expand': 'Expand',
  'row.collapse': 'Collapse',
  'row.signedOut': 'Not signed in',
  'row.signedOutHint': 'Sign in once in the Trae desktop app; this plugin follows that sign-in automatically.',
  'row.signedIn': 'Signed in',
  'row.requestFailed': 'Request failed',
  'row.creditsAvailableLabel': 'Available',
  'row.creditsConsumedLabel': 'Consumed',
  'row.creditsTotalLabel': 'Total',
  'row.creditsError': 'Usage unavailable: {message}',
  'row.refresh': 'Refresh',
  'row.refreshing': 'Refreshing…',
  'row.cheer': 'Star on GitHub',
} as const

export type TraeSettingsKey = keyof typeof en

export const zh: Record<TraeSettingsKey, string> = {
  'row.title': '接入使用Trae积分与模型（DSH Connect Trae）',
  'row.desc': '在 DSH 中直接使用 Trae 桌面 App 包含的模型，并随时查看剩余积分。',
  'row.expand': '展开',
  'row.collapse': '收起',
  'row.signedOut': '未登录',
  'row.signedOutHint': '在 Trae 桌面 App 里登录一次即可，插件会自动跟随当前登录的账号。',
  'row.signedIn': '已登录',
  'row.requestFailed': '请求失败',
  'row.creditsAvailableLabel': '可用',
  'row.creditsConsumedLabel': '消耗',
  'row.creditsTotalLabel': '合计',
  'row.creditsError': '用量查询失败：{message}',
  'row.refresh': '刷新',
  'row.refreshing': '正在刷新…',
  'row.cheer': '鼓励一下',
}
