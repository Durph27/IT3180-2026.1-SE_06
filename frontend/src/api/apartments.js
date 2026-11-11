import { api } from './client'

export async function getApartmentsApi({
  page = 0,
  size = 20,
  buildingId = null,
  status = null,
  code = null,
  sort = null,
} = {}, { signal } = {}) {
  const params = { page, size }
  if (buildingId) params.buildingId = buildingId
  if (status && status !== 'ALL') params.status = status
  if (code && code.trim()) params.code = code.trim()
  if (sort) params.sort = sort
  const response = await api.get('/apartments', { params, signal })
  return response.data
}

export async function getAllApartmentsApi({ signal } = {}) {
  const apartments = []
  let page = 0
  let totalPages
  do {
    const data = await getApartmentsApi({ page, size: 100, sort: 'code,asc' }, { signal })
    apartments.push(...data.content)
    totalPages = data.totalPages
    page += 1
  } while (page < totalPages)
  return apartments
}

export async function getApartmentByIdApi(id, { signal } = {}) {
  const response = await api.get(`/apartments/${id}`, { signal })
  return response.data
}

export async function createApartmentApi({ buildingId, code, floorNo, areaM2 }) {
  const response = await api.post('/apartments', { buildingId, code, floorNo, areaM2 })
  return response.data
}

export async function updateApartmentApi(id, { code, floorNo, areaM2 }) {
  const payload = {}
  if (code !== undefined) payload.code = code
  if (floorNo !== undefined) payload.floorNo = floorNo
  if (areaM2 !== undefined) payload.areaM2 = areaM2
  const response = await api.patch(`/apartments/${id}`, payload)
  return response.data
}

export async function getBuildingsApi(page = 0, size = 100, { signal } = {}) {
  const response = await api.get('/buildings', { params: { page, size, sort: 'code,asc' }, signal })
  return response.data
}

export async function getAllBuildingsApi({ signal } = {}) {
  const buildings = []
  let page = 0
  let totalPages
  do {
    const data = await getBuildingsApi(page, 100, { signal })
    buildings.push(...data.content)
    totalPages = data.totalPages
    page += 1
  } while (page < totalPages)
  return buildings
}

export async function createBuildingApi({ code, name, address }) {
  const response = await api.post('/buildings', {
    code: code.trim(),
    name: name.trim(),
    address: address.trim(),
  })
  return response.data
}
