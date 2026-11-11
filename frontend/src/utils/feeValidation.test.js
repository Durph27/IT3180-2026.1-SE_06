import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateUnitPrice,
  normalizeUnitPrice,
  validateDateString,
  validateDateInterval,
  validateFeeRate,
  validateFeeType,
} from './feeValidation.js'

test('validateUnitPrice - strictly enforces positive numbers > 0 and 2 decimal format', () => {
  assert.equal(validateUnitPrice(''), 'Đơn giá không được để trống.')
  assert.equal(validateUnitPrice('   '), 'Đơn giá không được để trống.')
  assert.equal(validateUnitPrice('0'), 'Đơn giá phải lớn hơn 0 VND.')
  assert.equal(validateUnitPrice('0.00'), 'Đơn giá phải lớn hơn 0 VND.')
  assert.equal(validateUnitPrice('-1000'), 'Đơn giá không hợp lệ. Vui lòng nhập số dương tối đa 16 chữ số nguyên và 2 chữ số thập phân (dùng dấu chấm).')
  assert.equal(validateUnitPrice('abc'), 'Đơn giá không hợp lệ. Vui lòng nhập số dương tối đa 16 chữ số nguyên và 2 chữ số thập phân (dùng dấu chấm).')
  assert.equal(validateUnitPrice('10,000.00'), 'Đơn giá không hợp lệ. Vui lòng nhập số dương tối đa 16 chữ số nguyên và 2 chữ số thập phân (dùng dấu chấm).')
  assert.equal(validateUnitPrice('8500.555'), 'Đơn giá không hợp lệ. Vui lòng nhập số dương tối đa 16 chữ số nguyên và 2 chữ số thập phân (dùng dấu chấm).')
  assert.equal(validateUnitPrice('1e5'), 'Đơn giá không hợp lệ. Vui lòng nhập số dương tối đa 16 chữ số nguyên và 2 chữ số thập phân (dùng dấu chấm).')

  // Valid positive values
  assert.equal(validateUnitPrice('7000'), '')
  assert.equal(validateUnitPrice('8500.5'), '')
  assert.equal(validateUnitPrice('1200000.00'), '')
})

test('normalizeUnitPrice - converts valid amounts to strict 2 decimal format', () => {
  assert.equal(normalizeUnitPrice('7000'), '7000.00')
  assert.equal(normalizeUnitPrice('8500.5'), '8500.50')
  assert.equal(normalizeUnitPrice('1200000.00'), '1200000.00')
  assert.equal(normalizeUnitPrice('0'), null)
  assert.equal(normalizeUnitPrice('-5000'), null)
  assert.equal(normalizeUnitPrice('invalid'), null)
})

test('validateDateString - verifies date format and calendar validity', () => {
  assert.equal(validateDateString('', 'Ngày bắt đầu'), 'Ngày bắt đầu không được để trống.')
  assert.equal(validateDateString('2026/11/01', 'Ngày'), 'Ngày phải theo định dạng YYYY-MM-DD.')
  assert.equal(validateDateString('2026-02-31', 'Ngày'), 'Ngày không phải là ngày lịch hợp lệ.')
  assert.equal(validateDateString('2026-11-01', 'Ngày'), '')
})

test('validateDateInterval - enforces effectiveTo > effectiveFrom', () => {
  assert.equal(validateDateInterval('2026-11-01', ''), '')
  assert.equal(validateDateInterval('2026-11-01', '2026-12-31'), '')
  assert.equal(
    validateDateInterval('2026-11-01', '2026-11-01'),
    'Ngày kết thúc hiệu lực phải sau ngày bắt đầu hiệu lực.'
  )
  assert.equal(
    validateDateInterval('2026-11-05', '2026-11-01'),
    'Ngày kết thúc hiệu lực phải sau ngày bắt đầu hiệu lực.'
  )
})

test('validateFeeRate - creates sanitized payload and checks vehicleType requirement', () => {
  // Non-vehicle basis with vehicleType provided -> stripped to null
  const res1 = validateFeeRate(
    {
      unitPrice: ' 8500 ',
      effectiveFrom: '2026-11-01',
      effectiveTo: '2026-12-31',
      vehicleType: 'MOTORBIKE',
    },
    'PER_M2'
  )
  assert.deepEqual(res1.errors, {})
  assert.deepEqual(res1.payload, {
    unitPrice: '8500.00',
    effectiveFrom: '2026-11-01',
    effectiveTo: '2026-12-31',
    vehicleType: null,
  })

  // Vehicle basis requires vehicleType
  const res2 = validateFeeRate(
    {
      unitPrice: '70000',
      effectiveFrom: '2026-11-01',
      effectiveTo: null,
      vehicleType: '',
    },
    'PER_VEHICLE'
  )
  assert.ok(res2.errors.vehicleType)
  assert.equal(res2.payload, null)

  // Vehicle basis with valid vehicleType
  const res3 = validateFeeRate(
    {
      unitPrice: '70000',
      effectiveFrom: '2026-11-01',
      effectiveTo: null,
      vehicleType: 'MOTORBIKE',
    },
    'PER_VEHICLE'
  )
  assert.deepEqual(res3.errors, {})
  assert.deepEqual(res3.payload, {
    unitPrice: '70000.00',
    effectiveFrom: '2026-11-01',
    effectiveTo: null,
    vehicleType: 'MOTORBIKE',
  })
})

test('validateFeeType - handles create and edit payloads according to OpenAPI constraints', () => {
  // Valid create
  const createRes = validateFeeType(
    {
      code: 'phi_qlvh',
      name: 'Phí quản lý vận hành',
      basis: 'PER_M2',
      mandatory: true,
      active: true,
    },
    false
  )
  assert.deepEqual(createRes.errors, {})
  assert.deepEqual(createRes.payload, {
    code: 'PHI_QLVH',
    name: 'Phí quản lý vận hành',
    basis: 'PER_M2',
    mandatory: true,
    active: true,
  })

  // Valid edit (code and basis cannot be modified in PATCH)
  const editRes = validateFeeType(
    {
      name: 'Phí quản lý vận hành tòa nhà',
      active: false,
    },
    true
  )
  assert.deepEqual(editRes.errors, {})
  assert.deepEqual(editRes.payload, {
    name: 'Phí quản lý vận hành tòa nhà',
    active: false,
  })
})
