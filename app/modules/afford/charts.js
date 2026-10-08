// Tiny hand-rolled SVG/HTML charts for the Afford tab (no library, no build step).
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';

export const PALETTE = {
  'down-cash': '#c2410c', down: '#2a78d6', bsd: '#7c3aed', absd: '#be185d', fees: '#64748b', 'hdb-fees': '#94a3b8', cov: '#dc2626',
  cash: '#c2410c', cpf: '#2a78d6', interest: '#f59e0b', principal: '#2a78d6',
};
export const LABELS = {
  'down-cash': 'Downpayment (cash only)', down: 'Downpayment', bsd: "Buyer's stamp duty", absd: 'Additional stamp duty (ABSD)',
  fees: 'Legal fees (est.)', 'hdb-fees': 'HDB fees', cov: 'Cash over valuation',
};

/** Horizontal stacked bar + legend. parts: [{id, amount}] */
export function stackBar(parts, label) {
  const total = parts.reduce((t, p) => t + p.amount, 0) || 1;
  const bar = parts.map((p) => `<span style="width:${(p.amount / total) * 100}%;background:${PALETTE[p.id] || '#999'}" title="${esc(t(LABELS[p.id] || p.label || p.id))}: ${money(p.amount)}"></span>`).join('');
  const legend = parts.map((p) => `<span><i style="background:${PALETTE[p.id] || '#999'}"></i>${esc(t(LABELS[p.id] || p.label || p.id))} ${money(p.amount)}</span>`).join('');
  return `<div class="stackbar" role="img" aria-label="${esc(label)}">${bar}</div><div class="legend-row">${legend}</div>`;
}

/** Yearly principal vs interest as stacked columns. rows: [{year, interest, principal}] */
export function repaymentChart(rows) {
  if (!rows.length) return '';
  const W = 320, H = 130, pad = { l: 34, r: 4, t: 6, b: 18 };
  const max = Math.max(...rows.map((r) => r.interest + r.principal));
  const bw = (W - pad.l - pad.r) / rows.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const bars = rows.map((r, i) => {
    const x = pad.l + i * bw, yi = y(r.interest), yp = y(r.interest + r.principal);
    return `<rect x="${x + 0.5}" y="${yi}" width="${Math.max(1, bw - 1)}" height="${H - pad.b - yi}" fill="${PALETTE.interest}"><title>${t('Year {0}: interest {1}', [r.year, money(r.interest)])}</title></rect>`
      + `<rect x="${x + 0.5}" y="${yp}" width="${Math.max(1, bw - 1)}" height="${yi - yp}" fill="${PALETTE.principal}"><title>${t('Year {0}: principal {1}', [r.year, money(r.principal)])}</title></rect>`;
  }).join('');
  const ticks = [0, max / 2, max].map((v) => `<text x="${pad.l - 4}" y="${y(v) + 3}" text-anchor="end">${Math.round(v / 1000)}k</text>`).join('');
  const xt = [1, Math.ceil(rows.length / 2), rows.length].map((yr) => `<text x="${pad.l + (yr - 0.5) * bw}" y="${H - 4}" text-anchor="middle">y${yr}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Yearly repayments: principal (blue) and interest (amber)')}">${ticks}${xt}${bars}</svg>
    <div class="legend-row"><span><i style="background:${PALETTE.principal}"></i>${t('Principal')}</span><span><i style="background:${PALETTE.interest}"></i>${t('Interest')}</span></div>`;
}

export function repaymentTable(rows) {
  return `<table class="mini"><thead><tr><th>${t('Year')}</th><th>${t('Interest')}</th><th>${t('Principal')}</th><th>${t('Balance')}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.year}</td><td>${money(r.interest)}</td><td>${money(r.principal)}</td><td>${money(r.balance)}</td></tr>`).join('')}</tbody></table>`;
}
