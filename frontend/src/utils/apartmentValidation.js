export function validateApartmentField(name, value, isEdit = false) {
  const text = String(value ?? '').trim()
  if (name === 'buildingId' && !isEdit && !text) return 'Vui lòng chọn tòa nhà trực thuộc.'
  if (name === 'code') {
    if (!text) return 'Mã căn hộ không được để trống.'
    if (text.length > 20) return 'Mã căn hộ không được vượt quá 20 ký tự.'
  }
  if (name === 'floorNo') {
    if (!text) return 'Số tầng không được để trống.'
    if (!/^[+-]?\d+$/.test(text)) return 'Số tầng phải là số nguyên (ví dụ: 1, 10, -1).'
    const floor = Number(text)
    if (!Number.isSafeInteger(floor) || floor < -10 || floor > 2147483647) {
      return 'Số tầng phải từ -10 đến 2147483647.'
    }
  }
  if (name === 'areaM2') {
    if (!text) return 'Diện tích không được để trống.'
    if (!/^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$/.test(text)) {
      return 'Diện tích cần tối đa 8 chữ số nguyên và 2 chữ số thập phân, dùng dấu chấm.'
    }
    if (/^0(?:\.0{1,2})?$/.test(text)) return 'Diện tích phải lớn hơn 0 m².'
  }
  return ''
}

export function normalizeArea(value) {
  if (validateApartmentField('areaM2', value)) return null
  const [whole, fraction = ''] = String(value).trim().split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}

export function prepareApartment(values, original = null) {
  const errors = {}
  for (const field of ['buildingId', 'code', 'floorNo', 'areaM2']) {
    const message = validateApartmentField(field, values[field], Boolean(original))
    if (message) errors[field] = message
  }
  if (Object.keys(errors).length) return { errors, payload: null }

  const fields = {
    code: values.code.trim(),
    floorNo: Number(String(values.floorNo).trim()),
    areaM2: normalizeArea(values.areaM2),
  }
  if (!original) return { errors, payload: { buildingId: values.buildingId.trim(), ...fields } }
  const payload = {}
  for (const [key, value] of Object.entries(fields)) {
    const previous = key === 'areaM2' ? normalizeArea(original[key]) : original[key]
    if (value !== previous) payload[key] = value
  }
  return { errors, payload }
}

export function validateBuilding(values) {
  const code = values.code.trim()
  const name = values.name.trim()
  if (!code || code.length > 20) return 'Mã tòa nhà phải có từ 1 đến 20 ký tự.'
  if (!name || name.length > 120) return 'Tên tòa nhà phải có từ 1 đến 120 ký tự.'
  if (!values.address.trim()) return 'Vui lòng nhập địa chỉ tòa nhà.'
  return ''
}
