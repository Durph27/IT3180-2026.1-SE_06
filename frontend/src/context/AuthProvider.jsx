import { useState, useEffect, useCallback, useMemo } from 'react'
import { getStoredToken, clearStoredToken, registerUnauthorizedCallback } from '../api/client'
import { loginApi, getMeApi, changePasswordApi } from '../api/auth'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [householdIds, setHouseholdIds] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const logout = useCallback(() => {
    clearStoredToken()
    setUser(null)
    setRoles([])
    setPermissions([])
    setHouseholdIds([])
  }, [])

  // Initialize session from token on mount
  useEffect(() => {
    registerUnauthorizedCallback(logout)

    async function initAuth() {
      const token = getStoredToken()
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const profile = await getMeApi()
        setUser(profile.user)
        setRoles(profile.roles || [])
        setPermissions(profile.permissions || [])
        setHouseholdIds(profile.householdIds || [])
      } catch (err) {
        console.warn('Session initialization failed, logging out:', err)
        logout()
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [logout])

  const login = useCallback(async (username, password) => {
    try {
      const { profile } = await loginApi(username, password)
      setUser(profile.user)
      setRoles(profile.roles || [])
      setPermissions(profile.permissions || [])
      setHouseholdIds(profile.householdIds || [])
      return { success: true }
    } catch (err) {
      const status = err.response?.status
      const data = err.response?.data
      let message = 'Đăng nhập không thành công. Vui lòng thử lại.'

      if (status === 401) {
        message = 'Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.'
      } else if (status === 429) {
        message = 'Quá nhiều lần thử thất bại. Vui lòng thử lại sau 60 giây.'
      } else if (data?.message) {
        message = data.message
      }

      return { success: false, error: message }
    }
  }, [])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      await changePasswordApi(currentPassword, newPassword)
      logout()
      return { success: true }
    } catch (err) {
      const status = err.response?.status
      const data = err.response?.data
      let message = 'Đổi mật khẩu thất bại.'

      if (status === 401) {
        message = 'Mật khẩu hiện tại không chính xác.'
      } else if (data?.message) {
        message = data.message
      } else if (data?.details?.[0]?.message) {
        message = data.details[0].message
      }

      return { success: false, error: message }
    }
  }, [logout])

  const hasPermission = useCallback((permCode) => {
    return permissions.includes(permCode)
  }, [permissions])

  const hasRole = useCallback((roleCode) => {
    return roles.some((r) => r.code === roleCode)
  }, [roles])

  const value = useMemo(() => ({
    user,
    roles,
    permissions,
    householdIds,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    changePassword,
    hasPermission,
    hasRole,
  }), [user, roles, permissions, householdIds, isLoading, login, logout, changePassword, hasPermission, hasRole])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
