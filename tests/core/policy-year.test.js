import { test } from 'node:test';
import assert from 'node:assert/strict';
import { policy } from '../helpers.js';

test('policy.forYear resolves rules on 1 Jan of that year and caches it', () => {
  const p = policy.forYear(2030);
  assert.equal(p, policy.forYear(2030));
  assert.ok(p.get('cpf.retirement_sums'));
  assert.equal(p.meta('cpf.retirement_sums').effective_from <= '2030-01-01', true);
  assert.equal(p.get('cpf.age.ra_formation'), policy.get('cpf.age.ra_formation'));
});
