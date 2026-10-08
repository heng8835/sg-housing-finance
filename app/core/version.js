// App version for Learn → About (Phase 7b): the git short SHA that tools/stage_site.py writes into the deployed
// config.js, or 'dev' when the app runs from the repo.
import { BUILD_SHA, DONATE_URL } from '../config.js';

export const appVersion = () => (typeof BUILD_SHA === 'string' && BUILD_SHA ? BUILD_SHA : 'dev');

/** The owner's donation page (https only) or '' — About hides "Support this project" when empty (DEC-019). */
export const donateUrl = (u = DONATE_URL) => (typeof u === 'string' && u.startsWith('https:') ? u : '');
