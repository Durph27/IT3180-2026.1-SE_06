export const BASIS_OPTIONS = [
  { value: 'PER_M2', label: 'Theo diện tích sàn (m²)', unit: 'VND/m²/tháng' },
  { value: 'PER_APARTMENT', label: 'Cố định theo căn hộ', unit: 'VND/căn/tháng' },
  { value: 'PER_PERSON', label: 'Theo nhân khẩu cư trú', unit: 'VND/người/tháng' },
  { value: 'PER_VEHICLE', label: 'Theo phương tiện gửi xe', unit: 'VND/xe/tháng' },
  { value: 'ACTUAL', label: 'Thu hộ theo hóa đơn thực tế', unit: 'VND/hóa đơn' },
]

export const VEHICLE_TYPE_OPTIONS = [
  { value: 'MOTORBIKE', label: 'Xe máy' },
  { value: 'CAR', label: 'Ô tô' },
  { value: 'BICYCLE', label: 'Xe đạp / Xe điện' },
  { value: 'OTHER', label: 'Phương tiện khác' },
]

export function validateUnitPrice(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'Đơn giá không được để trống.'
  if (!/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(text)) {
    return 'Đơn giá không hợp lệ. Vui lòng nhập số dương tối đa 16 chữ số nguyên và 2 chữ số thập phân (dùng dấu chấm).'
  }
  if (/^0(?:\.0{1,2})?$/.test(text) || Number(text) <= 0) {
    return 'Đơn giá phải lớn hơn 0 VND.'
  }
  return ''
}

export function normalizeUnitPrice(value) {
  if (validateUnitPrice(value)) return null
  const text = String(value).trim()
  const [whole, fraction = ''] = text.split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}

export function validateDateString(dateStr, fieldLabel = 'Ngày') {
  const text = String(dateStr ?? '').trim()
  if (!text) return `${fieldLabel} không được để trống.`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${fieldLabel} phải theo định dạng YYYY-MM-DD.`
  }
  const date = new Date(text)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    return `${fieldLabel} không phải là ngày lịch hợp lệ.`
  }
  return ''
}

export function validateDateInterval(effectiveFrom, effectiveTo) {
  const fromErr = validateDateString(effectiveFrom, 'Ngày bắt đầu hiệu lực')
  if (fromErr) return fromErr

  const toText = String(effectiveTo ?? '').trim()
  if (toText) {
    const toErr = validateDateString(toText, 'Ngày kết thúc hiệu lực')
    if (toErr) return toErr
    if (toText <= String(effectiveFrom).trim()) {
      return 'Ngày kết thúc hiệu lực phải sau ngày bắt đầu hiệu lực.'
    }
  }
  return ''
}

export function validateFeeRate({ unitPrice, effectiveFrom, effectiveTo, vehicleType }, basis = '') {
  const errors = {}

  const priceErr = validateUnitPrice(unitPrice)
  if (priceErr) errors.unitPrice = priceErr

  const fromErr = validateDateString(effectiveFrom, 'Ngày bắt đầu hiệu lực')
  if (fromErr) errors.effectiveFrom = fromErr

  const toText = String(effectiveTo ?? '').trim()
  if (toText) {
    const toErr = validateDateString(toText, 'Ngày kết thúc hiệu lực')
    if (toErr) errors.effectiveTo = toErr
    else if (!fromErr && toText <= String(effectiveFrom).trim()) {
      errors.effectiveTo = 'Ngày kết thúc hiệu lực phải sau ngày bắt đầu hiệu lực.'
    }
  }

  const isVehicle = basis === 'PER_VEHICLE'
  if (isVehicle) {
    if (!vehicleType) {
      errors.vehicleType = 'Phí theo xe bắt buộc phải chọn loại phương tiện.'
    } else if (!VEHICLE_TYPE_OPTIONS.some((o) => o.value === vehicleType)) {
      errors.vehicleType = 'Loại phương tiện không hợp lệ.'
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null }
  }

  const payload = {
    unitPrice: normalizeUnitPrice(unitPrice),
    effectiveFrom: String(effectiveFrom).trim(),
    effectiveTo: toText || null,
    vehicleType: isVehicle ? vehicleType : null,
  }

  return { errors: {}, payload }
}

export function validateFeeType({ code, name, basis, mandatory, active }, isEdit = false) {
  const errors = {}

  if (!isEdit) {
    const codeText = String(code ?? '').trim()
    if (!codeText) {
      errors.code = 'Mã loại khoản thu không được để trống.'
    } else if (codeText.length > 30) {
      errors.code = 'Mã loại khoản thu tối đa 30 ký tự.'
    }

    if (!basis) {
      errors.basis = 'Vui lòng chọn cơ sở tính phí.'
    } else if (!BASIS_OPTIONS.some((o) => o.value === basis)) {
      errors.basis = 'Cơ sở tính phí không hợp lệ.'
    }
  }

  const nameText = String(name ?? '').trim()
  if (!nameText) {
    errors.name = 'Tên loại khoản thu không được để trống.'
  } else if (nameText.length > 120) {
    errors.name = 'Tên loại khoản thu tối đa 120 ký tự.'
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null }
  }

  if (isEdit) {
    return {
      errors: {},
      payload: {
        name: nameText,
        active: Boolean(active),
      },
    }
  }

  return {
    errors: {},
    payload: {
      code: String(code).trim().toUpperCase(),
      name: nameText,
      basis,
      mandatory: Boolean(mandatory),
      active: Boolean(active),
    },
  }
}
