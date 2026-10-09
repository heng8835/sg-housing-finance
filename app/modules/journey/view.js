// Goal steps (Phase 8 M-07) — the markup, pure (tests run it in node). Calm by rule (Q6): a folded card like the other
// secondary cards (.section.fold), steps as plain numbered lines with ✓ text when done, one "Next step" button, no
// progress bar, no percentage, no new colour. Each step is a link: household / places / rent steps carry core/filllink.js
// data-fill attributes (its document binder opens the place), the others data-jr-step = their index (index.js).
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { GOAL_LABEL } from './steps.js';

/** Attributes that make a button go where the step's input is typed. */
export function goAttrs(go, i) {
  if (go && go.fill) return `data-fill="${esc(go.fill)}"${go.field ? ` data-field="${esc(go.field)}"` : ''}`;
  return `data-jr-step="${i}"`;
}

const stepText = (s) => t(s.text, s.vals || undefined);

/** Folded sub-line / Next button text: the first step not done, or "All steps done." */
export const nextText = (m) => (m.next >= 0 ? t('Next step: {0}', [stepText(m.steps[m.next])]) : t('All steps done.'));

/** The "Your steps" card. m = journeyModel(); open = start open. */
export function cardHtml(m, { open = false } = {}) {
  const sub = nextText(m);
  const li = (s, i) => `<li class="jr-step${s.done ? ' done' : ''}${i === m.next ? ' next' : ''}"><button type="button" class="jr-go" ${goAttrs(s.go, i)}>`
    + `<span class="jr-k" aria-hidden="true">${s.done ? '✓' : i + 1}</span><span class="jr-x">${esc(stepText(s))}`
    + `${s.done ? `<span class="jr-sr"> ${esc(t('(done)'))}</span>` : ''}</span></button></li>`;
  const nx = m.next >= 0 ? m.steps[m.next] : null;
  return `<details class="section fold jr-card" data-fold="journey"${open ? ' open' : ''}>`
    + `<summary><span class="fold-t">${esc(t(m.title))}</span><span class="fold-s">${esc(sub)}</span></summary>`
    + `<div class="fold-body"><ol class="jr-steps">${m.steps.map(li).join('')}</ol>`
    + (nx ? `<button type="button" class="btn primary jr-next" ${goAttrs(nx.go, m.next)}>${esc(sub)}</button>` : `<p class="jr-all">${esc(sub)}</p>`)
    + `<p class="jr-foot"><button type="button" class="link jr-hide" data-jr="hide">${esc(t('Hide these steps'))}</button></p></div></details>`;
}

/** Right after "Hide these steps" (until the page changes): where to find them again, and a way back. */
export function hiddenHtml({ phone = false } = {}) {
  const where = phone ? 'Steps hidden. Show them again any time from Menu → My goal.' : 'Steps hidden. Show them again any time from Learn → My goal.';
  return `<p class="hint jr-gone" role="status">${esc(t(where))} <button type="button" class="link" data-jr="unhide">${esc(t('Show them again'))}</button></p>`;
}

/** Phone Menu rows (bus 'menu:painted' slot): My goal → show the steps; change the goal (Start here). */
export function menuRowsHtml(goal) {
  if (!goal) return `<ul class="pm-list jr-menu"><li><button type="button" class="pm-go" data-jr="change"><span class="pm-l">${esc(t('My goal'))}<small>${esc(t('Not chosen yet — choose one'))}</small></span></button></li></ul>`;
  return `<ul class="pm-list jr-menu"><li><button type="button" class="pm-go" data-jr="show"><span class="pm-l">${esc(t('My goal: {0}', [t(GOAL_LABEL[goal])]))}<small>${esc(t('Show my steps'))}</small></span></button></li>`
    + `<li><button type="button" class="pm-go" data-jr="change">${esc(t('Change my goal'))}</button></li></ul>`;
}

/** Desktop Learn index line (bus 'learn:painted'): the same two actions as the phone Menu rows. */
export function learnLineHtml(goal) {
  return `${esc(t('My goal: {0}', [t(GOAL_LABEL[goal])]))} · <button type="button" class="link" data-jr="show">${esc(t('Show my steps'))}</button>`
    + ` · <button type="button" class="link" data-jr="change">${esc(t('Change my goal'))}</button>`;
}

/** Every English string here (zh coverage test; stepStrings() in steps.js has the rest). */
export const viewStrings = () => ['Next step: {0}', 'All steps done.', '(done)', 'Hide these steps', 'Show them again',
  'Steps hidden. Show them again any time from Menu → My goal.', 'Steps hidden. Show them again any time from Learn → My goal.',
  'My goal', 'Not chosen yet — choose one', 'My goal: {0}', 'Show my steps', 'Change my goal'];
