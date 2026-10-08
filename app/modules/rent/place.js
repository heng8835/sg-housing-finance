// Rent & Buy → "Is this rent fair?": where you rent (Phase 7b B7) — a town and an optional block picked inside the
// card, saved with the shared rent (store plan.rent.town / bid / label, core/rentshare.js) so it survives a reload.
// With a block picked on the map the card shows "Based on" + "Change place" instead. Markup + one binder.
import { esc } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { data } from '../../core/data.js';
import { townName } from '../../core/typical.js';
import { blockInput, bindBlockSearch, blockName } from '../../core/blocksearch.js';
import { sharedRent, rentBlock } from '../../core/rentshare.js';

export const PLACE_CLS = 'rt-block';
export const PLACE_LIST = 'rtBlockList';

/** The saved rent place for this data.js: { bid|null, town|null, label } (a block that no longer matches is dropped). */
export function rentPlace(plan, hdb = data.hdb) {
  const r = sharedRent(plan);
  const bid = rentBlock(r, hdb, blockName);
  const town = bid != null ? hdb.towns[hdb.blocks[bid].t] : r.town && hdb && hdb.towns.includes(r.town) ? r.town : null;
  return { bid, town, label: bid != null ? blockName(hdb, bid) : town ? townName(town) : null };
}

/** Town select + "Block (optional)" search. towns = data.js town names. */
export function placeFields(place, towns) {
  const opts = [`<option value="">${esc(t('Map selection'))}</option>`, ...towns.map((x) => `<option value="${esc(x)}"${x === place.town ? ' selected' : ''}>${esc(townName(x))}</option>`)];
  return `<label class="f"><span>${t('Town')}</span><select id="rtTown">${opts.join('')}</select></label>
    <label class="f"><span>${t('Block (optional)')}</span>${blockInput({ cls: PLACE_CLS, listId: PLACE_LIST, value: place.bid != null ? place.label : '', placeholder: t('Search block or street') })}</label>`;
}

/** "Change place" under the "Based on" switch when a map block is in use. */
export const changePlaceLink = () => `<p class="hint"><button type="button" class="link" data-act="rent-place">${t('Change place')}</button></p>`;

/**
 * Wire the town select and the block search inside the Rent tab root. onPlace() runs after the place changed
 * (the tab then uses it: basis 'place').
 */
export function bindPlace(el, { store, onPlace }) {
  const save = (patch) => { store.set('plan.rent', { ...(store.get('plan.rent') || {}), ...patch }); onPlace(); };
  el.addEventListener('change', (e) => {
    if (e.target.id !== 'rtTown') return;
    save({ town: e.target.value || null, bid: null, label: null });
  });
  bindBlockSearch(el, {
    cls: PLACE_CLS, listId: PLACE_LIST, getHdb: () => data.hdb,
    town: () => store.get('plan.rent.town') || null,
    onPick: (bid) => save({ bid, label: blockName(data.hdb, bid), town: data.townOf(bid) }),
    onClear: () => { if (store.get('plan.rent.bid') != null) save({ bid: null, label: null }); },
  });
}

export const placeStrings = () => ['Map selection', 'Town', 'Block (optional)', 'Search block or street', 'Change place'];
