import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateApartmentField,
  normalizeArea,
  prepareApartment,
  validateBuilding,
} from './apartmentValidation.js'

test('validateApartmentField - code validations', () => {
  assert.equal(validateApartmentField('code', ''), 'Mã căn hộ không được để trống.')
  assert.equal(validateApartmentField('code', '   '), 'Mã căn hộ không được để trống.')
  assert.equal(validateApartmentField('code', 'A'.repeat(21)), 'Mã căn hộ không được vượt quá 20 ký tự.')
  assert.equal(validateApartmentField('code', 'P1001'), '')
  assert.equal(validateApartmentField('code', 'p-1001.b'), '')
  assert.equal(validateApartmentField('code', '1204'), '')
})

test('validateApartmentField - floorNo validations', () => {
  assert.equal(validateApartmentField('floorNo', ''), 'Số tầng không được để trống.')
  assert.equal(validateApartmentField('floorNo', 'abc'), 'Số tầng phải là số nguyên (ví dụ: 1, 10, -1).')
  assert.equal(validateApartmentField('floorNo', '10.5'), 'Số tầng phải là số nguyên (ví dụ: 1, 10, -1).')
  assert.equal(validateApartmentField('floorNo', '1e2'), 'Số tầng phải là số nguyên (ví dụ: 1, 10, -1).')
  assert.equal(validateApartmentField('floorNo', '-11'), 'Số tầng phải từ -10 đến 2147483647.')
  assert.equal(validateApartmentField('floorNo', '-10'), '')
  assert.equal(validateApartmentField('floorNo', '0'), '')
  assert.equal(validateApartmentField('floorNo', '15'), '')
  assert.equal(validateApartmentField('floorNo', '+5'), '')
  assert.equal(validateApartmentField('floorNo', '2147483647'), '')
  assert.equal(validateApartmentField('floorNo', '2147483648'), 'Số tầng phải từ -10 đến 2147483647.')
})

test('validateApartmentField - areaM2 validations', () => {
  assert.equal(validateApartmentField('areaM2', ''), 'Diện tích không được để trống.')
  assert.equal(validateApartmentField('areaM2', '0'), 'Diện tích phải lớn hơn 0 m².')
  assert.equal(validateApartmentField('areaM2', '0.00'), 'Diện tích phải lớn hơn 0 m².')
  assert.equal(validateApartmentField('areaM2', '-5.00'), 'Diện tích cần tối đa 8 chữ số nguyên và 2 chữ số thập phân, dùng dấu chấm.')
  assert.equal(validateApartmentField('areaM2', '85abc'), 'Diện tích cần tối đa 8 chữ số nguyên và 2 chữ số thập phân, dùng dấu chấm.')
  assert.equal(validateApartmentField('areaM2', '85,50'), 'Diện tích cần tối đa 8 chữ số nguyên và 2 chữ số thập phân, dùng dấu chấm.')
  assert.equal(validateApartmentField('areaM2', '85.555'), 'Diện tích cần tối đa 8 chữ số nguyên và 2 chữ số thập phân, dùng dấu chấm.')
  assert.equal(validateApartmentField('areaM2', '100000000.00'), 'Diện tích cần tối đa 8 chữ số nguyên và 2 chữ số thập phân, dùng dấu chấm.')
  assert.equal(validateApartmentField('areaM2', '85'), '')
  assert.equal(validateApartmentField('areaM2', '85.5'), '')
  assert.equal(validateApartmentField('areaM2', '85.50'), '')
  assert.equal(validateApartmentField('areaM2', '99999999.99'), '')
})

test('validateApartmentField - buildingId requirements', () => {
  assert.equal(validateApartmentField('buildingId', '', false), 'Vui lòng chọn tòa nhà trực thuộc.')
  assert.equal(validateApartmentField('buildingId', '', true), '')
  assert.equal(validateApartmentField('buildingId', 'b-uuid', false), '')
})

test('normalizeArea - formats valid values and rejects invalid values', () => {
  assert.equal(normalizeArea('85'), '85.00')
  assert.equal(normalizeArea('85.5'), '85.50')
  assert.equal(normalizeArea('85.50'), '85.50')
  assert.equal(normalizeArea('0.5'), '0.50')
  assert.equal(normalizeArea('85abc'), null)
  assert.equal(normalizeArea('0'), null)
  assert.equal(normalizeArea('0.00'), null)
  assert.equal(normalizeArea('-10'), null)
})

test('prepareApartment - create payload generation', () => {
  const result = prepareApartment({
    buildingId: 'b-123',
    code: ' P1001 ',
    floorNo: ' 10 ',
    areaM2: ' 85.5 ',
  })
  assert.deepEqual(result.errors, {})
  assert.deepEqual(result.payload, {
    buildingId: 'b-123',
    code: 'P1001',
    floorNo: 10,
    areaM2: '85.50',
  })
})

test('prepareApartment - edit payload contains only changed fields and omits buildingId', () => {
  const original = {
    id: 'apt-1',
    buildingId: 'b-123',
    code: 'P1001',
    floorNo: 10,
    areaM2: '85.50',
    status: 'VACANT',
  }

  // Only area changed
  const result1 = prepareApartment(
    {
      buildingId: 'b-999', // Building should be ignored in edit payload
      code: 'P1001',
      floorNo: '10',
      areaM2: '92.00',
    },
    original
  )
  assert.deepEqual(result1.errors, {})
  assert.deepEqual(result1.payload, {
    areaM2: '92.00',
  })
  assert.equal(result1.payload.buildingId, undefined)

  // Nothing changed
  const result2 = prepareApartment(
    {
      buildingId: 'b-123',
      code: 'P1001',
      floorNo: '10',
      areaM2: '85.5',
    },
    original
  )
  assert.deepEqual(result2.errors, {})
  assert.deepEqual(result2.payload, {})
})

test('prepareApartment - collects multiple validation errors', () => {
  const result = prepareApartment({
    buildingId: '',
    code: '',
    floorNo: 'not-a-number',
    areaM2: '0',
  })
  assert.ok(result.errors.buildingId)
  assert.ok(result.errors.code)
  assert.ok(result.errors.floorNo)
  assert.ok(result.errors.areaM2)
  assert.equal(result.payload, null)
})

test('validateBuilding - validation rules', () => {
  assert.equal(
    validateBuilding({ code: '', name: 'Ruby 1', address: '123 HN' }),
    'Mã tòa nhà phải có từ 1 đến 20 ký tự.'
  )
  assert.equal(
    validateBuilding({ code: 'T1', name: '', address: '123 HN' }),
    'Tên tòa nhà phải có từ 1 đến 120 ký tự.'
  )
  assert.equal(
    validateBuilding({ code: 'T1', name: 'Ruby 1', address: '   ' }),
    'Vui lòng nhập địa chỉ tòa nhà.'
  )
  assert.equal(
    validateBuilding({ code: 'T1', name: 'Ruby 1', address: 'Khu đô thị BlueMoon' }),
    ''
  )
})
