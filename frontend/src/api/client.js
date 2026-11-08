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

export function registerUnauthorizedCallback(cb) {
  onUnauthorizedCallback = cb
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
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      // Don't trigger auto-logout if the 401 is from login attempt itself
      if (!url.includes('/auth/login')) {
        clearStoredToken()
        if (onUnauthorizedCallback) {
          onUnauthorizedCallback()
        }
      }
    }
    return Promise.reject(error)
  }
)
