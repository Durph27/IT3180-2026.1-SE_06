import { useEffect, useState, useRef } from 'react'
import { getUserRolesApi, updateUserRolesApi } from '../api/users'
import { getStoredToken } from '../api/client'
import { apiErrorMessage } from '../api/errors'
import { useAuth } from '../hooks/useAuth'
import { useModalDialog } from '../hooks/useModalDialog'
import { useRoleOptions } from '../hooks/useRoleOptions'
import RolePicker from './RolePicker'
import { roleSelectionError } from '../auth/roleSelection'
import { XIcon } from './Icons'

export default function UserRoleDialog(props) {
  const { hasPermission } = useAuth()
  if (!hasPermission('user.read') || !hasPermission('role.read') || !hasPermission('rbac.manage')) return null
  return <UserRoleDialogContent {...props} />
}

function UserRoleDialogContent({ targetUser, onClose, onSaved, onFailure }) {
  const { user: currentUser } = useAuth()
  const catalog = useRoleOptions(true)
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const inFlight = useRef(false)
  const ref = useModalDialog(onClose, saving)
  useEffect(() => {
    let ignore = false
    getUserRolesApi(targetUser.id).then((roles) => {
      if (!Array.isArray(roles)) throw new Error('Invalid user roles')
      if (!ignore) setSelected(roles.map((role) => role.id))
    }).catch((err) => {
      if (!ignore) setLoadError(apiErrorMessage(err, 'Không thể tải vai trò hiện tại của tài khoản.'))
    }).finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [targetUser.id, attempt])

  const submit = async (event) => {
    event.preventDefault()
    if (inFlight.current || loading || catalog.loading || loadError || catalog.error) return
    const selectionError = roleSelectionError(catalog.roles, selected)
    if (selectionError) { setError(selectionError); return }
    inFlight.current = true
    const token = getStoredToken()
    setSaving(true)
    setError('')
    try {
      await updateUserRolesApi(targetUser.id, selected)
      if (getStoredToken() !== token) return
      await onSaved(targetUser)
    } catch (err) {
      if (getStoredToken() !== token) return
      const message = err.response?.status === 409 && err.response?.data?.code === 'INVALID_STATE'
        ? 'Không thể thay đổi vai trò: hệ thống phải còn ít nhất một tài khoản ADMIN đang hoạt động.'
        : apiErrorMessage(err, 'Không thể lưu vai trò. Vui lòng thử lại.')
      setError(message)
      if (err.response?.status === 403) onFailure(message)
    } finally { inFlight.current = false; setSaving(false) }
  }

  return (
    <dialog ref={ref} className="native-modal-dialog account-edit-dialog" aria-labelledby="user-role-title">
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="user-role-title">Đổi vai trò tài khoản</h2>
          <button type="button" className="modal-close" disabled={saving} onClick={onClose} aria-label="Đóng hộp thoại"><XIcon size={18} /></button>
        </div>
        <form onSubmit={submit} className="modal-body modern-form" aria-busy={saving}>
          <p>Đang chỉnh sửa <strong>{targetUser.displayName || targetUser.username}</strong> ({targetUser.username}).</p>
          {targetUser.id === currentUser.id && <p className="alert alert-info">Thay đổi vai trò của chính bạn có thể làm mất quyền truy cập trang này ngay sau khi lưu.</p>}
          {(loading || catalog.loading) && <p role="status">Đang tải vai trò…</p>}
          {loadError && <div className="alert alert-error" role="alert">{loadError} <button type="button" className="btn btn-outline" onClick={() => { setLoading(true); setLoadError(''); setAttempt((value) => value + 1) }}>Thử lại</button></div>}
          {catalog.error && <div className="alert alert-error" role="alert">{catalog.error} <button type="button" className="btn btn-outline" onClick={catalog.retry}>Tải lại danh sách vai trò</button></div>}
          {!loading && !loadError && !catalog.loading && !catalog.error && <RolePicker roles={catalog.roles} selected={selected} onChange={(ids) => { setSelected(ids); setError('') }} disabled={saving} />}
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={saving || loading || catalog.loading || !!loadError || !!catalog.error || !!roleSelectionError(catalog.roles, selected)}>{saving ? 'Đang lưu…' : 'Lưu vai trò'}</button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
