import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canAccess, hasRole, ROLE_PERMISSIONS } from './rbac.js'

const allPermissions = [...new Set(Object.values(ROLE_PERMISSIONS).flat())]
const profile = (role, overrides = {}) => ({
  user: { id: 'user-1' },
  roles: [{ code: role }],
  permissions: allPermissions,
  householdIds: ['household-1'],
  ...overrides,
})

// Independent expectations: every role receives every server permission here,
// so an accidental broad UI grant is caught even if backend data is overbroad.
const matrix = [
  // permission                ADMIN MANAGER ACCOUNTANT RESIDENT AUTHORITY
  ['household.read',             0,    1,       1,         1,       1],
  ['occupancy.read',             0,    1,       1,         1,       1],
  ['resident.read',              0,    1,       0,         1,       1],
  ['resident.identity.read',     0,    1,       0,         0,       1],
  ['residence-change.read',      0,    1,       0,         1,       1],
  ['resident.write',             0,    1,       0,         0,       0],
  ['residence-change.write',     0,    1,       0,         1,       0],
  ['residence-change.approve',   0,    1,       0,         0,       0],
  ['invoice.read',               0,    1,       1,         1,       0],
  ['invoice.write',              0,    0,       1,         0,       0],
  ['invoice.generate',           0,    0,       1,         0,       0],
  ['billing-period.read',        0,    1,       1,         1,       0],
  ['billing-period.write',       0,    0,       1,         0,       0],
  ['billing-period.issue',       0,    0,       1,         0,       0],
  ['fee-type.read',              0,    1,       1,         1,       0],
  ['fee-type.write',             0,    0,       1,         0,       0],
  ['campaign.read',              0,    1,       1,         1,       0],
  ['campaign.write',             0,    0,       1,         0,       0],
  ['contribution.read',          0,    1,       1,         1,       0],
  ['contribution.write',         0,    0,       1,         0,       0],
  ['payment.read',              0,    1,       1,         1,       0],
  ['payment.record',            0,    0,       1,         0,       0],
  ['report.revenue',            0,    1,       1,         0,       0],
  ['report.debts',              0,    1,       1,         0,       0],
  ['report.export',             0,    0,       1,         0,       0],
  ['maintenance-fund.read',     0,    1,       1,         0,       0],
  ['maintenance-fund.write',    0,    0,       1,         0,       0],
  ['maintenance-expense.record',0,    0,       1,         0,       0],
  ['payment-intent.create',     0,    0,       0,         1,       0],
  ['ticket.write',              0,    0,       0,         1,       0],
  ['user.read',                 1,    1,       0,         0,       0],
  ['user.write',                1,    1,       0,         0,       0],
  ['user.manage',               1,    1,       0,         0,       0],
  ['role.read',                 1,    0,       0,         0,       0],
  ['rbac.manage',               1,    0,       0,         0,       0],
]
const roles = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'RESIDENT', 'AUTHORITY']
test('every UI permission exists in the checked-in backend API contract', () => {
  const contract = JSON.parse(readFileSync(new URL('../../../docs/api/openapi.json', import.meta.url), 'utf8'))
  const permissions = new Set(Object.values(contract.paths).flatMap((path) =>
    Object.values(path).map((operation) => operation?.['x-permission'])))
  // Field-level grants are declared separately from endpoint permissions.
  const metadata = readFileSync(new URL('../../../backend/src/main/java/com/bluemoon/backend/api/ContractMetadata.java', import.meta.url), 'utf8')
  assert.ok(metadata.includes('"resident.identity.read"'))
  permissions.add('resident.identity.read')
  for (const permission of allPermissions) {
    assert.ok(permissions.has(permission), `Unknown backend permission: ${permission}`)
  }
})
for (const [permission, ...expected] of matrix) {
  roles.forEach((role, index) => {
    test(`${role}: ${permission} = ${Boolean(expected[index])}`, () => {
      assert.equal(canAccess(profile(role), permission, { householdId: 'household-1' }), Boolean(expected[index]))
    })
  })
}

test('every supported permission requires an explicit server grant, even for ADMIN', () => {
  for (const role of roles) {
    for (const permission of allPermissions) {
      assert.equal(canAccess(profile(role, { permissions: [] }), permission, { householdId: 'household-1' }), false)
    }
  }
})

test('unknown permissions and roles fail closed', () => {
  for (const role of [...roles, 'SUPER_ADMIN', 'admin', 'toString']) {
    assert.equal(canAccess(profile(role, { permissions: ['unknown.write'] }), 'unknown.write'), false)
  }
  for (const role of ['SUPER_ADMIN', 'admin', 'toString']) {
    assert.equal(canAccess(profile(role), 'user.manage'), false)
  }
})

test('anonymous, loading, logged-out and incomplete profiles fail closed', () => {
  for (const value of [null, {}, profile('ADMIN', { user: null }), profile('ADMIN', { isLoading: true }),
    profile('ADMIN', { isAuthenticated: false }), profile('ADMIN', { roles: null }),
    profile('ADMIN', { permissions: null })]) {
    assert.equal(canAccess(value, 'user.read'), false)
  }
})

test('resident grants require an explicit owned household for every permitted action', () => {
  for (const permission of ROLE_PERMISSIONS.RESIDENT) {
    assert.equal(canAccess(profile('RESIDENT'), permission, { householdId: 'household-1' }), true)
    for (const householdId of [undefined, null, '', 'household-2', 1]) {
      assert.equal(canAccess(profile('RESIDENT'), permission, { householdId }), false)
    }
    for (const householdIds of [[], null, 'household-1']) {
      assert.equal(canAccess(profile('RESIDENT', { householdIds }), permission, { householdId: 'household-1' }), false)
    }
  }
})

test('building-wide roles read their grants without a household context', () => {
  for (const role of ['MANAGER', 'ACCOUNTANT', 'AUTHORITY']) {
    assert.equal(canAccess(profile(role, { householdIds: [] }), 'household.read'), true)
  }
  assert.equal(canAccess(profile('ADMIN', { householdIds: [] }), 'user.read'), true)
})

test('ADMIN holds no residence or fee permission; ACCOUNTANT holds no demographic permission', () => {
  const residenceOrFee = /^(building|apartment|household|occupancy|resident|residence-change|vehicle|fee-type|fee-rate|billing-period|invoice|payment|receipt|report|maintenance-|campaign|contribution)/
  assert.deepEqual(ROLE_PERMISSIONS.ADMIN.filter((permission) => residenceOrFee.test(permission)), [])
  assert.deepEqual(ROLE_PERMISSIONS.ACCOUNTANT.filter((permission) => /^(resident|residence-change|vehicle)\./.test(permission)), [])
  assert.ok(ROLE_PERMISSIONS.AUTHORITY.every((permission) => permission.endsWith('.read')))
  const feeAction = /^(fee-type|fee-rate|billing-period|invoice|payment|receipt|maintenance-|campaign|contribution)[^.]*\.(?!read$)|^report\.export$/
  assert.deepEqual(ROLE_PERMISSIONS.MANAGER.filter((permission) => feeAction.test(permission)), [])
})

test('role strings and role DTOs are supported without accepting malformed roles', () => {
  assert.equal(hasRole(['MANAGER'], 'MANAGER'), true)
  assert.equal(hasRole([{ code: 'ADMIN' }], 'ADMIN'), true)
  assert.equal(hasRole([null, {}, 'admin'], 'ADMIN'), false)
  assert.equal(hasRole(['toString'], 'toString'), false)
})

test('multiple roles are additive and order independent, but still require server grants', () => {
  for (const codes of [['RESIDENT', 'ACCOUNTANT'], ['ACCOUNTANT', 'RESIDENT']]) {
    const mixed = profile('RESIDENT', { roles: codes })
    assert.equal(canAccess(mixed, 'invoice.read'), true)
    assert.equal(canAccess(mixed, 'resident.write'), false)
    assert.equal(canAccess(mixed, 'user.read'), false)
    assert.equal(canAccess({ ...mixed, permissions: [] }, 'invoice.read'), false)
  }
})
