import test from 'node:test'
import assert from 'node:assert/strict'
import { roleSelectionError, STAFF_ROLE_CODES } from './roleSelection.js'

const roles = ['RESIDENT', ...STAFF_ROLE_CODES].map((code) => ({ id: `id-${code}`, code }))
test('resident is optional and every single staff role is valid with or without resident', () => {
  assert.equal(roleSelectionError(roles, ['id-RESIDENT']), '')
  for (const code of STAFF_ROLE_CODES) {
    assert.equal(roleSelectionError(roles, [`id-${code}`]), '')
    assert.equal(roleSelectionError(roles, ['id-RESIDENT', `id-${code}`]), '')
    assert.equal(roleSelectionError(roles, [`id-${code}`, 'id-RESIDENT']), '')
  }
})
test('every pair of staff roles is rejected whether or not resident is selected', () => {
  for (let i = 0; i < STAFF_ROLE_CODES.length; i++) {
    for (let j = i + 1; j < STAFF_ROLE_CODES.length; j++) {
      const pair = [`id-${STAFF_ROLE_CODES[i]}`, `id-${STAFF_ROLE_CODES[j]}`]
      assert.match(roleSelectionError(roles, pair), /tối đa một/)
      assert.match(roleSelectionError(roles, ['id-RESIDENT', ...pair]), /tối đa một/)
    }
  }
})
test('empty, unknown and duplicated role selections cannot be saved', () => {
  assert.match(roleSelectionError(roles, []), /ít nhất một/)
  assert.match(roleSelectionError(roles, ['unknown-id']), /không hợp lệ/)
  assert.match(roleSelectionError(roles, ['id-RESIDENT', 'id-RESIDENT']), /không hợp lệ/)
})
