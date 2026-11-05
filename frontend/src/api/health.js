import { api } from './client'

export async function getHealth(signal) {
  const response = await api.get('/health', { signal })
  return response.data
}
