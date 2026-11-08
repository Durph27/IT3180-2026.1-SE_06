import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getStoredToken, setStoredToken, clearStoredToken, registerUnauthorizedCallback, registerForbiddenCallback } from '../api/client'
import { loginApi, getMeApi, changePasswordApi } from '../api/auth'
import { AuthContext } from './AuthContext'
import { canAccess, hasRole as matchesRole } from '../auth/rbac'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [householdIds, setHouseholdIds] = useState([])
  const [isLoading, setIsLoading] = useState(() => !!getStoredToken())

  const sessionVersion = useRef(0)
  const permissionRefresh = useRef(null)
  const invalidateSession = useCallback(() => { sessionVersion.current++ }, [])

  const clearProfile = useCallback(() => {
    setUser(null)
    setRoles([])
    setPermissions([])
    setHouseholdIds([])
  }, [])

  const applyProfile = useCallback((profile) => {
    setUser(profile.user)
    setRoles(Array.isArray(profile.roles) ? profile.roles : [])
    setPermissions(Array.isArray(profile.permissions) ? profile.permissions : [])
    setHouseholdIds(Array.isArray(profile.householdIds) ? profile.householdIds : [])
  }, [])

  const logout = useCallback(() => {
    invalidateSession()
    clearStoredToken()
    clearProfile()
    setIsLoading(false)
  }, [clearProfile, invalidateSession])

  const refreshPermissions = useCallback(() => {
    const token = getStoredToken()
    if (!token) return Promise.resolve()
    if (permissionRefresh.current?.token === token) return permissionRefresh.current.promise
    const version = sessionVersion.current
    const refresh = { token }
    refresh.promise = getMeApi()
      .then((profile) => {
        if (version === sessionVersion.current && getStoredToken() === token) applyProfile(profile)
      })
      .catch(() => {
        // Fail closed if grants cannot be verified; a 401 also clears identity.
        if (version === sessionVersion.current && getStoredToken() === token) {
          setRoles([])
          setPermissions([])
          setHouseholdIds([])
        }
      })
      .finally(() => {
        if (permissionRefresh.current === refresh) permissionRefresh.current = null
      })
    permissionRefresh.current = refresh
    return refresh.promise
  }, [applyProfile])

  useEffect(() => {
    const unregisterUnauthorized = registerUnauthorizedCallback(logout)
    const unregisterForbidden = registerForbiddenCallback(refreshPermissions)
    const version = sessionVersion.current
    const token = getStoredToken()
    if (token) {
      getMeApi()
        .then((profile) => {
          if (version === sessionVersion.current && getStoredToken() === token) applyProfile(profile)
        })
        .catch(() => {
          if (version === sessionVersion.current && getStoredToken() === token) logout()
        })
        .finally(() => {
          if (version === sessionVersion.current) setIsLoading(false)
        })
    }
    return () => {
      invalidateSession()
      unregisterUnauthorized()
      unregisterForbidden()
    }
  }, [logout, applyProfile, refreshPermissions, invalidateSession])

  const login = useCallback(async (username, password) => {
    const version = ++sessionVersion.current
    clearStoredToken()
    clearProfile()
    setIsLoading(false)
    try {
      const { accessToken, profile } = await loginApi(username, password)
      if (version !== sessionVersion.current) return { success: false, error: 'Phiên đăng nhập đã thay đổi.' }
      setStoredToken(accessToken)
      applyProfile(profile)
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
  }, [applyProfile, clearProfile])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const version = sessionVersion.current
    try {
      await changePasswordApi(currentPassword, newPassword)
      if (version !== sessionVersion.current) return { success: false, error: 'Phiên đăng nhập đã thay đổi.' }
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

  const hasPermission = useCallback((permCode, scope) => {
    return canAccess({ user, roles, permissions, householdIds, isLoading }, permCode, scope)
  }, [user, roles, permissions, householdIds, isLoading])

  const hasRole = useCallback((roleCode) => {
    return !!user && !isLoading && matchesRole(roles, roleCode)
  }, [user, roles, isLoading])

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
