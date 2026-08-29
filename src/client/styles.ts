/**
 * Client styles for the Trae plugin card.
 * Copied verbatim from `dsh-subagent-default-model`'s SETTINGS_CSS so the two
 * plugins share one external-presentation language (same card shell, same
 * button primitives, same `--dsw-alias-*` token palette).
 */

export const TRAE_CARD_CSS = `
.dsm-plugin-card{border:1px solid var(--dsw-alias-border-l2,#36373b);background:var(--dsw-alias-bg-layer-3,#202126);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}
.dsm-plugin-card:hover{border-color:var(--dsw-alias-label-dimmed,#777)}
.dsm-plugin-card-open{background:var(--dsw-alias-bg-layer-2,#25262b);border-color:var(--dsw-alias-label-dimmed,#777)}
.dsm-plugin-card-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:transparent;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.dsm-plugin-card-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:-2px}
.dsm-plugin-card-head{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.dsm-plugin-card-title{color:var(--dsw-alias-label-primary,#e6e6e6);font-size:15px;font-weight:600;line-height:1.4}
.dsm-plugin-card-description{color:var(--dsw-alias-label-tertiary,#999);font-size:13px;line-height:1.5}
.dsm-plugin-card-chevron{color:var(--dsw-alias-label-tertiary,#999);flex:none;display:inline-flex;transition:transform .16s}
.dsm-plugin-card-chevron-open{transform:rotate(180deg)}
.dsm-plugin-card-body{border-top:1px solid var(--dsw-alias-border-l2,#36373b);margin:0 16px;padding:0 0 8px}
.dsm-plugin-card-icon{width:32px;height:32px;flex:none;border-radius:7px}
.dsm-plugin-card-body .dsm-model-settings{margin:0;padding:12px 0 0;background:transparent;border:0;border-radius:0}
.dsm-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.dsm-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:1px}
.dsm-btn:disabled{opacity:.4;cursor:default}
.dsm-btn-outline{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:transparent}
.dsm-btn-outline:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.dsm-btn-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.dsm-btn-primary:hover:not(:disabled){opacity:.9}
.dsm-trae-usage{display:flex;flex-direction:column;gap:16px;margin:0;padding:14px 0 4px}
.dsm-trae-usage-account{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dsm-trae-usage-account-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
.dsm-trae-usage-expiry{padding-left:19px;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px}
.dsm-trae-usage-list{display:flex;flex-direction:column;gap:10px}
.dsm-trae-usage-text{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary,#b8b8b8)}
.dsm-trae-usage-error{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-state-error-primary,#ef4444)}
.dsm-trae-usage-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
.dsm-trae-usage-status{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:500;color:var(--dsw-alias-label-primary,#e6e6e6)}
.dsm-trae-usage-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:2px}
.dsm-trae-usage-stat{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#232529);min-width:0}
.dsm-trae-usage-stat-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#999)}
.dsm-trae-usage-stat-value{font-size:16px;line-height:22px;font-weight:600;color:var(--dsw-alias-label-primary,#e6e6e6);white-space:nowrap}
.dsm-trae-models{display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--dsw-alias-border-l2,#36373b);padding-top:14px}
.dsm-trae-models-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dsm-trae-models-title{margin:0;color:var(--dsw-alias-label-primary,#e6e6e6);font-size:14px;font-weight:600;line-height:20px}
.dsm-trae-models-summary{margin:2px 0 0;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px}
.dsm-trae-model-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:10px;overflow:hidden}
.dsm-trae-model{display:grid;grid-template-columns:minmax(0,1fr);gap:7px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2,#232529)}
.dsm-trae-model+.dsm-trae-model{border-top:1px solid var(--dsw-alias-border-l2,#36373b)}
.dsm-trae-model-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.dsm-trae-model-copy{display:flex;align-items:baseline;gap:8px;min-width:0}
.dsm-trae-model-name{color:var(--dsw-alias-label-primary,#e6e6e6);font-size:13px;font-weight:500;line-height:19px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsm-trae-model-id{color:var(--dsw-alias-label-tertiary,#999);font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsm-trae-model-meta{display:flex;align-items:center;gap:7px 12px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary,#999);font-size:11px;line-height:16px}
.dsm-trae-model-toggle{display:inline-flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary,#b8b8b8);cursor:pointer;font-size:13px;line-height:19px;font-weight:500}
.dsm-trae-model-toggle input{margin:0;accent-color:var(--dsw-alias-brand-primary,#5686fe)}
.dsm-trae-model-capability-note{margin:0;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px}
.dsm-trae-usage-footer{display:flex;align-items:center;border-top:1px solid var(--dsw-alias-border-l2,#36373b);padding-top:12px}
.dsm-trae-usage-footer-left{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.dsm-trae-usage-cheer{display:inline-flex;align-items:center;gap:4px;flex:none;text-decoration:underline;text-underline-offset:2px;color:var(--dsw-alias-label-tertiary,#999);font-size:13px;line-height:1.5;transition:color .16s}
.dsm-trae-usage-cheer-star{font-size:12px;line-height:1;display:inline-flex}
.dsm-trae-usage-cheer:hover{color:var(--dsw-alias-label-primary,#e6e6e6)}
.dsm-trae-usage-cheer:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5686fe);outline-offset:2px}
`
