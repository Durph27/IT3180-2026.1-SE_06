import test from 'node:test'
import assert from 'node:assert/strict'
import { approvalPlacement, findApartmentByCode, householdCodeError, isActiveOn, occupancyByApartment, suggestHouseholdCode } from './householdLinks.js'

test('an occupancy is active from its start day until the day before it ends', () => {
  const row = { validFrom: '2026-11-01', validTo: '2026-11-11' }
  assert.equal(isActiveOn(row, '2026-10-31'), false)
  assert.equal(isActiveOn(row, '2026-11-01'), true)
  assert.equal(isActiveOn(row, '2026-11-10'), true)
  assert.equal(isActiveOn(row, '2026-11-11'), false)
  assert.equal(isActiveOn({ validFrom: '2024-01-01', validTo: null }, '2030-01-01'), true)
})

test('only current occupancies are mapped to their apartment', () => {
  const map = occupancyByApartment([
    { apartmentId: 'a1', householdId: 'old', validFrom: '2024-01-01', validTo: '2025-01-01' },
    { apartmentId: 'a1', householdId: 'now', validFrom: '2025-01-01', validTo: null },
    { apartmentId: 'a2', householdId: 'later', validFrom: '2027-01-01', validTo: null },
  ], '2026-11-11')
  assert.equal(map.get('a1').householdId, 'now')
  assert.equal(map.has('a2'), false)
})

test('the declared apartment is matched without case or spaces', () => {
  const apartments = [{ id: 'a1', code: 'A-2414' }, { id: 'a2', code: 'DEMO-A101' }]
  assert.equal(findApartmentByCode(apartments, ' demo-a101 ').id, 'a2')
  assert.equal(findApartmentByCode(apartments, 'B-1'), null)
  assert.equal(findApartmentByCode(apartments, ''), null)
})

test('suggested household codes are unique and fit the 30 character limit', () => {
  assert.equal(suggestHouseholdCode('a-2414'), 'HO-A-2414')
  assert.equal(suggestHouseholdCode('A-2414', ['ho-a-2414']), 'HO-A-2414-2')
  assert.equal(suggestHouseholdCode('A-2414', ['HO-A-2414', 'HO-A-2414-2']), 'HO-A-2414-3')
  const long = suggestHouseholdCode('X'.repeat(40), [`HO-${'X'.repeat(27)}`])
  assert.equal(long.length, 30)
  assert.ok(long.endsWith('-2'))
})

test('household code validation', () => {
  assert.equal(householdCodeError('  '), 'Vui lòng nhập mã hộ.')
  assert.equal(householdCodeError('X'.repeat(31)), 'Mã hộ tối đa 30 ký tự.')
  assert.equal(householdCodeError('ho-1', ['HO-1']), 'Mã hộ đã tồn tại.')
  assert.equal(householdCodeError(' HO-2 ', ['HO-1']), '')
})

test('approval placement follows the head-of-household rule', () => {
  const apartment = { status: 'VACANT' }
  assert.equal(approvalPlacement({}), 'none')
  assert.equal(approvalPlacement({ apartment: { status: 'INACTIVE' } }), 'inactive')
  assert.equal(approvalPlacement({ apartment }), 'vacant')
  assert.equal(approvalPlacement({ apartment, occupancy: {} }), 'checking')
  assert.equal(approvalPlacement({ apartment, occupancy: {}, hasHead: false }), 'open')
  assert.equal(approvalPlacement({ apartment, occupancy: {}, hasHead: true }), 'headed')
})
