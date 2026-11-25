import { api } from './client'

export async function getFeeTypesApi({
  page = 0,
  size = 20,
  code = null,
  basis = null,
  mandatory = null,
  active = null,
  sort = null,
} = {}, { signal } = {}) {
  const params = { page, size }
  if (code && code.trim()) params.code = code.trim()
  if (basis && basis !== 'ALL') params.basis = basis
  if (mandatory !== null && mandatory !== undefined && mandatory !== 'ALL') {
    params.mandatory = mandatory === 'true' || mandatory === true
  }
  if (active !== null && active !== undefined && active !== 'ALL') {
    params.active = active === 'true' || active === true
  }
  if (sort) params.sort = sort

  const response = await api.get('/fee-types', { params, signal })
  return response.data
}

export async function getFeeTypeByIdApi(id, { signal } = {}) {
  const response = await api.get(`/fee-types/${id}`, { signal })
  return response.data
}

export async function createFeeTypeApi({ code, name, basis, mandatory, active }) {
  const response = await api.post('/fee-types', {
    code: code.trim().toUpperCase(),
    name: name.trim(),
    basis,
    mandatory: Boolean(mandatory),
    active: Boolean(active),
  })
  return response.data
}

export async function updateFeeTypeApi(id, { name, active }) {
  const payload = {}
  if (name !== undefined && name !== null) payload.name = name.trim()
  if (active !== undefined && active !== null) payload.active = Boolean(active)

  const response = await api.patch(`/fee-types/${id}`, payload)
  return response.data
}

export async function getFeeRatesApi(feeTypeId, {
  page = 0,
  size = 20,
  at = null,
  sort = null,
} = {}, { signal } = {}) {
  const params = { page, size }
  if (at) params.at = at
  if (sort) params.sort = sort

  const response = await api.get(`/fee-types/${feeTypeId}/rates`, { params, signal })
  return response.data
}

export async function createFeeRateApi(feeTypeId, { unitPrice, effectiveFrom, effectiveTo = null, vehicleType = null }) {
  const payload = {
    unitPrice: String(unitPrice).trim(),
    effectiveFrom: String(effectiveFrom).trim(),
  }
  if (effectiveTo) payload.effectiveTo = String(effectiveTo).trim()
  if (vehicleType) payload.vehicleType = vehicleType

  const response = await api.post(`/fee-types/${feeTypeId}/rates`, payload)
  return response.data
}

export async function updateFeeRateApi(rateId, { effectiveTo }) {
  const payload = {
    effectiveTo: effectiveTo ? String(effectiveTo).trim() : null,
  }
  const response = await api.patch(`/fee-rates/${rateId}`, payload)
  return response.data
}

export async function getAllFeeRatesApi(feeTypeId, { signal } = {}) {
  const rows = []
  let page = 0
  let totalPages = 1
  do {
    const data = await getFeeRatesApi(feeTypeId, { page, size: 100, sort: 'effectiveFrom,desc' }, { signal })
    rows.push(...(data.content ?? []))
    totalPages = data.totalPages ?? 1
    page += 1
  } while (page < totalPages)
  return rows
}

export async function getAllFeeTypesApi({ signal } = {}) {
  const rows = []
  let page = 0
  let totalPages = 1
  do {
    const data = await getFeeTypesApi({ page, size: 100, sort: 'code,asc' }, { signal })
    rows.push(...(data.content ?? []))
    totalPages = data.totalPages ?? 1
    page += 1
  } while (page < totalPages)
  return rows
}

// Loads every fee with all of its prices, so the table can show the current price and its history.
export async function getFeeCatalogApi({ signal } = {}) {
  const feeTypes = await getAllFeeTypesApi({ signal })
  const rates = await Promise.all(feeTypes.map((fee) => getAllFeeRatesApi(fee.id, { signal })))
  return { feeTypes, ratesByFeeType: Object.fromEntries(feeTypes.map((fee, index) => [fee.id, rates[index]])) }
}
