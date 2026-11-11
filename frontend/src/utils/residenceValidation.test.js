import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isDateAfter,
  isValidDateFormat,
  RESIDENCE_CHANGE_STATUS,
  RESIDENCE_CHANGE_TYPES,
  TEMPORARY_RELATIONSHIPS,
  validateTemporaryAbsence,
  validateTemporaryResidence,
} from './residenceValidation.js'

const TODAY = '2026-11-12'

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

test('isDateAfter checks chronological order correctly', () => {
  assert.equal(isDateAfter('2026-11-13', '2026-11-12'), true)
  assert.equal(isDateAfter('2026-11-12', '2026-11-12'), false)
  assert.equal(isDateAfter('2026-11-11', '2026-11-12'), false)
  assert.equal(isDateAfter('invalid', '2026-11-12'), false)
  assert.equal(isDateAfter('2026-11-12', 'invalid'), false)
})

test('validateTemporaryResidence - valid new resident passes with sanitized payload', () => {
  const input = {
    householdId: '00000000-0000-0000-0000-000000000001',
    isNewResident: true,
    fullName: '  Lê Văn Khách  ',
    identityNo: '001200001234',
    birthDate: '1995-08-20',
    gender: 'MALE',
    phone: '0912345678',
    relationship: 'TẠM TRÚ',
    effectiveFrom: '2026-11-15',
    effectiveTo: '2027-05-15',
  }

  const result = validateTemporaryResidence(input, { today: TODAY })
  assert.equal(result.isValid, true)
  assert.deepEqual(result.errors, {})

  // Verify resident payload
  assert.deepEqual(result.residentPayload, {
    fullName: 'Lê Văn Khách',
    identityNo: '001200001234',
    birthDate: '1995-08-20',
    gender: 'MALE',
    phone: '0912345678',
  })

  // Verify residence change payload conforms strictly to OpenAPI contract
  assert.deepEqual(result.residenceChangePayload, {
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: null, // Will be filled after resident is created
    changeType: 'TEMPORARY_RESIDENCE',
    effectiveFrom: '2026-11-15',
    effectiveTo: '2027-05-15',
    details: {
      relationship: 'TẠM TRÚ',
      isHead: false,
    },
  })
})

test('validateTemporaryResidence - valid existing resident payload', () => {
  const input = {
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000002',
    isNewResident: false,
    relationship: 'KHÁC',
    effectiveFrom: '2026-12-01',
    effectiveTo: '2027-06-01',
  }

  const result = validateTemporaryResidence(input, { today: TODAY })
  assert.equal(result.isValid, true)
  assert.equal(result.residentPayload, null)
  assert.deepEqual(result.residenceChangePayload, {
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000002',
    changeType: 'TEMPORARY_RESIDENCE',
    effectiveFrom: '2026-12-01',
    effectiveTo: '2027-06-01',
    details: {
      relationship: 'KHÁC',
      isHead: false,
    },
  })
})

test('validateTemporaryResidence - catches invalid resident and date fields', () => {
  const invalid = {
    householdId: '',
    isNewResident: true,
    fullName: '',
    identityNo: '12345', // Must be 12 digits
    birthDate: '2030-01-01', // Future date
    gender: 'INVALID_GENDER',
    phone: '0901', // Invalid length
    relationship: '',
    effectiveFrom: '2026-11-20',
    effectiveTo: '2026-11-10', // Before effectiveFrom
  }

  const result = validateTemporaryResidence(invalid, { today: TODAY })
  assert.equal(result.isValid, false)
  assert.match(result.errors.householdId, /hộ gia đình/)
  assert.match(result.errors.fullName, /Họ và tên/)
  assert.match(result.errors.identityNo, /12 chữ số/)
  assert.match(result.errors.birthDate, /tương lai/)
  assert.match(result.errors.gender, /giới tính/)
  assert.match(result.errors.phone, /10 chữ số/)
  assert.match(result.errors.relationship, /quan hệ/)
  assert.match(result.errors.effectiveTo, /sau ngày bắt đầu/)
})

test('validateTemporaryResidence - effectiveTo equal to effectiveFrom is rejected', () => {
  const sameDay = {
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000002',
    isNewResident: false,
    relationship: 'CON',
    effectiveFrom: '2026-11-15',
    effectiveTo: '2026-11-15',
  }

  const result = validateTemporaryResidence(sameDay, { today: TODAY })
  assert.equal(result.isValid, false)
  assert.match(result.errors.effectiveTo, /sau ngày bắt đầu/)
})

test('validateTemporaryResidence - details contains only relationship and isHead', () => {
  const input = {
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000002',
    isNewResident: false,
    relationship: 'VỢ/CHỒNG',
    effectiveFrom: '2026-11-15',
    effectiveTo: '2027-11-15',
    extraField: 'should_not_leak',
  }

  const result = validateTemporaryResidence(input, { today: TODAY })
  assert.equal(result.isValid, true)
  assert.deepEqual(Object.keys(result.residenceChangePayload.details).sort(), ['isHead', 'relationship'])
  assert.equal(result.residenceChangePayload.details.isHead, false)
})

test('validateTemporaryAbsence - valid absence payload with strictly empty details', () => {
  const input = {
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000003',
    effectiveFrom: '2026-12-01',
    effectiveTo: '2027-02-01',
  }

  const result = validateTemporaryAbsence(input)
  assert.equal(result.isValid, true)
  assert.deepEqual(result.errors, {})
  assert.deepEqual(result.residenceChangePayload, {
    householdId: '00000000-0000-0000-0000-000000000001',
    residentId: '00000000-0000-0000-0000-000000000003',
    changeType: 'TEMPORARY_ABSENCE',
    effectiveFrom: '2026-12-01',
    effectiveTo: '2027-02-01',
    details: {}, // Strictly empty, preventing backend 422 contract error
  })
})

test('validateTemporaryAbsence - enforces required fields and date order', () => {
  const missing = {
    householdId: '',
    residentId: '',
    effectiveFrom: '2026-12-05',
    effectiveTo: '2026-12-01',
  }

  const result = validateTemporaryAbsence(missing)
  assert.equal(result.isValid, false)
  assert.match(result.errors.householdId, /hộ gia đình/)
  assert.match(result.errors.residentId, /nhân khẩu/)
  assert.match(result.errors.effectiveTo, /sau ngày bắt đầu/)
})

test('constants and status mappings are defined and frozen', () => {
  assert.ok(Array.isArray(TEMPORARY_RELATIONSHIPS))
  assert.ok(TEMPORARY_RELATIONSHIPS.includes('TẠM TRÚ'))
  assert.equal(RESIDENCE_CHANGE_STATUS.PENDING.tone, 'warning')
  assert.equal(RESIDENCE_CHANGE_STATUS.APPROVED.tone, 'success')
  assert.equal(RESIDENCE_CHANGE_TYPES.TEMPORARY_RESIDENCE.shortLabel, 'Tạm trú')
  assert.equal(RESIDENCE_CHANGE_TYPES.TEMPORARY_ABSENCE.shortLabel, 'Tạm vắng')
})
