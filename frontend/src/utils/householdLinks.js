// Rules for placing a household in an apartment, mirroring ResidenceService on the backend.
export const HOUSEHOLD_CODE_MAX = 30

// Same window as the backend's Values.active: validFrom <= day < validTo.
export function isActiveOn(row, day) {
  return row.validFrom <= day && (!row.validTo || row.validTo > day)
}

export function occupancyByApartment(occupancies, day) {
  const byApartment = new Map()
  for (const occupancy of occupancies) {
    if (isActiveOn(occupancy, day)) byApartment.set(occupancy.apartmentId, occupancy)
  }
  return byApartment
}

export function findApartmentByCode(apartments, code) {
  const key = (code ?? '').trim().toUpperCase()
  if (!key) return null
  return apartments.find((apartment) => apartment.code.toUpperCase() === key) ?? null
}

export function suggestHouseholdCode(apartmentCode, takenCodes = []) {
  const taken = new Set(takenCodes.map((code) => code.toUpperCase()))
  const base = `HO-${apartmentCode}`.toUpperCase().slice(0, HOUSEHOLD_CODE_MAX)
  if (!taken.has(base)) return base
  for (let n = 2; n < 100; n += 1) {
    const suffix = `-${n}`
    const candidate = base.slice(0, HOUSEHOLD_CODE_MAX - suffix.length) + suffix
    if (!taken.has(candidate)) return candidate
  }
  return ''
}

export function householdCodeError(code, takenCodes = []) {
  const value = code.trim()
  if (!value) return 'Vui lòng nhập mã hộ.'
  if (value.length > HOUSEHOLD_CODE_MAX) return `Mã hộ tối đa ${HOUSEHOLD_CODE_MAX} ký tự.`
  if (takenCodes.some((taken) => taken.toUpperCase() === value.toUpperCase())) return 'Mã hộ đã tồn tại.'
  return ''
}

// An approved registrant always becomes head of household, so a household that already has one is not eligible.
export function approvalPlacement({ apartment, occupancy, hasHead }) {
  if (!apartment) return 'none'
  if (apartment.status === 'INACTIVE') return 'inactive'
  if (!occupancy) return 'vacant'
  if (hasHead === undefined) return 'checking'
  return hasHead ? 'headed' : 'open'
}
