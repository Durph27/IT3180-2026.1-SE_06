import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getUsersApi, updateUserStatusApi, createUserApi } from '../api/users'
import { useAuth } from '../hooks/useAuth'
import { UsersIcon, PlusIcon, LockIcon, UnlockIcon, SearchIcon, RefreshIcon, XIcon } from './Icons'

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
  const actionLoadingRef = useRef(actionLoading)
  useEffect(() => {
    actionLoadingRef.current = actionLoading
  }, [actionLoading])

  // Create User modal
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const createDialogRef = useRef(null)
  const createLoadingRef = useRef(createLoading)
  useEffect(() => {
    createLoadingRef.current = createLoading
  }, [createLoading])

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

  // Click-outside light dismiss handler for both dialogs - blocked when busy
  const actionPressedOutsideRef = useRef(false)
  const createPressedOutsideRef = useRef(false)

  useEffect(() => {
    const outside = (e, el) => {
      const r = el.getBoundingClientRect()
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    }

    const bindDismiss = (dialog, pressedRef, isBusyRef, onDismiss) => {
      if (!dialog) return () => {}
      const onDown = (e) => {
        pressedRef.current = outside(e, dialog)
      }
      const onUp = (e) => {
        if (pressedRef.current && outside(e, dialog)) {
          if (!isBusyRef.current) {
            onDismiss()
          }
        }
        pressedRef.current = false
      }
      const onCancel = (e) => {
        e.preventDefault()
        if (isBusyRef.current) return
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

    const unbindAction = bindDismiss(
      actionDialogRef.current,
      actionPressedOutsideRef,
      actionLoadingRef,
      () => setActionTarget(null)
    )
    const unbindCreate = bindDismiss(
      createDialogRef.current,
      createPressedOutsideRef,
      createLoadingRef,
      () => setIsCreateOpen(false)
    )

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
    <div className="user-management-page">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <div className="page-icon-wrapper">
            <UsersIcon size={24} />
          </div>
          <div>
            <h1 className="page-title">Quản trị tài khoản hệ thống</h1>
            <p className="page-description">
              Kiểm soát danh mục người dùng, phân quyền truy cập và chuyển đổi trạng thái khóa / kích hoạt
            </p>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setIsCreateOpen(true)
              setCreateError('')
            }}
          >
            <PlusIcon size={16} />
            <span>Thêm tài khoản mới</span>
          </button>
        )}
      </div>

      {/* Sleek Metric Strip */}
      <div className="stats-strip" aria-label="Thống kê tài khoản">
        <div className="stats-item">
          <span className="stats-label">Tổng số tài khoản</span>
          <div className="stats-value-row">
            <span className="stats-number stats-highlight-cobalt">{totalCount}</span>
            <span className="stats-subtext">Trong danh sách đã tải</span>
          </div>
        </div>
        <div className="stats-item">
          <span className="stats-label">Đang hoạt động</span>
          <div className="stats-value-row">
            <span className="stats-number stats-highlight-teal">{activeCount}</span>
            <span className="stats-subtext">Được phép đăng nhập</span>
          </div>
        </div>
        <div className="stats-item">
          <span className="stats-label">Đang bị khóa</span>
          <div className="stats-value-row">
            <span className="stats-number stats-highlight-crimson">{lockedCount}</span>
            <span className="stats-subtext">Bị vô hiệu hóa phiên</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="alert-banner alert-success" role="status">
          <span>✓</span>
          <div>{successMsg}</div>
        </div>
      )}
      {error && (
        <div className="alert-banner alert-danger" role="alert">
          <span>⚠️</span>
          <div style={{ flex: 1 }}>{error}</div>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={refreshUsers}
            title="Thử tải lại danh sách"
          >
            <RefreshIcon size={12} />
            <span>Thử lại</span>
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="filter-toolbar">
        <div className="filter-group-left">
          <div className="search-input-box">
            <SearchIcon size={15} className="search-icon-inside" />
            <input
              type="search"
              className="form-input-search"
              placeholder="Tìm theo username hoặc tên hiển thị…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Tìm kiếm tài khoản"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
            aria-label="Lọc theo trạng thái"
          >
            <option value="ALL">Tất cả trạng thái ({totalCount})</option>
            <option value="ACTIVE">Hoạt động ({activeCount})</option>
            <option value="LOCKED">Bị khóa ({lockedCount})</option>
          </select>
        </div>
      </div>

      {/* User Table Card */}
      <div className="table-surface-card">
        {loading ? (
          <div className="empty-table-state" style={{ color: 'var(--slate-muted)' }}>
            Đang tải danh sách tài khoản từ máy chủ…
          </div>
        ) : error && users.length === 0 ? (
          <div className="empty-table-state">
            <div className="empty-table-title" style={{ color: 'var(--signal-crimson)' }}>
              Không thể tải danh sách tài khoản
            </div>
            <p className="empty-table-desc">{error}</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={refreshUsers}
            >
              <RefreshIcon size={14} />
              <span>Thử lại</span>
            </button>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="user-table-caption"
            className="table-scroll-region"
          >
            <table className="data-table">
              <caption id="user-table-caption" className="visually-hidden">
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
                    <td colSpan={canManage ? 5 : 4}>
                      <div className="empty-table-state">
                        <div className="empty-table-title">
                          {users.length === 0 ? 'Chưa có tài khoản nào' : 'Không tìm thấy tài khoản'}
                        </div>
                        <p className="empty-table-desc">
                          {users.length === 0
                            ? 'Hệ thống hiện tại chưa có dữ liệu tài khoản người dùng.'
                            : 'Không có người dùng nào khớp với từ khóa hoặc bộ lọc hiện tại.'}
                        </p>
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
                      <tr key={u.id}>
                        <th scope="row" data-label="Tài khoản">
                          <div className="user-identity">
                            <div className="user-avatar">
                              {initialLetter}
                            </div>
                            <span className="code-tag">{u.username}</span>
                            {isCurrent && <span className="floor-tag">Chính bạn</span>}
                          </div>
                        </th>
                        <td data-label="Tên hiển thị">
                          <strong className="font-semibold">{u.displayName}</strong>
                        </td>
                        <td data-label="Trạng thái">
                          {isActive ? (
                            <span className="badge-pill badge-active">● Hoạt động</span>
                          ) : isLocked ? (
                            <span className="badge-pill badge-locked">● Đã khóa</span>
                          ) : (
                            <span className="badge-pill">{u.status}</span>
                          )}
                        </td>
                        <td data-label="Ngày tạo">
                          <span style={{ color: 'var(--slate-muted)', fontSize: '0.8rem' }}>
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
                                className="btn btn-outline-danger btn-xs"
                                onClick={() => setActionTarget({ user: u, action: 'LOCK' })}
                                disabled={actionLoading}
                                title="Khóa tài khoản này"
                              >
                                <LockIcon size={13} />
                                <span>Khóa</span>
                              </button>
                            ) : isLocked ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                onClick={() => setActionTarget({ user: u, action: 'UNLOCK' })}
                                disabled={actionLoading}
                                title="Mở khóa tài khoản này"
                              >
                                <UnlockIcon size={13} />
                                <span>Mở khóa</span>
                              </button>
                            ) : (
                              <span style={{ color: 'var(--slate-muted)' }}>—</span>
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
        className="modern-dialog"
        aria-labelledby="confirm-dialog-title"
      >
        {actionTarget && (
          <div>
            <div className="dialog-header">
              <div className="dialog-header-title">
                <div className="dialog-icon-badge" style={{ color: actionTarget.action === 'LOCK' ? 'var(--signal-crimson)' : 'var(--ledger-teal)' }}>
                  {actionTarget.action === 'LOCK' ? <LockIcon size={20} /> : <UnlockIcon size={20} />}
                </div>
                <div>
                  <h3 id="confirm-dialog-title" className="dialog-title">
                    {actionTarget.action === 'LOCK' ? 'Xác nhận khóa tài khoản' : 'Xác nhận mở khóa tài khoản'}
                  </h3>
                  <p className="dialog-subtitle">
                    Thao tác quản trị phân quyền truy cập hệ thống
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="dialog-close-btn"
                onClick={() => setActionTarget(null)}
                disabled={actionLoading}
                aria-label="Đóng hộp thoại"
              >
                <XIcon size={18} />
              </button>
            </div>

            <div className="dialog-body">
              <p style={{ fontSize: '0.875rem', color: 'var(--ink-slate)', marginBottom: '14px' }}>
                Bạn có chắc chắn muốn {actionTarget.action === 'LOCK' ? 'khóa' : 'mở khóa'} tài khoản{' '}
                <strong>{actionTarget.user.username}</strong> ({actionTarget.user.displayName})?
              </p>

              {actionTarget.action === 'LOCK' && (
                <div className="alert-banner alert-danger">
                  <span>⚠️</span>
                  <span>Tài khoản sau khi khóa sẽ bị hủy phiên làm việc và không thể đăng nhập tiếp tục.</span>
                </div>
              )}
            </div>

            <div className="dialog-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setActionTarget(null)}
                disabled={actionLoading}
                autoFocus
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className={`btn btn-sm ${actionTarget.action === 'LOCK' ? 'btn-danger' : 'btn-primary'}`}
                onClick={() =>
                  handleStatusChange(
                    actionTarget.user,
                    actionTarget.action === 'LOCK' ? 'LOCKED' : 'ACTIVE'
                  )
                }
                disabled={actionLoading}
              >
                {actionLoading
                  ? 'Đang cập nhật…'
                  : actionTarget.action === 'LOCK'
                  ? 'Đồng ý khóa tài khoản'
                  : 'Đồng ý mở khóa'}
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* Create User Modal via Native HTML5 <dialog> */}
      <dialog
        ref={createDialogRef}
        className="modern-dialog"
        aria-labelledby="create-user-title"
      >
        <div>
          <div className="dialog-header">
            <div className="dialog-header-title">
              <div className="dialog-icon-badge">
                <PlusIcon size={20} />
              </div>
              <div>
                <h3 id="create-user-title" className="dialog-title">Tạo tài khoản mới</h3>
                <p className="dialog-subtitle">Khởi tạo thông tin người dùng và phân quyền ban đầu</p>
              </div>
            </div>
            <button
              type="button"
              className="dialog-close-btn"
              onClick={() => setIsCreateOpen(false)}
              disabled={createLoading}
              aria-label="Đóng hộp thoại"
            >
              <XIcon size={18} />
            </button>
          </div>

          <form onSubmit={handleCreateUser}>
            <div className="dialog-body">
              {createError && (
                <div className="alert-banner alert-danger" role="alert">
                  <span>⚠️</span>
                  <div>{createError}</div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="new-user-name" className="form-label">
                  Tên đăng nhập (username) <span className="req-star">*</span>
                </label>
                <span id="new-user-name-hint" className="field-hint">Chữ cái thường, chữ số; viết liền không dấu.</span>
                <input
                  id="new-user-name"
                  name="username"
                  type="text"
                  className="form-input"
                  placeholder="Ví dụ: accountant_01"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  disabled={createLoading}
                  autoComplete="off"
                  spellCheck="false"
                  autoCapitalize="none"
                  required
                  aria-describedby="new-user-name-hint"
                />
              </div>

              <div className="form-group">
                <label htmlFor="new-display-name" className="form-label">
                  Tên hiển thị <span className="req-star">*</span>
                </label>
                <input
                  id="new-display-name"
                  name="displayName"
                  type="text"
                  className="form-input"
                  placeholder="Ví dụ: Nguyễn Văn A (Kế toán)"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  disabled={createLoading}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="new-user-password" className="form-label">
                  Mật khẩu ban đầu <span className="req-star">*</span>
                </label>
                <span id="new-user-password-hint" className="field-hint">Quy chuẩn tối thiểu 12 ký tự ({newPassword.length}/12).</span>
                <input
                  id="new-user-password"
                  name="password"
                  type="password"
                  className="form-input"
                  placeholder="••••••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={createLoading}
                  minLength={12}
                  required
                  aria-describedby="new-user-password-hint"
                />
              </div>
            </div>

            <div className="dialog-footer dialog-form-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsCreateOpen(false)}
                disabled={createLoading}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
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
