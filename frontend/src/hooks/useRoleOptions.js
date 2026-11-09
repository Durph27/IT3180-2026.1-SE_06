import { useEffect, useState } from 'react'
import { getRolesApi } from '../api/users'
import { apiErrorMessage } from '../api/errors'

export function useRoleOptions(enabled) {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let ignore = false
    getRolesApi().then((data) => {
      if (!Array.isArray(data) || !data.length) throw new Error('Empty role catalog')
      if (!ignore) setRoles(data)
    }).catch((err) => {
      if (!ignore) setError(apiErrorMessage(err, 'Không thể tải danh sách vai trò. Vui lòng thử lại.'))
    }).finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [enabled, attempt])
  const retry = () => { setLoading(true); setError(''); setAttempt((value) => value + 1) }
  return { roles, loading: enabled && loading, error, retry }
}
