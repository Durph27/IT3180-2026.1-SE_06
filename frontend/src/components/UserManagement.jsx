import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getUsersApi, updateUserStatusApi } from '../api/users'
import { useAuth } from '../hooks/useAuth'
import { UsersIcon, PlusIcon, LockIcon, UnlockIcon, SearchIcon, RefreshIcon, AlertTriangleIcon, XIcon, CheckCircleIcon } from './Icons'
import PageHeader from './PageHeader'
import StatCard from './StatCard'
import PermissionGate from './PermissionGate'
import ForbiddenView from './ForbiddenView'
import CreateUserDialog from './CreateUserDialog'
import UserRoleDialog from './UserRoleDialog'
import RegistrationRequests from './RegistrationRequests'
import { apiErrorMessage } from '../api/errors'

const ALERT_CLOSE = 'ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-current opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current'

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

  const filterButton = (value, label) => (
    <button
      type="button"
      className={`filter-btn ${statusFilter === value ? 'active' : ''}`}
      aria-pressed={statusFilter === value}
      onClick={() => setStatusFilter(value)}
    >
      {label}
    </button>
  )

  return (
    <div className="user-management-container">
      <PageHeader
        title="Quản lý Tài khoản Hệ thống"
        description="Quản trị danh sách tài khoản nội bộ, phân quyền vai trò hệ thống và trạng thái hoạt động."
        actions={(
          <>
            <button type="button" className="btn btn-secondary" onClick={refreshUsers} disabled={loading} title="Tải lại danh sách">
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
          </>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tổng số tài khoản" value={counts.total} icon={UsersIcon} />
        <StatCard label="Đang hoạt động" value={counts.active} tone="success" icon={CheckCircleIcon} />
        <StatCard label="Đã bị khóa" value={counts.locked} tone="danger" icon={LockIcon} />
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangleIcon size={18} className="shrink-0" />
          <div className="flex-1">{error}</div>
          <button type="button" className={ALERT_CLOSE} onClick={() => setError('')} aria-label="Đóng thông báo lỗi">
            <XIcon size={14} />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success" role="status">
          <CheckCircleIcon size={18} className="shrink-0" />
          <div className="flex-1">{successMsg}</div>
          <button type="button" className={ALERT_CLOSE} onClick={() => setSuccessMsg('')} aria-label="Đóng thông báo thành công">
            <XIcon size={14} />
          </button>
        </div>
      )}

      {canManage && <RegistrationRequests onReviewed={refreshUsers} />}

      <div className="table-card">
        <div className="table-toolbar">
          <div className="search-box">
            <SearchIcon size={16} className="search-icon" />
            <input
              type="search"
              className="search-input"
              placeholder="Tìm theo tên đăng nhập hoặc tên hiển thị…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Tìm theo tên đăng nhập hoặc tên hiển thị"
            />
            {searchTerm && (
              <button type="button" className="search-clear-btn" onClick={() => setSearchTerm('')} aria-label="Xóa nội dung tìm kiếm">
                <XIcon size={14} />
              </button>
            )}
          </div>

          <div className="filter-buttons-group" role="group" aria-label="Lọc theo trạng thái">
            {filterButton('ALL', `Tất cả (${counts.total})`)}
            {filterButton('ACTIVE', `Hoạt động (${counts.active})`)}
            {filterButton('LOCKED', `Đã khóa (${counts.locked})`)}
          </div>
        </div>

        {loading && users.length === 0 ? (
          <div className="table-loading-box">
            <div className="loading-spinner-ring" />
            <p>Đang tải danh sách tài khoản…</p>
          </div>
        ) : (
          <div tabIndex={0} role="region" aria-labelledby="user-table-caption" className="table-wrapper">
            <table className="modern-table">
              <caption id="user-table-caption" className="table-caption">
                Danh sách người dùng và phân quyền hệ thống
              </caption>
              <thead>
                <tr>
                  <th scope="col">Tài khoản</th>
                  <th scope="col">Tên hiển thị</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Ngày tạo</th>
                  {canAct && <th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={canAct ? 5 : 4} className="empty-table-cell">
                      <div className="empty-state-box">
                        <p className="font-semibold text-slate-900">{users.length === 0 ? 'Chưa có tài khoản nào' : 'Không tìm thấy tài khoản phù hợp'}</p>
                        <p>{users.length === 0 ? 'Bấm "Thêm tài khoản mới" ở trên để khởi tạo người dùng.' : 'Thử thay đổi từ khóa tìm kiếm hoặc bỏ lọc trạng thái.'}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.id === currentUser?.id
                    const isActive = u.status === 'ACTIVE'
                    const isLocked = u.status === 'LOCKED'
                    const initialLetter = (u.displayName || u.username || 'U').charAt(0).toUpperCase()

                    return (
                      <tr key={u.id} className={isSelf ? 'row-is-current' : ''}>
                        <th scope="row" className="row-header-th">
                          <div className="user-cell">
                            <div className={`user-table-avatar ${isLocked ? 'avatar-locked' : ''}`}>{initialLetter}</div>
                            <div className="user-cell-meta">
                              <span className="user-username">{u.username}</span>
                              {isSelf && <span className="tag-self">Chính bạn</span>}
                            </div>
                          </div>
                        </th>
                        <td data-label="Tên hiển thị">
                          <span className="user-display-name">{u.displayName || '—'}</span>
                        </td>
                        <td data-label="Trạng thái">
                          <div className={`status-pill pill-${(u.status || 'unknown').toLowerCase()}`}>
                            <span className="pill-dot" />
                            <span>{isActive ? 'Hoạt động' : isLocked ? 'Đã khóa' : u.status || 'Chưa rõ'}</span>
                          </div>
                        </td>
                        <td data-label="Ngày tạo">
                          <span className="date-cell">
                            {u.createdAt
                              ? new Date(u.createdAt).toLocaleString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </span>
                        </td>
                        {canAct && (
                          <td data-label="Thao tác">
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
                              {canManage && (isActive ? (
                                <button type="button" className="action-btn action-btn-lock" onClick={() => setActionTarget({ user: u, action: 'LOCK' })} disabled={actionLoading} title="Khóa tài khoản này">
                                  <LockIcon size={14} />
                                  <span>Khóa</span>
                                </button>
                              ) : isLocked ? (
                                <button type="button" className="action-btn action-btn-unlock" onClick={() => setActionTarget({ user: u, action: 'UNLOCK' })} disabled={actionLoading} title="Mở khóa tài khoản này">
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

      {canCreate && isCreateOpen && (
        <CreateUserDialog
          onClose={() => setIsCreateOpen(false)}
          onCreated={handleCreated}
          onFailure={setError}
        />
      )}

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
