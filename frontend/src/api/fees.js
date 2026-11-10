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
