// Explore — floating block cards (hdb-data-pipeline/docs/specs/phase5-accept1-design.md §5.1). Replaces the
// one-at-a-time Leaflet popup: up to 3 cards (desktop > 900 px; one at a time below), right-anchored and packed
// right-to-left, resizable from the bottom-left grip, minimise / close, numbered pins on the map.
// The dock knows nothing about blocks' numbers — card.js gives it { title, exec, body, mount }.
// Pure layout helpers are exported for node tests (tests/explore/dock.test.js); createDock() is browser-only.
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';

export const MAX_CARDS = 3;
export const SOLO_MAX_W = 900;       // px viewport: at or below this, one card at a time
export const PHONE_MAX_W = 767;
export const GAP = 12, TOP = 64, BOTTOM = 56, CASCADE = 28, ZOOM_CLEAR = 56;
export const DEFAULT_W = 380, DEFAULT_H = 720, MIN_W = 320, MAX_W = 640, MIN_H = 360;
const PIN_FRONT = '#1b1b19', PIN_BACK = '#52514e', RING = '#1b1b19';

const clamp = (v, lo, hi) => (hi < lo ? hi : Math.min(hi, Math.max(lo, v)));
/** Map height a card may use: map − top − bottom (compare bar 44 + 12). */
export const availHeight = (mapH, top = TOP) => Math.max(0, mapH - top - BOTTOM);
/** W 320 … min(640, mapW − 68); H 360 … availH (a map smaller than the minimum wins). */
export function clampSize({ w, h }, { mapW, availH }) {
  return { w: Math.round(clamp(w, MIN_W, Math.min(MAX_W, mapW - 68))), h: Math.round(clamp(h, MIN_H, availH)) };
}
/** New cards: the last size the user chose, else 380 × min(720, availH). */
export const defaultSize = (geom, saved) => clampSize(saved && saved.w > 0 && saved.h > 0 ? saved : { w: DEFAULT_W, h: Math.min(DEFAULT_H, geom.availH) }, geom);

/**
 * Right-to-left packing: card k at right = 12 + Σ(widths before) + 12k, top = `top`. A card whose left edge would cross
 * cover + 56 (the zoom control beside the panel) cascades instead: on top of the left-most packed card, +28 px down and
 * +28 px left per extra card. sizes: [{ w, h }] in slot order → [{ right, top, w, h, cascade }].
 */
export function placeCards(sizes, { mapW, cover = 0, top = TOP, availH = Infinity }) {
  const out = []; let right = GAP, anchor = null, j = 0;
  for (const s of sizes) {
    const fits = mapW - right - s.w >= cover + ZOOM_CLEAR;
    if (!anchor || (fits && !j)) {
      const p = { right, top, w: s.w, h: s.h, cascade: false };
      out.push(p); anchor = p; right += s.w + GAP;
    } else {
      j++;
      out.push({ right: anchor.right + CASCADE * j, top: anchor.top + CASCADE * j, w: s.w, h: Math.max(0, Math.min(s.h, availH - CASCADE * j)), cascade: true });
    }
  }
  return out;
}

/** Least recently used of [{ key, used }] → key (null when empty). */
export const lruVictim = (cards) => (cards.length ? cards.reduce((a, c) => (c.used < a.used ? c : a)).key : null);
/** Opening one more card: which open card closes (LRU when full) and which slot (0-based) the new one takes. */
export function admit(cards, max = MAX_CARDS) {
  if (cards.length >= max) { const key = lruVictim(cards); return { evict: key, slot: cards.find((c) => c.key === key).slot }; }
  let slot = 0; while (cards.some((c) => c.slot === slot)) slot++;
  return { evict: null, slot };
}

// ------------------------------------------------------------------ browser
/**
 * ctx: { map, L, canvas, bus, root (#cardDock), live (#cardLive), panelCover(), getSize(), setSize({ w, h }),
 *        at(key) → { lat, lon, label }, onPick(key), showOnMap(key), onChange(keys) }.
 */
export function createDock(ctx) {
  const { map, L, canvas, bus, root, live } = ctx;
  const cards = []; // { key, slot, used, title, el, scroll, exec, size, min, dispose, pin, ring }
  let clock = 0, chips = false, raf = 0;
  const pins = L.layerGroup().addTo(map);
  const solo = () => innerWidth <= SOLO_MAX_W, phone = () => innerWidth <= PHONE_MAX_W;
  const max = () => (solo() ? 1 : MAX_CARDS);
  const find = (key) => cards.find((c) => c.key === key);
  const front = () => cards.reduce((a, c) => (!a || c.used > a.used ? c : a), null);
  const say = (msg) => { if (!live) return; live.textContent = ''; requestAnimationFrame(() => { live.textContent = msg; }); };

  function topOffset() {
    const s = document.getElementById('drawnStrip');
    if (!s || s.style.display === 'none' || !s.offsetHeight) return TOP;
    return Math.max(TOP, Math.round(s.getBoundingClientRect().bottom - root.getBoundingClientRect().top + 8));
  }
  function geom() { const top = topOffset(); return { mapW: root.clientWidth, availH: availHeight(root.clientHeight, top), top, cover: ctx.panelCover() }; }

  function layout() {
    raf = 0;
    root.classList.toggle('solo', solo());
    const order = [...cards].sort((a, b) => a.used - b.used);
    order.forEach((c, i) => { c.el.style.zIndex = String(i + 1); });
    if (solo()) { for (const c of cards) for (const k of ['right', 'top', 'width', 'height', 'maxHeight']) c.el.style[k] = ''; drawPins(); return; }
    const g = geom(), bySlot = [...cards].sort((a, b) => a.slot - b.slot);
    const sizes = bySlot.map((c) => (c.size = clampSize(c.size, g)));
    placeCards(sizes, g).forEach((p, i) => {
      const s = bySlot[i].el.style;
      s.right = p.right + 'px'; s.top = p.top + 'px'; s.width = p.w + 'px'; s.height = bySlot[i].min ? 'auto' : p.h + 'px';
      s.maxHeight = (g.availH - (p.top - g.top)) + 'px';
    });
    drawPins();
  }
  const relayout = () => { if (!raf) raf = requestAnimationFrame(layout); };

  const PIN_PATH = 'M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 36 12 36s12-15.2 12-24.1C24 5.3 18.6 0 12 0z';
  const pinIcon = (n, color) => L.divIcon({ className: 'sel-pin bc-pin', iconSize: [26, 38], iconAnchor: [13, 37],
    html: `<svg viewBox="0 0 24 36" width="26" height="38" aria-hidden="true"><path d="${PIN_PATH}" fill="${color}" stroke="#fff" stroke-width="1.5"/><text x="12" y="15.8" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff" font-family="system-ui, sans-serif">${n}</text></svg>` });
  function drawPins() {
    pins.clearLayers();
    const f = front();
    for (const c of [...cards].sort((a, b) => a.used - b.used)) { // the front pin is drawn last (on top)
      const b = c.noPin ? null : ctx.at(c.key); if (!b) continue; // school cards (B3) have no numbered pin
      if (!chips) L.circleMarker([b.lat, b.lon], { renderer: canvas, radius: 10, color: RING, weight: 2.5, fill: false, interactive: false }).addTo(pins);
      c.pin = L.marker([b.lat, b.lon], { icon: pinIcon(c.slot + 1, c === f ? PIN_FRONT : PIN_BACK), keyboard: false, zIndexOffset: 1000 + c.used, title: b.label })
        .on('click', () => ctx.onPick(c.key)).addTo(pins);
      if (c.hot) c.pin.getElement()?.classList.add('hot');
    }
  }
  function toFront(c) { if (front() === c) return; c.used = ++clock; layout(); }
  function pulse(c) { c.el.classList.remove('pulse'); void c.el.offsetWidth; c.el.classList.add('pulse'); setTimeout(() => c.el.classList.remove('pulse'), 650); }
  function setMin(c, on) {
    c.min = on; c.el.classList.toggle('min', on);
    const b = c.el.querySelector('[data-w="min"]');
    b.textContent = on ? '▢' : '–'; b.setAttribute('aria-label', on ? t('Restore') : t('Minimise')); b.title = b.getAttribute('aria-label'); b.setAttribute('aria-expanded', String(!on));
    layout();
  }
  function close(key, { refocus = true } = {}) {
    const c = find(key); if (!c) return;
    const inside = c.el.contains(document.activeElement);
    c.dispose(); c.el.remove(); cards.splice(cards.indexOf(c), 1);
    layout(); ctx.onChange(list());
    if (refocus && inside) map.getContainer().focus();
  }

  function build(c, content) {
    const id = `bc-${c.key}-t`, btn = (w, label, glyph) => `<button type="button" class="bc-ib" data-w="${w}" aria-label="${esc(label)}" title="${esc(label)}">${glyph}</button>`;
    const el = document.createElement('section');
    el.className = 'bc-win'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', id); el.dataset.key = c.key;
    el.innerHTML = `<div class="bc-bar">${c.noPin ? '' : `<span class="bc-num" aria-hidden="true">${c.slot + 1}</span>`}<h4 class="bc-wt" id="${id}" title="${esc(content.title)}">${esc(content.title)}</h4>`
      + `${btn('map', t('Show on map'), '⌖')}${btn('min', t('Minimise'), '–')}${btn('close', t('Close card'), '×')}</div>`
      + `<p class="bc-exec"></p><div class="bc-scroll"></div><button type="button" class="bc-grip" aria-label="${esc(t('Resize card'))}" title="${esc(t('Resize card'))}"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1L11 11M1 5L7 11M1 9L3 11" stroke="currentColor" stroke-width="1" fill="none"/></svg></button>`;
    c.el = el; c.exec = el.querySelector('.bc-exec'); c.scroll = el.querySelector('.bc-scroll');
    el.querySelector('[data-w="min"]').setAttribute('aria-expanded', 'true');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]');
      if (b) { if (b.dataset.w === 'close') close(c.key); else if (b.dataset.w === 'min') setMin(c, !c.min); else ctx.showOnMap(c.key); return; }
      if (c.min && e.target.closest('.bc-bar')) setMin(c, false);
    });
    el.addEventListener('pointerdown', () => toFront(c), true);
    el.addEventListener('focusin', () => toFront(c));
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(c.key); } });
    el.addEventListener('mouseenter', () => { c.hot = true; c.pin?.getElement()?.classList.add('hot'); });
    el.addEventListener('mouseleave', () => { c.hot = false; c.pin?.getElement()?.classList.remove('hot'); });
    wireGrip(c, el.querySelector('.bc-grip'));
    root.appendChild(el);
  }

  function wireGrip(c, grip) {
    let d = null;
    const apply = (w, h, keep) => { c.size = clampSize({ w, h }, geom()); layout(); if (keep) ctx.setSize(c.size); };
    const reset = () => { const g = geom(); apply(DEFAULT_W, Math.min(DEFAULT_H, g.availH), true); };
    grip.addEventListener('pointerdown', (e) => { if (e.button) return; e.preventDefault(); grip.setPointerCapture(e.pointerId); d = { x: e.clientX, y: e.clientY, w: c.size.w, h: c.size.h }; });
    grip.addEventListener('pointermove', (e) => {
      if (!d) return; const w = d.w + (d.x - e.clientX), h = d.h + (e.clientY - d.y); // right-anchored: dragging left widens
      cancelAnimationFrame(c.rz); c.rz = requestAnimationFrame(() => apply(w, h, false));
    });
    const end = () => { if (!d) return; d = null; ctx.setSize(c.size); };
    grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
    grip.addEventListener('dblclick', reset);
    grip.addEventListener('keydown', (e) => {
      const k = e.shiftKey ? 64 : 16;
      const dw = { ArrowLeft: k, ArrowRight: -k }[e.key] || 0, dh = { ArrowUp: -k, ArrowDown: k }[e.key] || 0;
      if (e.key === 'Enter') { e.preventDefault(); reset(); return; }
      if (!dw && !dh) return;
      e.preventDefault(); e.stopPropagation(); apply(c.size.w + dw, c.size.h + dh, true);
    });
  }

  /** Open a card (or bring an open one to the front with a pulse). content: { title, exec, body, mount(el) → dispose, pin? (false = no number / pin: the B3 school card) }. */
  function open(key, content) {
    const have = find(key);
    if (have) { if (have.min) setMin(have, false); toFront(have); pulse(have); return have.el; }
    const a = admit(cards, max());
    if (a.evict != null) { const v = find(a.evict); close(a.evict, { refocus: false }); if (max() > 1) say(t('Up to 3 cards — closed {0}.', [v.title])); }
    const c = { key, slot: a.slot, used: ++clock, title: content.title, min: false, dispose: () => {}, size: defaultSize(geom(), ctx.getSize()), noPin: content.pin === false };
    build(c, content); cards.push(c);
    fill(c, content);
    layout(); ctx.onChange(list());
    if (phone()) bus?.emit('sheet:size', 'peek'); // the phone sheet never covers the card
    return c.el;
  }
  function fill(c, content, fade) {
    const top = c.scroll.scrollTop;
    c.dispose();
    c.exec.innerHTML = content.exec || ''; c.exec.hidden = !content.exec;
    c.scroll.innerHTML = content.body;
    c.scroll.scrollTop = top;
    c.dispose = (content.mount && content.mount(c.el)) || (() => {});
    if (fade) { for (const el of [c.exec, ...c.el.querySelectorAll('.bc-tiles')]) { el.classList.remove('bc-fade'); void el.offsetWidth; el.classList.add('bc-fade'); } }
  }
  /** Rebuild an open card in place (keeps scroll position, size, minimised state). */
  function update(key, content) { const c = find(key); if (c) fill(c, content, true); }
  const list = () => [...cards].sort((a, b) => a.slot - b.slot).map((c) => c.key);

  // keep the layout in step with the map, the panel and the window
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(relayout); ro.observe(root); const s = document.getElementById('drawnStrip'); if (s) ro.observe(s); }
  const app = document.getElementById('app'); if (app && typeof MutationObserver !== 'undefined') new MutationObserver(relayout).observe(app, { attributes: true, attributeFilter: ['class'] });
  bus?.on?.('panel:resized', relayout);
  let rt = null;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { while (cards.length > max()) close(lruVictim(cards), { refocus: false }); layout(); }, 150); });

  return {
    open, update, close, list, has: (key) => !!find(key), relayout, say,
    chipsOn(on) { if (chips !== on) { chips = on; drawPins(); } },
  };
}
