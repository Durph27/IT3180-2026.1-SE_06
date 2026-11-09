import { api } from './client'

export async function getOpenHouseholdsApi() {
  const response = await api.get('/households', { params: { page: 0, size: 100, sort: 'code,asc' } })
  return response.data.content.filter((household) => !household.closedAt)
}
