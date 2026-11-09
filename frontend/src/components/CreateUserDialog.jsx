import { useEffect, useRef, useState } from 'react'
import { createUserApi, updateUserRolesApi } from '../api/users'
import { getStoredToken } from '../api/client'
import { apiErrorMessage } from '../api/errors'
import { useAuth } from '../hooks/useAuth'
import { useModalDialog } from '../hooks/useModalDialog'
import { useRoleOptions } from '../hooks/useRoleOptions'
import RolePicker from './RolePicker'
import { roleSelectionError } from '../auth/roleSelection'

export default function CreateUserDialog(props) {
  const { hasPermission } = useAuth()
  if (!hasPermission('user.read') || !hasPermission('user.write')) return null
  return <CreateUserDialogContent {...props} />
}

function CreateUserDialogContent({ onClose, onCreated, onFailure }) {
  const { hasPermission } = useAuth()
  const canAssign = hasPermission('rbac.manage') && hasPermission('role.read')
  const catalog = useRoleOptions(canAssign)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [selected, setSelected] = useState([])
  const [createdUser, setCreatedUser] = useState(null)
  const createdRef = useRef(null)
  const inFlight = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useModalDialog(onClose, saving)

  const submit = async (event) => {
    event.preventDefault()
    if (inFlight.current || !hasPermission('user.write')) return
    setError('')
    if (!createdRef.current && (!username.trim() || !displayName.trim() || password.length < 12)) {
      setError('Nhập tên đăng nhập, tên hiển thị và mật khẩu ít nhất 12 ký tự.')
      return
    }
    const selectionError = roleSelectionError(catalog.roles, selected)
    if (canAssign && (catalog.loading || catalog.error || selectionError)) {
      setError(selectionError || 'Vui lòng tải lại danh sách vai trò.')
      return
    }
    if (createdRef.current && !canAssign) return
    inFlight.current = true
    const token = getStoredToken()
    setSaving(true)
    try {
      if (!createdRef.current) {
        const user = await createUserApi({ username, displayName, password })
        if (!mounted.current || getStoredToken() !== token) return
        createdRef.current = user
        setCreatedUser(user)
        setPassword('')
      }
      if (canAssign) await updateUserRolesApi(createdRef.current.id, selected)
      if (!mounted.current || getStoredToken() !== token) return
      await onCreated(createdRef.current, canAssign ? 'assigned' : 'unassigned')
      onClose()
    } catch (err) {
      if (getStoredToken() !== token) return
      const message = apiErrorMessage(err, 'Không thể hoàn tất thao tác. Vui lòng thử lại.')
      if (createdRef.current) {
        setError(`Đã tạo tài khoản "${createdRef.current.username}" nhưng chưa gán được vai trò. ${message}`)
        await onCreated(createdRef.current, 'pending')
      } else {
        setError(message)
        if (err.response?.status === 403) {
          setPassword('')
          onFailure(message)
        }
      }
    } finally { inFlight.current = false; setSaving(false) }
  }

  return (
    <dialog ref={ref} className="native-modal-dialog account-edit-dialog" aria-labelledby="create-user-title">
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="create-user-title">Tạo tài khoản người dùng</h2>
          <button type="button" className="modal-close" disabled={saving} onClick={onClose} aria-label="Đóng hộp thoại">&times;</button>
        </div>
        <form onSubmit={submit} className="modal-body modern-form" aria-busy={saving}>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          {createdUser && <p className="alert alert-info" role="status">Tài khoản đã được lưu. Thử lại chỉ gán vai trò cho tài khoản này, không tạo thêm tài khoản.</p>}
          <div className="form-group">
            <label htmlFor="new-user-name">Tên đăng nhập</label>
            <input id="new-user-name" name="username" className="form-control" value={username} onChange={(event) => setUsername(event.target.value)} disabled={saving || !!createdUser} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
          </div>
          <div className="form-group">
            <label htmlFor="new-display-name">Tên hiển thị</label>
            <input id="new-display-name" name="displayName" className="form-control" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={saving || !!createdUser} required />
          </div>
          {!createdUser && <div className="form-group">
            <label htmlFor="new-user-password">Mật khẩu ban đầu</label>
            <input id="new-user-password" name="password" type="password" className="form-control" value={password} onChange={(event) => setPassword(event.target.value)} disabled={saving} minLength={12} required autoComplete="new-password" aria-describedby="new-user-password-hint" />
            <span id="new-user-password-hint" className="field-hint">Ít nhất 12 ký tự.</span>
          </div>}
          {canAssign ? <>
            {catalog.loading && <p role="status">Đang tải danh sách vai trò…</p>}
            {catalog.error && <div className="alert alert-error" role="alert">{catalog.error} <button type="button" className="btn btn-outline" onClick={catalog.retry}>Tải lại danh sách vai trò</button></div>}
            {!catalog.loading && !catalog.error && <RolePicker legend="Vai trò ban đầu" roles={catalog.roles} selected={selected} onChange={(ids) => { setSelected(ids); setError('') }} disabled={saving} />}
          </> : <p className="alert alert-info">Bạn có quyền tạo tài khoản nhưng chưa có quyền gán vai trò. Tài khoản mới chưa có quyền sử dụng chức năng; quản trị hệ thống cần gán vai trò sau khi tạo.</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>{createdUser ? 'Đóng' : 'Hủy'}</button>
            <button type="submit" className="btn btn-primary" disabled={saving || (canAssign && (catalog.loading || !!catalog.error || !!roleSelectionError(catalog.roles, selected))) || (!!createdUser && !canAssign)}>
              {saving ? 'Đang lưu…' : createdUser ? 'Thử gán vai trò lại' : canAssign ? 'Tạo và gán vai trò' : 'Tạo tài khoản'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
