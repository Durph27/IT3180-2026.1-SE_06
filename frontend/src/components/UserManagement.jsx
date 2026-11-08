import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getUsersApi, updateUserStatusApi, createUserApi } from '../api/users'
import { useAuth } from '../hooks/useAuth'
import { UsersIcon, PlusIcon, LockIcon, UnlockIcon, SearchIcon } from './Icons'

export default function UserManagement() {
  const { user: currentUser, hasPermission } = useAuth()
  const canManage = hasPermission('user.manage')

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // ALL | ACTIVE | LOCKED

  // Action state (Lock / Unlock confirmation)
  const [actionTarget, setActionTarget] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const actionDialogRef = useRef(null)

  // Create User modal
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const createDialogRef = useRef(null)

  // Native <dialog> controls for Action Confirmation
  useEffect(() => {
    const dialog = actionDialogRef.current
    if (!dialog) return

    if (actionTarget) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [actionTarget])

  // Native <dialog> controls for Create User Modal
  useEffect(() => {
    const dialog = createDialogRef.current
    if (!dialog) return

    if (isCreateOpen) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [isCreateOpen])

  // Click-outside light dismiss handler for both dialogs
  const actionPressedOutsideRef = useRef(false)
  const createPressedOutsideRef = useRef(false)

  useEffect(() => {
    const outside = (e, el) => {
      const r = el.getBoundingClientRect()
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    }

    const bindDismiss = (dialog, pressedRef, onDismiss) => {
      if (!dialog) return () => {}
      const onDown = (e) => { pressedRef.current = outside(e, dialog) }
      const onUp = (e) => {
        if (pressedRef.current && outside(e, dialog)) onDismiss()
        pressedRef.current = false
      }
      const onCancel = (e) => {
        e.preventDefault()
        onDismiss()
      }
      dialog.addEventListener('pointerdown', onDown)
      dialog.addEventListener('pointerup', onUp)
      dialog.addEventListener('cancel', onCancel)
      return () => {
        dialog.removeEventListener('pointerdown', onDown)
        dialog.removeEventListener('pointerup', onUp)
        dialog.removeEventListener('cancel', onCancel)
      }
    }

    const unbindAction = bindDismiss(actionDialogRef.current, actionPressedOutsideRef, () => setActionTarget(null))
    const unbindCreate = bindDismiss(createDialogRef.current, createPressedOutsideRef, () => setIsCreateOpen(false))

    return () => {
      unbindAction()
      unbindCreate()
    }
  }, [])

  const refreshUsers = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getUsersApi(0, 100)
      setUsers(data.content || [])
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách tài khoản.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let ignore = false
    getUsersApi(0, 100)
      .then((data) => {
        if (!ignore) {
          setUsers(data.content || [])
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.response?.data?.message || 'Không thể tải danh sách tài khoản.')
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [])

  const handleStatusChange = async (targetUser, newStatus) => {
    setActionLoading(true)
    setError('')
    setSuccessMsg('')

    try {
      await updateUserStatusApi(targetUser.id, newStatus)
      const actionText = newStatus === 'LOCKED' ? 'khóa' : 'mở khóa'
      setSuccessMsg(`Đã ${actionText} thành công tài khoản "${targetUser.username}".`)
      setActionTarget(null)
      await refreshUsers()
    } catch (err) {
      const code = err.response?.data?.code
      const msg = err.response?.data?.message

      if (code === 'INVALID_STATE') {
        setError('Không thể khóa: Hệ thống phải duy trì ít nhất một tài khoản Quản trị viên (ADMIN) đang hoạt động.')
      } else {
        setError(msg || 'Thao tác cập nhật trạng thái thất bại.')
      }
      setActionTarget(null)
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setCreateError('')

    if (!newUsername.trim()) {
      setCreateError('Vui lòng nhập tên đăng nhập.')
      return
    }
    if (!newDisplayName.trim()) {
      setCreateError('Vui lòng nhập tên hiển thị.')
      return
    }
    if (newPassword.length < 12) {
      setCreateError('Mật khẩu phải có ít nhất 12 ký tự.')
      return
    }

    try {
      setCreateLoading(true)
      await createUserApi({
        username: newUsername,
        displayName: newDisplayName,
        password: newPassword,
      })

      setSuccessMsg(`Tạo tài khoản "${newUsername}" thành công.`)
      setIsCreateOpen(false)
      setNewUsername('')
      setNewDisplayName('')
      setNewPassword('')
      await refreshUsers()
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.details?.[0]?.message
      setCreateError(msg || 'Tạo tài khoản thất bại.')
    } finally {
      setCreateLoading(false)
    }
  }

  // Filtered list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.displayName.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesStatus =
        statusFilter === 'ALL' || u.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [users, searchTerm, statusFilter])

  const totalCount = users.length
  const activeCount = users.filter((u) => u.status === 'ACTIVE').length
  const lockedCount = users.filter((u) => u.status === 'LOCKED').length

  return (
    <div className="user-management-container">
      {/* Page Header */}
      <div className="page-header-card">
        <div className="header-info">
          <div className="header-icon-circle">
            <UsersIcon size={24} />
          </div>
          <div>
            <h1 className="header-title">Quản lý Tài khoản Hệ thống</h1>
            <p className="header-desc">
              Kiểm soát danh mục người dùng, phân quyền truy cập và chuyển đổi trạng thái Khóa / Kích hoạt
            </p>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            className="btn btn-primary btn-add-user"
            onClick={() => {
              setIsCreateOpen(true)
              setCreateError('')
            }}
          >
            <PlusIcon size={18} />
            <span>Thêm tài khoản mới</span>
          </button>
        )}
      </div>

      {/* Metric summary counters */}
      <div className="metrics-row">
        <div className="metric-card">
          <span className="metric-label">Tổng số tài khoản</span>
          <span className="metric-number">{totalCount}</span>
        </div>
        <div className="metric-card metric-card-active">
          <span className="metric-label">Đang hoạt động</span>
          <span className="metric-number color-success">{activeCount}</span>
        </div>
        <div className="metric-card metric-card-locked">
          <span className="metric-label">Đang bị khóa</span>
          <span className="metric-number color-danger">{lockedCount}</span>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="alert alert-success animate-fade-in" role="status">
          <span>✓</span>
          <div>{successMsg}</div>
        </div>
      )}
      {error && (
        <div className="alert alert-error animate-fade-in" role="alert">
          <span>⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* Main Table Container Card */}
      <div className="table-card">
        {/* Table Filters & Search Bar */}
        <div className="table-toolbar">
          <div className="search-box">
            <SearchIcon size={16} className="search-icon" />
            <input
              type="search"
              className="search-input"
              placeholder="Tìm theo username hoặc tên hiển thị..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Tìm kiếm tài khoản"
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchTerm('')}
                aria-label="Xóa nội dung tìm kiếm"
              >
                &times;
              </button>
            )}
          </div>

          <div className="filter-buttons-group" role="group" aria-label="Lọc theo trạng thái">
            <button
              type="button"
              className={`filter-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              Tất cả ({totalCount})
            </button>
            <button
              type="button"
              className={`filter-btn ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ACTIVE')}
            >
              Hoạt động ({activeCount})
            </button>
            <button
              type="button"
              className={`filter-btn ${statusFilter === 'LOCKED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('LOCKED')}
            >
              Bị khóa ({lockedCount})
            </button>
          </div>
        </div>

        {/* User Table per responsive-table guidance */}
        {loading ? (
          <div className="table-loading-box">
            <div className="loading-spinner-ring" />
            <p>Đang tải danh sách tài khoản từ máy chủ…</p>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="user-table-caption"
            className="table-wrapper"
          >
            <table className="modern-table">
              <caption id="user-table-caption" className="table-caption">
                Danh sách người dùng và phân quyền hệ thống
              </caption>
              <thead>
                <tr>
                  <th scope="col">Tài khoản</th>
                  <th scope="col">Tên hiển thị</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Ngày khởi tạo</th>
                  {canManage && <th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="empty-table-cell">
                      <div className="empty-state-box">
                        <span>🔍</span>
                        <p>Không tìm thấy tài khoản nào phù hợp với bộ lọc.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isCurrent = u.id === currentUser?.id
                    const isLocked = u.status === 'LOCKED'
                    const isActive = u.status === 'ACTIVE'
                    const initialLetter = (u.displayName || u.username || 'U').charAt(0).toUpperCase()

                    return (
                      <tr key={u.id} className={isCurrent ? 'row-is-current' : ''}>
                        <th scope="row" className="row-header-th">
                          <div className="user-cell">
                            <div className={`user-table-avatar ${isLocked ? 'avatar-locked' : ''}`}>
                              {initialLetter}
                            </div>
                            <div className="user-cell-meta">
                              <span className="user-username">{u.username}</span>
                              {isCurrent && <span className="tag-self">Chính bạn</span>}
                            </div>
                          </div>
                        </th>
                        <td data-label="Tên hiển thị">
                          <span className="user-display-name">{u.displayName}</span>
                        </td>
                        <td data-label="Trạng thái">
                          <div className={`status-pill pill-${u.status.toLowerCase()}`}>
                            <span className="pill-dot" />
                            <span>{isActive ? 'Hoạt động (ACTIVE)' : isLocked ? 'Đã khóa (LOCKED)' : u.status}</span>
                          </div>
                        </td>
                        <td data-label="Ngày tạo">
                          <span className="date-cell">
                            {new Date(u.createdAt).toLocaleString('vi-VN', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </td>
                        {canManage && (
                          <td data-label="Thao tác" style={{ textAlign: 'right' }}>
                            {isActive ? (
                              <button
                                type="button"
                                className="action-btn action-btn-lock"
                                onClick={() => setActionTarget({ user: u, action: 'LOCK' })}
                                disabled={actionLoading}
                                title="Khóa tài khoản này"
                              >
                                <LockIcon size={14} />
                                <span>Khóa</span>
                              </button>
                            ) : isLocked ? (
                              <button
                                type="button"
                                className="action-btn action-btn-unlock"
                                onClick={() => setActionTarget({ user: u, action: 'UNLOCK' })}
                                disabled={actionLoading}
                                title="Mở khóa tài khoản này"
                              >
                                <UnlockIcon size={14} />
                                <span>Mở khóa</span>
                              </button>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Dialog via Native HTML5 <dialog> */}
      <dialog
        ref={actionDialogRef}
        className="native-modal-dialog"
        aria-labelledby="confirm-dialog-title"
      >
        {actionTarget && (
          <div className="modal-dialog">
            <div className="dialog-header">
              <div className={`dialog-icon-circle ${actionTarget.action === 'LOCK' ? 'icon-danger' : 'icon-success'}`}>
                {actionTarget.action === 'LOCK' ? <LockIcon size={24} /> : <UnlockIcon size={24} />}
              </div>
              <h3 id="confirm-dialog-title" className="dialog-title">
                {actionTarget.action === 'LOCK' ? 'Xác nhận Khóa tài khoản' : 'Xác nhận Mở khóa tài khoản'}
              </h3>
              <p className="dialog-desc">
                Bạn có chắc chắn muốn {actionTarget.action === 'LOCK' ? 'khóa' : 'mở khóa'} tài khoản{' '}
                <strong>{actionTarget.user.username}</strong> ({actionTarget.user.displayName})?
              </p>
            </div>

            {actionTarget.action === 'LOCK' && (
              <div className="dialog-warning-banner">
                <span>⚠️</span>
                <span>Tài khoản sau khi khóa sẽ bị ngắt phiên và từ chối mọi yêu cầu đăng nhập tiếp theo.</span>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setActionTarget(null)}
                disabled={actionLoading}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className={`btn ${actionTarget.action === 'LOCK' ? 'btn-danger' : 'btn-success'}`}
                onClick={() =>
                  handleStatusChange(
                    actionTarget.user,
                    actionTarget.action === 'LOCK' ? 'LOCKED' : 'ACTIVE'
                  )
                }
                disabled={actionLoading}
                autoFocus
              >
                {actionLoading ? 'Đang cập nhật…' : actionTarget.action === 'LOCK' ? 'Đồng ý khóa tài khoản' : 'Đồng ý mở khóa'}
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* Create User Modal via Native HTML5 <dialog> */}
      <dialog
        ref={createDialogRef}
        className="native-modal-dialog"
        aria-labelledby="create-user-title"
      >
        <div className="modal-content">
          <div className="modal-header">
            <div className="modal-title-with-icon">
              <div className="modal-title-icon">
                <PlusIcon size={18} />
              </div>
              <h3 id="create-user-title">Tạo mới Tài khoản Người dùng</h3>
            </div>
            <button
              type="button"
              className="modal-close"
              onClick={() => setIsCreateOpen(false)}
              aria-label="Đóng hộp thoại"
            >
              &times;
            </button>
          </div>

          <form onSubmit={handleCreateUser} className="modal-body modern-form">
            {createError && (
              <div className="alert alert-error" role="alert">
                <span>⚠️</span>
                <div>{createError}</div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="new-user-name">Tên đăng nhập (username)</label>
              <input
                id="new-user-name"
                name="username"
                type="text"
                className="form-control"
                placeholder="Ví dụ: resident_a101"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                disabled={createLoading}
                autoComplete="off"
                spellCheck="false"
                autoCapitalize="none"
                required
              />
              <span className="field-hint">Không phân biệt chữ hoa, chữ thường; viết liền không dấu.</span>
            </div>

            <div className="form-group">
              <label htmlFor="new-display-name">Tên hiển thị</label>
              <input
                id="new-display-name"
                name="displayName"
                type="text"
                className="form-control"
                placeholder="Ví dụ: Nguyễn Văn A (Căn 1204)"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                disabled={createLoading}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="new-user-password">Mật khẩu ban đầu (tối thiểu 12 ký tự)</label>
              <input
                id="new-user-password"
                name="password"
                type="password"
                className="form-control"
                placeholder="Nhập ít nhất 12 ký tự..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={createLoading}
                minLength={12}
                required
                aria-describedby="new-user-password-hint"
              />
              <div className="password-strength-bar">
                <div
                  className={`strength-progress ${newPassword.length >= 12 ? 'is-valid' : ''}`}
                  style={{ width: `${Math.min(100, (newPassword.length / 12) * 100)}%` }}
                />
              </div>
              <span id="new-user-password-hint" className="field-hint">
                Độ dài: {newPassword.length}/12 ký tự {newPassword.length >= 12 ? '✓ Đạt chuẩn bảo mật' : '(chưa đủ)'}
              </span>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setIsCreateOpen(false)}
                disabled={createLoading}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={createLoading || newPassword.length < 12}
              >
                {createLoading ? 'Đang khởi tạo…' : 'Tạo tài khoản'}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  )
}
