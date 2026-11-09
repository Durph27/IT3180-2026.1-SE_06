import { api } from './client'

export async function getOpenHouseholdsApi() {
  const response = await api.get('/households', { params: { page: 0, size: 100, sort: 'code,asc' } })
  return response.data.content.filter((household) => !household.closedAt)
}

export async function getHouseholdMembersApi(householdId) {
  const response = await api.get(`/households/${householdId}/members`, { params: { page: 0, size: 100 } })
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
