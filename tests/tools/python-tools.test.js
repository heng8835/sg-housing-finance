// Runs the Python tests of the go-live tools (tools/stage_site.py, tools/public_export.py — DEC-015) as part of
// `npm test`: tests/tools/test_stage_export.py with the standard-library unittest runner. Skipped (not failed) when
// no Python 3 is on PATH; CI installs one, so there it always runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const python = ['python', 'python3', 'py'].find((cmd) => {
  const r = spawnSync(cmd, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === '3';
});

test('stage_site.py + public_export.py (python unittest on temp folders)', { skip: python ? false : 'no python 3 on PATH' }, () => {
  const r = spawnSync(python, ['-B', '-m', 'unittest', 'discover', '-s', 'tests/tools', '-p', 'test_*.py'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' }, timeout: 300000,
  });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /\nOK/);
});
