import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getUsersApi, updateUserStatusApi } from '../api/users'
import { useAuth } from '../hooks/useAuth'
import { UsersIcon, PlusIcon, LockIcon, UnlockIcon, SearchIcon, RefreshIcon, AlertTriangleIcon, XIcon } from './Icons'
import PermissionGate from './PermissionGate'
import ForbiddenView from './ForbiddenView'
import CreateUserDialog from './CreateUserDialog'
import UserRoleDialog from './UserRoleDialog'
import { apiErrorMessage } from '../api/errors'

export default function UserManagement({ onBack }) {
  return (
    <PermissionGate permission="user.read" fallback={<ForbiddenView onBack={onBack} />}>
      <UserManagementContent onBack={onBack} />
    </PermissionGate>
  )
}

function UserManagementContent({ onBack }) {
  const { user: currentUser, hasPermission, refreshProfile } = useAuth()
  const canManage = hasPermission('user.manage')
  const canCreate = hasPermission('user.write')
  const canAssignRoles = hasPermission('rbac.manage') && hasPermission('role.read')
  const canAct = canManage || canAssignRoles

  const [roleTarget, setRoleTarget] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [readForbidden, setReadForbidden] = useState(false)

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // ALL | ACTIVE | LOCKED

  // Action state (Lock / Unlock confirmation)
  const [actionTarget, setActionTarget] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const actionDialogRef = useRef(null)

  // Create User modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const actionLoadingRef = useRef(actionLoading)
  useEffect(() => {
    actionLoadingRef.current = actionLoading
  }, [actionLoading])

  // Native <dialog> controls for Action Confirmation
  useEffect(() => {
    const dialog = actionDialogRef.current
    if (!dialog) return

    if (actionTarget) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [actionTarget, canManage])

  // Click-outside light dismiss handler for status confirmation
  const actionPressedOutsideRef = useRef(false)

  useEffect(() => {
    const outside = (e, el) => {
      const r = el.getBoundingClientRect()
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    }

    const bindDismiss = (dialog, pressedRef, loadingRef, onDismiss) => {
      if (!dialog) return () => {}
      const onDown = (e) => {
        pressedRef.current = outside(e, dialog)
      }
      const onUp = (e) => {
        if (pressedRef.current && outside(e, dialog) && !loadingRef.current) {
          onDismiss()
        }
        pressedRef.current = false
      }
      const onCancel = (e) => {
        e.preventDefault()
        if (!loadingRef.current) onDismiss()
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

    return () => {
      unbindAction()
    }
  }, [canManage])

  const refreshUsers = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getUsersApi(0, 100)
      setUsers(data.content || [])
      setError('')
    } catch (err) {
      if (err.response?.status === 403) {
        setUsers([])
        setReadForbidden(true)
      }
      setError(apiErrorMessage(err, 'Không thể tải danh sách tài khoản.'))
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
          if (err.response?.status === 403) {
            setUsers([])
            setReadForbidden(true)
          }
          setError(apiErrorMessage(err, 'Không thể tải danh sách tài khoản.'))
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [])

  const handleStatusChange = async (targetUser, newStatus) => {
    if (!canManage) return
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
      setError(apiErrorMessage(err, 'Cập nhật trạng thái tài khoản thất bại. Vui lòng thử lại.'))
      setActionTarget(null)
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreated = async (user, status) => {
    await refreshUsers()
    if (status === 'pending') {
      setError(`Đã tạo tài khoản "${user.username}" nhưng chưa hoàn tất gán vai trò. Có thể thử lại trong hộp thoại hoặc dùng Đổi vai trò trong danh sách.`)
    } else {
      setSuccessMsg(status === 'assigned'
        ? `Đã tạo và gán vai trò cho tài khoản "${user.username}".`
        : `Đã tạo tài khoản "${user.username}". Quản trị hệ thống cần gán vai trò để tài khoản sử dụng được chức năng.`)
    }
  }

  const handleRolesSaved = async (targetUser) => {
    setRoleTarget(null)
    setSuccessMsg(`Đã cập nhật vai trò cho tài khoản "${targetUser.username}".`)
    setError('')
    if (targetUser.id === currentUser?.id) {
      await refreshProfile()
    }
    await refreshUsers()
  }

  // Filtered users calculation
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchStatus = statusFilter === 'ALL' || u.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [users, searchTerm, statusFilter])

  // Count active / locked
  const counts = useMemo(() => {
    const total = users.length
    const active = users.filter((u) => u.status === 'ACTIVE').length
    const locked = users.filter((u) => u.status === 'LOCKED').length
    return { total, active, locked }
  }, [users])

  if (readForbidden) {
    return <ForbiddenView onBack={onBack} />
  }

  return (
    <div className="management-view">
      {/* View Header */}
      <div className="management-header">
        <div>
          <div className="section-title">
            <UsersIcon size={24} />
            <h2>Quản lý Tài khoản Hệ thống</h2>
          </div>
          <p className="section-subtitle">
            Quản trị danh sách tài khoản nội bộ, phân quyền vai trò hệ thống và trạng thái hoạt động.
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={refreshUsers}
            disabled={loading}
            title="Tải lại danh sách"
          >
            <RefreshIcon size={16} />
            <span>Làm mới</span>
          </button>
          {canCreate && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setError('')
                setSuccessMsg('')
                setIsCreateOpen(true)
              }}
            >
              <PlusIcon size={16} />
              <span>Thêm tài khoản mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="status-strip">
        <div className="status-badge">
          <span className="badge-label">Tổng số tài khoản</span>
          <span className="badge-count count-total">{counts.total}</span>
        </div>
        <div className="status-badge">
          <span className="badge-label">Đang hoạt động</span>
          <span className="badge-count count-active">{counts.active}</span>
        </div>
        <div className="status-badge">
          <span className="badge-label">Đã bị khóa</span>
          <span className="badge-count count-locked">{counts.locked}</span>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="alert alert-danger" role="alert">
          <AlertTriangleIcon size={18} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="alert-close" onClick={() => setError('')} aria-label="Đóng thông báo lỗi">
            <XIcon size={14} />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success" role="alert">
          <span>{successMsg}</span>
          <button type="button" className="alert-close" onClick={() => setSuccessMsg('')} aria-label="Đóng thông báo thành công">
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="filters-toolbar">
        <div className="search-box">
          <SearchIcon size={16} />
          <input
            type="search"
            className="search-input"
            aria-label="Tìm theo tên đăng nhập hoặc tên hiển thị"
            placeholder="Tìm theo tên đăng nhập hoặc tên hiển thị…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="status-filter-select">Trạng thái:</label>
          <select
            id="status-filter-select"
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">Tất cả ({counts.total})</option>
            <option value="ACTIVE">Đang hoạt động ({counts.active})</option>
            <option value="LOCKED">Đã khóa ({counts.locked})</option>
          </select>
        </div>
      </div>

      {/* Users Table / Content */}
      <div className="table-responsive-container">
        {loading && users.length === 0 ? (
          <div className="loading-state">
            <span className="loading-spinner" />
            <p>Đang tải danh sách tài khoản…</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="app-table" aria-label="Danh sách tài khoản">
              <thead>
                <tr>
                  <th scope="col" style={{ width: '80px' }}>STT</th>
                  <th scope="col">Tên đăng nhập</th>
                  <th scope="col">Tên hiển thị</th>
                  <th scope="col" style={{ width: '160px' }}>Trạng thái</th>
                  <th scope="col" style={{ width: '180px' }}>Ngày tạo</th>
                  {canAct && (
                    <th scope="col" style={{ width: '220px', textAlign: 'right' }}>
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={canAct ? 6 : 5}>
                      <div className="empty-table-state">
                        <div className="empty-table-title">
                          {users.length === 0 ? 'Chưa có tài khoản nào' : 'Không tìm thấy tài khoản phù hợp'}
                        </div>
                        <p className="empty-table-desc">
                          {users.length === 0
                            ? 'Bấm "Thêm tài khoản" ở trên để khởi tạo người dùng mới.'
                            : 'Thử thay đổi từ khóa tìm kiếm hoặc bỏ lọc trạng thái.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u, index) => {
                    const isSelf = u.id === currentUser?.id
                    const isActive = u.status === 'ACTIVE'
                    const isLocked = u.status === 'LOCKED'

                    return (
                      <tr key={u.id}>
                        <td data-label="STT">
                          <span style={{ color: 'var(--slate-muted)' }}>{index + 1}</span>
                        </td>
                        <td data-label="Tên đăng nhập">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600 }}>{u.username}</span>
                            {isSelf && <span className="badge-self">Bạn</span>}
                          </div>
                        </td>
                        <td data-label="Tên hiển thị">{u.displayName || '—'}</td>
                        <td data-label="Trạng thái">
                          {isActive && <span className="badge-active">Hoạt động</span>}
                          {isLocked && <span className="badge-locked">Bị khóa</span>}
                          {!isActive && !isLocked && (
                            <span className="badge-inactive">{u.status || 'Chưa rõ'}</span>
                          )}
                        </td>
                        <td data-label="Ngày tạo">
                          <span style={{ fontSize: '0.85rem', color: 'var(--slate-muted)' }}>
                            {u.createdAt
                              ? new Date(u.createdAt).toLocaleDateString('vi-VN', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </span>
                        </td>
                        {canAct && (
                          <td data-label="Thao tác" style={{ textAlign: 'right' }}>
                            <div className="account-row-actions">
                              {canAssignRoles && (
                                <button
                                  type="button"
                                  className="action-btn action-btn-role"
                                  onClick={() => {
                                    setSuccessMsg('')
                                    setRoleTarget(u)
                                  }}
                                  title="Gán hoặc sửa vai trò tài khoản"
                                >
                                  Đổi vai trò
                                </button>
                              )}

                              {canManage && (
                                isActive ? (
                                  <button
                                    type="button"
                                    className="action-btn action-btn-lock"
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
                                    className="action-btn action-btn-unlock"
                                    onClick={() => setActionTarget({ user: u, action: 'UNLOCK' })}
                                    disabled={actionLoading}
                                    title="Mở khóa tài khoản này"
                                  >
                                    <UnlockIcon size={13} />
                                    <span>Mở khóa</span>
                                  </button>
                                ) : (
                                  <span style={{ color: 'var(--slate-muted)' }}>—</span>
                                )
                              )}
                            </div>
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
      {canManage && (
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
                  <AlertTriangleIcon size={18} aria-hidden="true" />
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
      )}

      {/* Create User Dialog from main */}
      {canCreate && isCreateOpen && (
        <CreateUserDialog
          onClose={() => setIsCreateOpen(false)}
          onCreated={handleCreated}
          onFailure={setError}
        />
      )}

      {/* User Role Assignment Dialog from main */}
      {canAssignRoles && roleTarget && (
        <UserRoleDialog
          key={roleTarget.id}
          targetUser={roleTarget}
          onClose={() => setRoleTarget(null)}
          onSaved={handleRolesSaved}
          onFailure={setError}
        />
      )}
    </div>
  )
}
