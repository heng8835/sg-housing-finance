// Guides HTML (pure apart from t()): the Guides list for the Learn sheet, a guide step, the quiz and its feedback.
// Guide text comes from content/guides*.json (built + escaped by tools/build_content.py); {policy:id} and
// {live:key} are filled here from the policy file and the live values passed in.
import { esc } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { fillPolicy, sourceHost } from '../../core/policyfmt.js';
import { fillLive, NEED_WORDS } from './live.js';

export const DISCLAIMER = 'Educational guide — not financial advice. Rules change: check HDB, CPF Board, IRAS, MAS and your bank before you decide.';

/** Guides list (top of the Learn sheet): one card per guide with ~minutes, step count and ✓ done. */
export function listHtml(guides, done = {}) {
  const cards = guides.map((g) => {
    const d = done[g.id];
    const meta = [t('~{0} min', [g.est_minutes]), t('{0} steps', [g.steps.length])].join(' · ');
    return `<li><button type="button" class="g-card" data-guide-open="${esc(g.id)}">
      <span class="g-card-t">${g.title}</span><span class="g-card-d">${g.summary}</span>
      <span class="g-card-m">${esc(meta)}${d ? ` <span class="tag good" title="${esc(t('Done on {0}', [d.done]))}">${esc(t('✓ Done'))}</span>` : ''}</span></button></li>`;
  }).join('');
  return `<section class="g-list" aria-labelledby="gListTitle"><h3 id="gListTitle">${esc(t('Guides'))}</h3>
    <ul class="g-cards">${cards}</ul>
    <p class="g-log-link"><button type="button" class="link" data-guide-log>${esc(t('Rules and recent changes →'))}</button></p></section>`;
}

/** "Sources: hdb.gov.sg · mas.gov.sg" for the policy ids a step uses (title = id · status · from · retrieved; Simple: no id, no rules-file version). */
export function sourcesHtml(ids, policy, { simple = false } = {}) {
  const hosts = new Map();
  for (const id of ids) {
    let p; try { p = policy.meta(id); } catch { continue; }
    if (!/^https?:/.test(p.source_url || '')) continue;
    const host = sourceHost(p.source_url);
    if (!hosts.has(host)) hosts.set(host, { url: p.source_url, rows: [] });
    hosts.get(host).rows.push(simple ? t('{0}, from {1}, retrieved {2}', [t(p.status.toLowerCase()), p.effective_from, p.retrieved]) : t('{0}: {1}, from {2}, retrieved {3}', [p.id, t(p.status.toLowerCase()), p.effective_from, p.retrieved]));
  }
  if (!hosts.size) return '';
  const links = [...hosts.entries()].map(([host, x]) => `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.rows.join('\n'))}">${esc(host)}</a>`);
  return `<p class="g-src">${esc(t('Sources'))}: ${links.join(' · ')}${simple ? '' : ` <small class="muted">· ${esc(t('rules file {0}', [policy.version]))}</small>`}</p>`;
}

/** The "add X in Household / pick a flat" box for values that are still "—". */
export function needsHtml(needs) {
  if (!needs.length) return '';
  const words = needs.map((n) => `<b>${esc(t(NEED_WORDS[n]))}</b>`).join(', ');
  const hh = needs.filter((n) => n !== 'flat');
  return `<div class="need" role="note"><span class="need-ic" aria-hidden="true">ⓘ</span>
    <p>${t('Numbers shown as — need {0}.', [words])}</p>
    <div class="need-act">${hh.length ? `<button type="button" class="btn sm" data-guide-need="${esc(hh[0])}">${esc(t('Add in About you →'))}</button>` : ''}
      ${needs.includes('flat') ? `<button type="button" class="link" data-guide-need="flat">${esc(t('Pick a flat or enter a price in Afford →'))}</button>` : ''}</div></div>`;
}

/** One step of the reader. `live` = resolveLive result; `canShow` = the step has a target / fallback. */
export function stepHtml(g, i, { policy, live, simple = false }) {
  const s = g.steps[i], n = g.steps.length, last = i === n - 1;
  const fill = (h) => fillLive(fillPolicy(h, policy), live.values);
  const dots = g.steps.map((_, k) => `<span class="g-dot${k === i ? ' on' : k < i ? ' past' : ''}"></span>`).join('');
  return `<p class="g-count">${esc(t('Step {0} of {1}', [i + 1, n]))}</p>
    <div class="g-dots" aria-hidden="true">${dots}</div>
    ${i === 0 && g.intro ? `<div class="md g-intro">${fill(g.intro)}</div>` : ''}
    <section class="section g-step" aria-labelledby="gStepTitle">
      <h3 id="gStepTitle">${s.title}</h3>
      <div class="md">${fill(s.body)}</div>
      ${needsHtml(live.needs)}
      ${s.target || (s.fallback && s.fallback.length) ? `<div class="actions"><button type="button" class="btn sm" data-guide-show>${esc(t('Show me in the app'))}</button></div>` : ''}
      ${sourcesHtml(s.policy || [], policy, { simple })}
    </section>
    <div class="g-nav">
      <button type="button" class="btn sm" data-guide-step="${i - 1}"${i === 0 ? ' disabled' : ''}>${esc(t('Back'))}</button>
      <span class="g-gap"></span>
      ${last ? `<button type="button" class="btn sm primary" data-guide-quiz>${esc(t('Check what you learned →'))}</button>`
        : `<button type="button" class="btn sm primary" data-guide-step="${i + 1}">${esc(t('Next'))}</button>`}
    </div>
    <p class="foot-note">${esc(t(DISCLAIMER))}</p>`;
}

/** Quiz view: every question with its options; answered ones show ✓ / ✕, the explanation and "Learn more". */
export function quizHtml(g, answers, { policy, tourTitle = null }) {
  const qs = g.quiz, n = qs.length;
  const answered = qs.filter((_, k) => answers[k] != null).length;
  const score = qs.filter((q, k) => answers[k] === q.answer).length;
  const items = qs.map((q, k) => {
    const a = answers[k];
    const opts = q.options.map((o, j) => {
      const cls = a == null ? '' : j === q.answer ? ' right' : j === a ? ' wrong' : '';
      const mark = a == null ? '' : j === q.answer ? '<span class="g-mark" aria-hidden="true">✓</span>' : j === a ? '<span class="g-mark" aria-hidden="true">✕</span>' : '';
      return `<li><button type="button" class="g-opt${cls}" data-guide-answer="${k}:${j}"${a != null ? ' disabled' : ''}${a === j ? ' aria-pressed="true"' : ''}>${mark}<span>${fillPolicy(o, policy)}</span></button></li>`;
    }).join('');
    const fb = a == null ? '' : `<div class="g-fb ${a === q.answer ? 'right' : 'wrong'}" role="status">
      <b>${esc(t(a === q.answer ? 'Correct.' : 'Not quite.'))}</b> ${fillPolicy(q.explain, policy)}
      ${q.term ? `<button type="button" class="link" data-guide-term="${esc(q.term)}">${esc(t('Learn more →'))}</button>` : ''}</div>`;
    return `<li class="g-q"><p class="g-q-t"><span class="muted">${k + 1}.</span> ${q.q}</p><ul class="g-opts">${opts}</ul>${fb}</li>`;
  }).join('');
  const finished = answered === n;
  return `<p class="g-count">${esc(t('Quick check · {0} of {1} answered', [answered, n]))}</p>
    <section class="section g-quiz" aria-labelledby="gQuizTitle"><h3 id="gQuizTitle">${esc(t('Check what you learned'))}</h3>
      <ol class="g-qs">${items}</ol>
      ${finished ? `<p class="g-score" role="status">${esc(t('You got {0} of {1} right.', [score, n]))} ${esc(t(score === n ? 'Well done — this guide is marked as done.' : 'This guide is marked as done; try again any time.'))}</p>` : ''}
    </section>
    <div class="g-nav">
      <button type="button" class="btn sm" data-guide-step="${g.steps.length - 1}">${esc(t('Back to the steps'))}</button>
      <span class="g-gap"></span>
      ${finished ? `<button type="button" class="btn sm" data-guide-retry>${esc(t('Try again'))}</button> <button type="button" class="btn sm primary" data-guide-list>${esc(t('All guides'))}</button>` : ''}
    </div>
    ${tourTitle ? `<p class="hint">${esc(t('Prefer a quick tour of the screens?'))} <button type="button" class="link" data-guide-tour>${esc(t('Take the tour →'))}</button></p>` : ''}
    <p class="foot-note">${esc(t(DISCLAIMER))}</p>`;
}
