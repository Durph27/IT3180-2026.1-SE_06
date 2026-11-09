import axios from 'axios'

const TOKEN_KEY = 'bluemoon_access_token'

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
})

let onUnauthorizedCallback = null
let onForbiddenCallback = null

export function registerUnauthorizedCallback(cb) {
  onUnauthorizedCallback = cb
  return () => {
    if (onUnauthorizedCallback === cb) onUnauthorizedCallback = null
  }
}

export function registerForbiddenCallback(cb) {
  onForbiddenCallback = cb
  return () => {
    if (onForbiddenCallback === cb) onForbiddenCallback = null
  }
}

api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const url = error.config?.url?.split('?')[0] || ''
    const authorization = error.config?.headers?.Authorization
    const currentSession = authorization && authorization === `Bearer ${getStoredToken()}`
    const credentialCheck = url === '/auth/login'
      || (url === '/auth/change-password' && error.response?.data?.code !== 'TOKEN_EXPIRED')
    if (currentSession && !credentialCheck) {
      if (status === 401) {
        clearStoredToken()
        onUnauthorizedCallback?.()
      } else if (status === 403 && url !== '/auth/me') {
        // Refresh grants once; never replay a rejected read or mutation.
        await onForbiddenCallback?.()
      }
    }
    return Promise.reject(error)
  }
)
