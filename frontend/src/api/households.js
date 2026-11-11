import { api } from './client'

async function fetchAll(path, params, signal) {
  const rows = []
  let page = 0
  let totalPages = 1
  do {
    const { data } = await api.get(path, { params: { ...params, page, size: 100 }, signal })
    rows.push(...(data.content ?? []))
    totalPages = data.totalPages ?? 1
    page += 1
  } while (page < totalPages)
  return rows
}

export function getAllHouseholdsApi(signal) {
  return fetchAll('/households', { sort: 'code,asc' }, signal)
}

export async function getOpenHouseholdsApi(signal) {
  return (await getAllHouseholdsApi(signal)).filter((household) => !household.closedAt)
}

export function getActiveOccupanciesApi(at, signal) {
  return fetchAll('/occupancies', { at }, signal)
}

export async function createHouseholdApi(code) {
  const response = await api.post('/households', { code: code.trim() })
  return response.data
}

export async function createOccupancyApi({ householdId, apartmentId, validFrom }) {
  const response = await api.post('/occupancies', { householdId, apartmentId, validFrom })
  return response.data
}

// Pass the householdId from an earlier attempt so a failed occupancy step never creates a second household.
export async function placeHouseholdApi({ householdId, code, apartmentId, validFrom, onHouseholdCreated }) {
  let id = householdId
  if (!id) {
    id = (await createHouseholdApi(code)).id
    onHouseholdCreated?.(id)
  }
  await createOccupancyApi({ householdId: id, apartmentId, validFrom })
  return id
}

export async function getHouseholdMembersApi(householdId, signal) {
  const response = await api.get(`/households/${householdId}/members`, { params: { page: 0, size: 100 }, signal })
  return response.data.content
}

export async function getResidentApi(residentId) {
  const response = await api.get(`/residents/${residentId}`)
  return response.data
}

export async function addFamilyMemberApi(householdId, member) {
  const response = await api.post(`/households/${householdId}/family-members`, member)
  return response.data
}
