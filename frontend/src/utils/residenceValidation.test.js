import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addCalendarDays,
  addCalendarMonths,
  classifyResidenceChangeLifecycle,
  diffCalendarDays,
  isDateAfter,
  isValidDateFormat,
  RESIDENCE_CHANGE_STATUS,
  RESIDENCE_CHANGE_TYPES,
  resolveChangeResidentInfo,
  TEMPORARY_RELATIONSHIPS,
  validateEarlyEndDate,
  validateTemporaryAbsence,
  validateTemporaryResidence,
} from './residenceValidation.js'

test('isValidDateFormat validates calendar dates correctly', () => {
  assert.equal(isValidDateFormat('2026-11-12'), true)
  assert.equal(isValidDateFormat('2024-02-29'), true) // Leap year
  assert.equal(isValidDateFormat('2026-02-29'), false) // Not leap year
  assert.equal(isValidDateFormat('2026-13-01'), false) // Invalid month
  assert.equal(isValidDateFormat('2026-04-31'), false) // April has 30 days
  assert.equal(isValidDateFormat('invalid-date'), false)
  assert.equal(isValidDateFormat(''), false)
  assert.equal(isValidDateFormat(null), false)
  assert.equal(isValidDateFormat(undefined), false)
})

test('isDateAfter and pure calendar math handle leap years and invalid strings safely', () => {
  assert.equal(isDateAfter('2026-11-13', '2026-11-12'), true)
  assert.equal(isDateAfter('2026-11-12', '2026-11-12'), false)
  assert.equal(isDateAfter('2026-11-11', '2026-11-12'), false)
  assert.equal(isDateAfter('invalid', '2026-11-12'), false)
  assert.equal(isDateAfter('2026-11-12', 'invalid'), false)

  assert.equal(addCalendarDays('2026-11-26', 1), '2026-11-27')
  assert.equal(addCalendarDays('', 1), '')
  assert.equal(addCalendarDays('2026-13-99', 1), '')

  assert.equal(addCalendarMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(addCalendarMonths('2024-01-31', 1), '2024-02-29')
  assert.equal(addCalendarMonths('2026-11-15', 6), '2027-05-15')

  assert.equal(diffCalendarDays('2026-11-20', '2026-11-27'), 7)
  assert.equal(diffCalendarDays('bad', '2026-11-27'), null)
})

test('validateTemporaryResidence builds valid payload for existing resident with optional details', () => {
  const input = {
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000002',
    relationship: 'KHÁC',
    permanentAddress: '  TP. Nam Định  ',
    note: '  Thuê căn hộ 6 tháng  ',
    effectiveFrom: '2026-12-01',
    effectiveTo: '2027-06-01',
    extraField: 'should_not_leak',
  }

  const result = validateTemporaryResidence(input)
  assert.equal(result.isValid, true)
  assert.deepEqual(result.residenceChangePayload, {
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000002',
    changeType: 'TEMPORARY_RESIDENCE',
    effectiveFrom: '2026-12-01',
    effectiveTo: '2027-06-01',
    details: {
      relationship: 'KHÁC',
      isHead: false,
      permanentAddress: 'TP. Nam Định',
      note: 'Thuê căn hộ 6 tháng',
    },
  })
})

test('validateTemporaryResidence omits optional keys when empty and enforces required resident & dates', () => {
  const minimal = validateTemporaryResidence({
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000002',
    relationship: 'TẠM TRÚ',
    effectiveFrom: '2026-11-15',
    effectiveTo: '2027-05-15',
  })
  assert.equal(minimal.isValid, true)
  assert.deepEqual(minimal.residenceChangePayload.details, {
    relationship: 'TẠM TRÚ',
    isHead: false,
  })

  const invalid = validateTemporaryResidence({
    householdId: '',
    residentId: '',
    relationship: '',
    effectiveFrom: '2026-11-20',
    effectiveTo: '2026-11-10',
  })
  assert.equal(invalid.isValid, false)
  assert.match(invalid.errors.householdId, /hộ gia đình/)
  assert.match(invalid.errors.residentId, /chọn nhân khẩu/)
  assert.match(invalid.errors.relationship, /quan hệ/)
  assert.match(invalid.errors.effectiveTo, /sau ngày bắt đầu/)
})

test('validateTemporaryResidence - effectiveTo equal to effectiveFrom is rejected', () => {
  const result = validateTemporaryResidence({
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000002',
    relationship: 'CON',
    effectiveFrom: '2026-11-15',
    effectiveTo: '2026-11-15',
  })
  assert.equal(result.isValid, false)
  assert.match(result.errors.effectiveTo, /sau ngày bắt đầu/)
})

test('validateTemporaryAbsence - keeps details empty when optional fields omitted and includes destination/reason when set', () => {
  const minimal = validateTemporaryAbsence({
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000003',
    effectiveFrom: '2026-12-01',
    effectiveTo: '2027-02-01',
  })
  assert.equal(minimal.isValid, true)
  assert.deepEqual(minimal.residenceChangePayload.details, {})

  const rich = validateTemporaryAbsence({
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000003',
    destination: '  Đà Nẵng ',
    reason: ' Công tác ',
    note: ' Liên hệ sđt cũ ',
    effectiveFrom: '2026-12-01',
    effectiveTo: '2027-02-01',
  })
  assert.equal(rich.isValid, true)
  assert.deepEqual(rich.residenceChangePayload.details, {
    destination: 'Đà Nẵng',
    reason: 'Công tác',
    note: 'Liên hệ sđt cũ',
  })
})

test('validateEarlyEndDate, lifecycle classification, and resident lookup work accurately', () => {
  const change = {
    status: 'APPROVED',
    effectiveFrom: '2026-11-01',
    effectiveTo: '2026-11-17',
  }
  const life = classifyResidenceChangeLifecycle(change, '2026-11-12')
  assert.equal(life.key, 'EXPIRING_SOON')
  assert.equal(life.daysRemaining, 5)
  assert.equal(life.isActive, true)
  assert.equal(life.isExpiringSoon, true)

  assert.equal(classifyResidenceChangeLifecycle({ ...change, effectiveFrom: '2026-11-20', effectiveTo: '2026-12-20' }, '2026-11-12').key, 'UPCOMING')
  assert.equal(classifyResidenceChangeLifecycle({ ...change, effectiveTo: '2026-11-12' }, '2026-11-12').key, 'EXPIRED')

  assert.equal(validateEarlyEndDate(change, { effectiveTo: '2026-11-10', reason: 'Đã rời đi' }).isValid, true)
  assert.equal(validateEarlyEndDate(change, { effectiveTo: '2026-11-01' }).isValid, false)
  assert.equal(validateEarlyEndDate(change, { effectiveTo: '2026-11-25' }).isValid, false)

  const resolved = resolveChangeResidentInfo({ residentId: 'res-1' }, { 'res-1': { fullName: 'Nguyễn Khách', identityNo: '001122334455' } })
  assert.equal(resolved.fullName, 'Nguyễn Khách')
  assert.equal(resolved.identityNo, '001122334455')
})

test('constants and status mappings are defined and frozen', () => {
  assert.ok(Array.isArray(TEMPORARY_RELATIONSHIPS))
  assert.ok(TEMPORARY_RELATIONSHIPS.includes('TẠM TRÚ'))
  assert.equal(RESIDENCE_CHANGE_STATUS.PENDING.tone, 'warning')
  assert.equal(RESIDENCE_CHANGE_STATUS.APPROVED.tone, 'success')
  assert.equal(RESIDENCE_CHANGE_TYPES.TEMPORARY_RESIDENCE.shortLabel, 'Tạm trú')
  assert.equal(RESIDENCE_CHANGE_TYPES.TEMPORARY_ABSENCE.shortLabel, 'Tạm vắng')
})
