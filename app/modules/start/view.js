// "Start here" markup (pure string builders, node-testable): one question per screen, then a short "You're set"
// screen with the matching tour / guide. Calm WP-A classes: .fields › label.f, .seg, .chips › .chip, .btn, .link, .hint.
// 7b B5: the screens follow the goal (answers.js questionsFor), EN · 中文 inside the dialog, no Next on tap screens.
import { t, LANGS } from '../../core/i18n.js';
import { esc, money } from '../../core/dom.js';
import { GOALS, RESIDENCY, INCOME_BANDS, AGE_MIN, AGE_MAX, goalById, incomeOf, questionsFor } from './answers.js';
import { childPart, splitPart, goalScreen, noWorkChip, goalLines, screenStrings } from './screens.js';

export const TITLES = {
  goal: 'What would you like to do?',
  who: 'Who is buying?',
  residency: 'Citizenship or residency',
  income: 'Combined monthly income',
  firstTimer: 'Is this your first HDB flat?',
  towns: 'Towns you like (optional)',
  savings: 'Savings (rough)',
  home: 'The home you own',
  rentNow: 'Your rent now',
  travel: 'Where you travel most days',
  cpfCash: 'CPF and cash (rough)',
};
// the who screen asks about the household, not buyers, for renters and retirees
const WHO_TITLE = { rent: 'Who is renting?', retire: 'Who is in your household?' };
const HELP = {
  goal: 'A few quick questions so the numbers fit you. Skip any of them — you can change everything later.',
  who: 'Ages decide loan tenure and whether the lease covers you.',
  residency: 'This decides grants, stamp duty and which flats you may buy.',
  income: 'Gross income before CPF, all buyers together. A range is fine — we use the middle of it.',
  firstTimer: 'First-timers can get grants and HDB loans that second-timers may not.',
  towns: 'The map shows only these towns. Leave empty for all of Singapore.',
  savings: 'A rough figure is fine. It lets the app check the cash part and how much CPF you can use.',
  home: 'The sale proceeds and the CPF refund depend on it. Pick your block if it is an HDB flat.',
  rentNow: 'One figure, saved in this browser: Rent & Buy and Plan use it.',
  travel: 'The map can colour blocks by public transport time to this place. Add a second place for a second worker.',
  cpfCash: 'A rough figure is fine. It is used for your CPF at 55 and the options for older owners.',
};
// one-choice screens: a tap moves on, so there is no Next button (B5)
export const TAP_SCREENS = ['goal', 'firstTimer'];

export const titleCase = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
export const titleOf = (q, a) => (q === 'who' && WHO_TITLE[a && a.goal]) || TITLES[q];

// phone overhaul §3.1: on a phone the dialog is a full-screen page and its close button says "Close" (44 px, sticky head)
const closeBtn = (act, label, phone) => (phone
  ? `<button type="button" class="btn sm st-x" data-st="${act}">${esc(t('Close'))}</button>`
  : `<button type="button" class="gp-x" data-st="${act}" aria-label="${esc(t(label))}">✕</button>`);
const pressed = (on) => `aria-pressed="${on ? 'true' : 'false'}"${on ? ' class="st-opt on"' : ' class="st-opt"'}`;
const opt = (v, cur) => `${String(v) === String(cur) ? ' selected' : ''}`;

export function bandLabel(b) {
  if (b.lo == null) return t('Under {0}', [money(b.hi)]);
  if (b.hi == null) return t('{0} or more', [money(b.lo)]);
  return t('{0} – {1}', [money(b.lo), money(b.hi)]);
}

const timerOptions = (n) => (n === 2
  ? [[true, 'Yes, for both of us'], ['mixed', 'For one of us'], [false, 'No, we have bought before']]
  : [[true, 'Yes'], [false, 'No, I have bought before']]);

function incomeBody(a, n) {
  const each = n === 2 && a.split === 'each' && !a.noWork;
  const chips = each ? '' : `<div class="chips st-chips" role="group" aria-labelledby="startTitle">${INCOME_BANDS.map((b) => { const on = a.band === b.id && a.income == null && !a.noWork; return `<button type="button" class="chip${on ? ' on' : ''}" aria-pressed="${on}" data-band="${b.id}">${esc(bandLabel(b))}</button>`; }).join('')}${noWorkChip(a)}</div>
    <div class="fields st-fields"><label class="f wide"><span>${esc(t('Or type the amount (S$ a month)'))}</span><input type="number" inputmode="numeric" min="0" step="100" data-income value="${a.noWork ? '' : a.income ?? ''}"></label></div>`;
  return chips + splitPart(a);
}

function body(q, a, towns, opts) {
  const n = a.buyers === 2 ? 2 : 1;
  switch (q) {
    case 'goal':
      return `<div class="st-list">${GOALS.map((g) => `<button type="button" data-goal="${g.id}" ${pressed(a.goal === g.id)}>
        <span class="st-t">${esc(t(g.label))}</span><span class="st-d">${esc(t(g.blurb))}</span></button>`).join('')}</div>`;
    case 'who': {
      const seg = [[1, 'Just me'], [2, 'Two of us']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${a.buyers === v}" data-buyers="${v}" class="${a.buyers === v ? 'on' : ''}">${esc(t(l))}</button>`).join('');
      const ages = a.buyers ? `<div class="fields st-fields">${Array.from({ length: a.buyers }, (_, i) => `<label class="f"><span>${esc(a.buyers === 1 ? t('Your age') : t('Buyer {0} age', [i + 1]))}</span><input type="number" inputmode="numeric" min="${AGE_MIN}" max="${AGE_MAX}" data-age="${i}" value="${a.ages[i] ?? ''}"></label>`).join('')}</div>` : '';
      return `<div class="seg" role="radiogroup" aria-labelledby="startTitle">${seg}</div>${ages}${childPart(a)}`;
    }
    case 'residency':
      return `<div class="fields st-fields">${Array.from({ length: n }, (_, i) => `<label class="f"><span>${esc(n === 1 ? t('You') : t('Buyer {0}', [i + 1]))}</span><select data-res="${i}">${RESIDENCY.map(([v, l]) => `<option value="${v}"${opt(v, a.residency[i] || 'SC')}>${esc(t(l))}</option>`).join('')}</select></label>`).join('')}</div>`;
    case 'income':
      return incomeBody(a, n);
    case 'firstTimer':
      return `<div class="st-list">${timerOptions(n).map(([v, l]) => `<button type="button" data-timer="${v}" ${pressed(a.firstTimer === v)}><span class="st-t">${esc(t(l))}</span></button>`).join('')}</div>`;
    case 'towns':
      if (!towns.length) return `<p class="hint">${esc(t('The town list appears once the map data has loaded.'))}</p>`;
      return `<div class="chips st-towns" role="group" aria-labelledby="startTitle">${towns.map((x) => { const on = a.towns.includes(x); return `<button type="button" class="chip${on ? ' on' : ''}" aria-pressed="${on}" data-town="${esc(x)}">${esc(titleCase(x))}</button>`; }).join('')}</div>`;
    default: return goalScreen(q, a, opts);
  }
}

/** EN · 中文 inside the dialog (O5): the answers are kept as a local draft and the dialog reopens after the reload. */
export function langSeg(lang = 'en') {
  return `<span class="seg st-lang" role="radiogroup" aria-label="Language / 语言">${Object.entries(LANGS).map(([code, name]) => `<button type="button" role="radio" lang="${code === 'zh' ? 'zh-Hans' : 'en'}" data-st-lang="${code}" aria-checked="${code === lang}" class="${code === lang ? 'on' : ''}">${code === 'en' ? 'EN' : esc(name)}</button>`).join('')}</span>`;
}

/**
 * One question screen. i = index in questionsFor(a). opts = { towns, hdb, hubs, payoutAge, lang }.
 * The step counter uses the goal's own number of screens; before a goal is chosen it shows only the number.
 */
export function questionHtml(i, a, { towns = [], lang = 'en', phone = false, ...opts } = {}) {
  const qs = questionsFor(a), q = qs[i], last = i === qs.length - 1;
  const step = a.goal ? t('Start here · question {0} of {1}', [i + 1, qs.length]) : t('Start here · question {0}', [i + 1]);
  const next = TAP_SCREENS.includes(q) ? '' : `<button type="button" class="btn sm primary" data-st="next">${esc(last ? t('Finish') : t('Next'))}</button>`;
  return `<div class="st-inner">
    <div class="st-head"><p class="st-step">${esc(step)}</p>
      <h2 id="startTitle">${esc(t(titleOf(q, a)))}</h2>
      ${langSeg(lang)}
      ${closeBtn('close', 'Skip for now', phone)}</div>
    <p class="st-help">${esc(t(HELP[q]))}</p>
    <div class="st-body" data-q="${q}">${body(q, a, towns, opts)}</div>
    <div class="st-foot">
      ${i > 0 ? `<button type="button" class="btn sm" data-st="back">${esc(t('Back'))}</button>` : ''}
      <span class="st-gap"></span>
      <button type="button" class="btn sm" data-st="skip">${esc(last ? t('Skip and finish') : t('Skip'))}</button>
      ${next}
    </div>
    <p class="st-alt"><button type="button" class="link" data-st="sample">${esc(t('Try a sample household instead'))}</button>
      <span aria-hidden="true">·</span> ${esc(t('Stays in this browser — nothing is sent anywhere.'))}</p>
  </div>`;
}

const RES_SHORT = { SC: 'Singapore Citizen', PR: 'Permanent Resident', F: 'Foreigner' };
const TIMER_SHORT = { true: 'first-timers', mixed: 'one first-timer', false: 'second-timers' };

/** Plain-text lines for the "You're set" screen: what was saved, what the map now shows. */
export function summaryLines(a, h, route) {
  const out = [];
  if (h) {
    const ages = h.buyers.map((b) => b.age).filter((v) => v != null);
    const who = h.buyers.length === 1 ? t('1 buyer') : t('{0} buyers', [h.buyers.length]);
    const parts = [ages.length ? `${who} (${ages.join(', ')})` : who];
    const res = [...new Set(h.buyers.map((b) => t(RES_SHORT[b.citizenship] || b.citizenship)))];
    parts.push(res.join(' + '));
    const inc = incomeOf(a);
    if (inc != null) parts.push(t('{0} a month', [money(inc)]));
    if (a.firstTimer != null && questionsFor(a).includes('firstTimer')) parts.push(t(h.buyers.length === 1 && a.firstTimer === true ? 'first-timer' : TIMER_SHORT[String(a.firstTimer)]));
    out.push(t('Saved in this browser: {0}.', [parts.join(' · ')]));
  }
  out.push(...goalLines(a));
  const v = route && route.view;
  if (v && (v.ft || v.towns)) {
    const ft = v.ft ? v.ft.map((x) => t(x)).join(', ') : t('all flat types');
    out.push(v.towns ? t('The map now shows {0} in {1}.', [ft, v.towns.map(titleCase).join(', ')]) : t('The map now shows {0}.', [ft]));
  }
  return out;
}

/** "Bigger text?" (B10, DEC-016 Q5): offered, never switched on without a tap. textSize = the current ui.textSize. */
export const TEXT_OFFER = ['large', 'larger'];
const AGAIN_PHONE = 'Open these questions again from Your household or the Menu.'; // phones: Learn lives in the Menu
const TEXT_WORDS = { large: 'Large', larger: 'Larger' };
export function textOfferHtml(textSize = 'normal') {
  const btn = (v) => `<button type="button" class="btn sm st-ts-${v}" data-st-ts="${v}" aria-pressed="${textSize === v}">${esc(t(TEXT_WORDS[v]))}</button>`;
  return `<div class="st-ts"><p class="st-next" id="stTsLbl">${esc(t('Bigger text?'))}</p>
      <p class="st-d">${esc(t('Easier to read and tap. Change it any time with the text size switch at the top (Aa on a phone).'))}</p>
      <div class="st-ts-opts" role="group" aria-labelledby="stTsLbl">${TEXT_OFFER.map(btn).join('')}</div></div>`;
}

/** The last screen: summary + the matching tour and guide + the text-size offer. */
export function doneHtml(a, h, route, { tourTitle = '', textSize = 'normal', phone = false } = {}) {
  const g = goalById(route.goal);
  const lines = summaryLines(a, h, route);
  return `<div class="st-inner">
    <div class="st-head"><p class="st-step">${esc(t('Start here'))}</p><h2 id="startTitle">${esc(t("You're set"))}</h2>
      ${closeBtn('done', 'Close', phone)}</div>
    ${lines.map((l) => `<p class="st-help">${esc(l)}</p>`).join('') || `<p class="st-help">${esc(t('Nothing was changed. You can fill in your household any time.'))}</p>`}
    <p class="st-next">${esc(t('Next for “{0}”:', [t(g.label)]))}</p>
    <div class="st-list">
      <button type="button" class="st-opt" data-st="tour"><span class="st-t">${esc(t('Take the short tour'))}</span><span class="st-d">${esc(t(tourTitle))}</span></button>
      ${route.guide ? `<button type="button" class="st-opt" data-st="guide"><span class="st-t">${esc(t('Read the guide'))}</span><span class="st-d">${esc(route.guide.title)}</span></button>` : ''}
    </div>
    ${textOfferHtml(textSize)}
    <div class="st-foot">
      ${h ? `<button type="button" class="btn sm" data-st="household">${esc(t('Check Your household'))}</button>` : ''}
      <span class="st-gap"></span>
      <button type="button" class="btn sm primary" data-st="done">${esc(t('Done'))}</button>
    </div>
    <p class="st-alt">${esc(t(phone ? AGAIN_PHONE : 'Open these questions again from Your household or Learn.'))}</p>
  </div>`;
}

/** B11: the line under the map's Flat type chips after Start here picked them ("Picked for you (just you): …"). */
const PICKED = { one: 'just you', seniors: 'two of you, both {0} or older', two: 'two of you' };
export function pickedHint(picked, ft, seniorAge) {
  if (!picked || !Array.isArray(ft) || !ft.length) return '';
  return t('Picked for you ({0}): {1}. Change any time.', [t(PICKED[picked], [seniorAge]), ft.map((x) => t(x)).join(', ')]);
}

/** Every English string this module shows (for the zh coverage test). */
export const uiStrings = () => [
  ...Object.values(TITLES), ...Object.values(WHO_TITLE), ...Object.values(HELP), ...GOALS.flatMap((g) => [g.label, g.blurb]), ...RESIDENCY.map(([, l]) => l),
  ...timerOptions(2).map(([, l]) => l), ...timerOptions(1).map(([, l]) => l), ...Object.values(TIMER_SHORT), 'first-timer',
  'Under {0}', '{0} or more', '{0} – {1}', 'Just me', 'Two of us', 'Your age', 'Buyer {0} age', 'You', 'Buyer {0}',
  'Or type the amount (S$ a month)',
  'The town list appears once the map data has loaded.', 'Start here · question {0} of {1}', 'Start here · question {0}', 'Skip for now', 'Back',
  'Skip and finish', 'Skip', 'Finish', 'Next', 'Try a sample household instead', 'Stays in this browser — nothing is sent anywhere.',
  '1 buyer', '{0} buyers', '{0} a month', 'Saved in this browser: {0}.', 'all flat types', 'The map now shows {0} in {1}.',
  'The map now shows {0}.', 'Start here', "You're set", 'Close', 'Nothing was changed. You can fill in your household any time.',
  'Next for “{0}”:', 'Take the short tour', 'Read the guide', 'Check Your household', 'Done',
  'Open these questions again from Your household or Learn.', AGAIN_PHONE,
  'Bigger text?', 'Easier to read and tap. Change it any time with the text size switch at the top (Aa on a phone).', ...Object.values(TEXT_WORDS),
  'Picked for you ({0}): {1}. Change any time.', ...Object.values(PICKED),
  ...screenStrings(),
];
