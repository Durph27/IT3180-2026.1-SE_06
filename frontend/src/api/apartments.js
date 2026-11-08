import { api } from './client'

export async function getApartmentsApi({
  page = 0,
  size = 20,
  buildingId = null,
  status = null,
  code = null,
  sort = null,
} = {}) {
  const params = { page, size }
  if (buildingId) params.buildingId = buildingId
  if (status && status !== 'ALL') params.status = status
  if (code && code.trim()) params.code = code.trim()
  if (sort) params.sort = sort

  const response = await api.get('/apartments', { params })
  return response.data
}

export async function getApartmentByIdApi(id) {
  const response = await api.get(`/apartments/${id}`)
  return response.data
}

export async function createApartmentApi({ buildingId, code, floorNo, areaM2 }) {
  const response = await api.post('/apartments', {
    buildingId,
    code: code.trim().toUpperCase(),
    floorNo: Number(floorNo),
    areaM2: typeof areaM2 === 'number' ? areaM2.toFixed(2) : String(areaM2).trim(),
  })
  return response.data
}

export async function updateApartmentApi(id, { code, floorNo, areaM2 }) {
  const payload = {}
  if (code !== undefined && code !== null) payload.code = code.trim().toUpperCase()
  if (floorNo !== undefined && floorNo !== null) payload.floorNo = Number(floorNo)
  if (areaM2 !== undefined && areaM2 !== null) {
    payload.areaM2 = typeof areaM2 === 'number' ? areaM2.toFixed(2) : String(areaM2).trim()
  }

  const response = await api.patch(`/apartments/${id}`, payload)
  return response.data
}

export async function getBuildingsApi(page = 0, size = 100) {
  const response = await api.get('/buildings', {
    params: { page, size },
  })
  return response.data
}

export async function createBuildingApi({ code, name, address }) {
  const response = await api.post('/buildings', {
    code: code.trim().toUpperCase(),
    name: name.trim(),
    address: address.trim(),
  })
  return response.data
}
