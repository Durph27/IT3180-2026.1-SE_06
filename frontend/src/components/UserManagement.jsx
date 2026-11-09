import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getUsersApi, updateUserStatusApi } from '../api/users'
import { useAuth } from '../hooks/useAuth'
import { UsersIcon, PlusIcon, LockIcon, UnlockIcon, SearchIcon } from './Icons'
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

  // Create User modal
  const [isCreateOpen, setIsCreateOpen] = useState(false)
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
      const code = err.response?.data?.code
      if (err.response?.status !== 403 && code === 'INVALID_STATE') {
        setError('Không thể khóa: Hệ thống phải duy trì ít nhất một tài khoản Quản trị viên (ADMIN) đang hoạt động.')
      } else {
        setError(apiErrorMessage(err, 'Thao tác cập nhật trạng thái thất bại.'))
      }
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

  const handleRolesSaved = async (user) => {
    setRoleTarget(null)
    setError('')
    setSuccessMsg(`Đã cập nhật vai trò cho tài khoản "${user.username}".`)
    if (user.id === currentUser.id) await refreshProfile()
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

  if (readForbidden) return <ForbiddenView onBack={onBack} />

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

        {canCreate && (
          <button
            type="button"
            className="btn btn-primary btn-add-user"
            onClick={() => {
              setError('')
              setSuccessMsg('')
              setIsCreateOpen(true)
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
                  {canAct && <th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={canAct ? 5 : 4} className="empty-table-cell">
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
                        {canAct && (
                          <td data-label="Thao tác">
                            <div className="account-row-actions">
                            {canAssignRoles && <button type="button" className="action-btn action-btn-role" onClick={() => { setSuccessMsg(''); setRoleTarget(u) }}>Đổi vai trò</button>}
                            {canManage && (isActive ? (
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
                            ))}
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
      {canManage && <dialog
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
      </dialog>}

      {canCreate && isCreateOpen && <CreateUserDialog onClose={() => setIsCreateOpen(false)} onCreated={handleCreated} onFailure={setError} />}
      {canAssignRoles && roleTarget && <UserRoleDialog key={roleTarget.id} targetUser={roleTarget} onClose={() => setRoleTarget(null)} onSaved={handleRolesSaved} onFailure={setError} />}
    </div>
  )
}
