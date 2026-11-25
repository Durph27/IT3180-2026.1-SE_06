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

// Plain-language basis descriptions for the simplified fee form.
export const BASIS_SIMPLE = Object.freeze({
  PER_M2: { label: 'Theo m²', unit: 'đ/m²', example: 'Căn 75 m² × 7.000 đ = 525.000 đ' },
  PER_APARTMENT: { label: 'Theo căn', unit: 'đ/căn', example: 'Mỗi căn 100.000 đ' },
  PER_PERSON: { label: 'Theo người', unit: 'đ/người', example: 'Hộ 4 người × 20.000 đ = 80.000 đ' },
  PER_VEHICLE: { label: 'Theo xe', unit: 'đ/xe', example: 'Mỗi xe máy 70.000 đ, mỗi ô tô 1.200.000 đ' },
  ACTUAL: { label: 'Thu hộ', unit: 'đ/hóa đơn', example: 'Theo hóa đơn điện, nước thực tế' },
})

// Reserved for maintenance rounds (see MAINTENANCE_FEE_CODE in billingUtils.js).
const RESERVED_FEE_CODES = ['QUY_BAO_TRI']

export const SIMPLE_BASIS_CHOICES = Object.freeze(['PER_M2', 'PER_APARTMENT', 'PER_PERSON', 'PER_VEHICLE'])

const FEE_CODE_MAX = 30

// "Phí quản lý" → "PHI_QUAN_LY"; a suffix keeps it unique, as fee codes are unique in the backend.
export function feeCodeFromName(name, existingCodes = []) {
  const base = String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, FEE_CODE_MAX - 3)
    .replace(/_+$/, '') || 'PHI'
  const taken = new Set([...RESERVED_FEE_CODES, ...existingCodes.map((code) => String(code).toUpperCase())])
  if (!taken.has(base)) return base
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}_${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

// Accepts "7000", "7.000", "1.200.000", "150000.00" or "1.200.000,00" and returns "7000.00",
// or null. A "." or "," followed by exactly three digits groups thousands; one followed by one
// or two digits at the end is a decimal part, which must be zero because VND has no cents.
export function parseVndInput(value) {
  let text = String(value ?? '').trim().replace(/\s/g, '').replace(/đ|₫/gi, '')
  const decimal = /[.,](\d{1,2})$/.exec(text)
  if (decimal) {
    if (!/^0+$/.test(decimal[1])) return null
    text = text.slice(0, decimal.index)
  }
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(text)) return null
  const digits = text.replace(/[.,]/g, '')
  if (!/^[1-9][0-9]{0,15}$/.test(digits)) return null
  return `${digits}.00`
}
