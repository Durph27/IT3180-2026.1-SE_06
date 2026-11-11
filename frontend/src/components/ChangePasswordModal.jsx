import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { KeyIcon, CheckCircleIcon, XIcon, AlertTriangleIcon } from './Icons'

export default function ChangePasswordModal({ isOpen, onClose }) {
  const { changePassword } = useAuth()
  const dialogRef = useRef(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const loadingRef = useRef(loading)
  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  const handleReset = useCallback(() => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setSuccess(false)
    onClose()
  }, [onClose])

  // Native HTML5 <dialog> focus and top-layer management
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal()
      }
    } else {
      if (dialog.open) {
        dialog.close()
      }
    }
  }, [isOpen])

  // Native dialog cancel (Esc key) handling - block when loading
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (e) => {
      e.preventDefault()
      if (loadingRef.current) return
      handleReset()
    }

    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [handleReset])

  // Light-dismiss (click outside dialog boundary) - block when loading
  const pressedOutsideRef = useRef(false)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const outside = (e, el) => {
      const r = el.getBoundingClientRect()
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    }

    const handlePointerDown = (e) => {
      pressedOutsideRef.current = outside(e, dialog)
    }
    const handlePointerUp = (e) => {
      if (pressedOutsideRef.current && outside(e, dialog)) {
        if (!loadingRef.current) {
          handleReset()
        }
      }
      pressedOutsideRef.current = false
    }

    dialog.addEventListener('pointerdown', handlePointerDown)
    dialog.addEventListener('pointerup', handlePointerUp)
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown)
      dialog.removeEventListener('pointerup', handlePointerUp)
    }
  }, [handleReset])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!currentPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại.')
      return
    }

    if (newPassword.length < 12) {
      setError('Mật khẩu mới phải có độ dài tối thiểu 12 ký tự.')
      return
    }

    if (newPassword === currentPassword) {
      setError('Mật khẩu mới không được trùng với mật khẩu hiện tại.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không trùng khớp.')
      return
    }

    setLoading(true)
    const result = await changePassword(currentPassword, newPassword)
    setLoading(false)

    if (result.success) {
      setSuccess(true)
      setTimeout(() => {
        handleReset()
      }, 2000)
    } else {
      setError(result.error)
    }
  }

  const isMatching = confirmPassword && newPassword === confirmPassword
  const isLengthValid = newPassword.length >= 12

  return (
    <dialog
      ref={dialogRef}
      className="modern-dialog"
      aria-labelledby="change-password-title"
    >
      <div>
        <div className="dialog-header">
          <div className="dialog-header-title">
            <div className="dialog-icon-badge">
              <KeyIcon size={20} />
            </div>
            <div>
              <h3 id="change-password-title" className="dialog-title">Đổi mật khẩu tài khoản</h3>
              <p className="dialog-subtitle">Cập nhật mật khẩu để bảo vệ an toàn tài khoản</p>
            </div>
          </div>
          <button
            type="button"
            className="dialog-close-btn"
            onClick={handleReset}
            disabled={loading}
            aria-label="Đóng hộp thoại"
          >
            <XIcon size={18} />
          </button>
        </div>

        {success ? (
          <div className="dialog-body">
            <div className="alert-banner alert-success" style={{ padding: '24px', textAlign: 'center', display: 'block' }}>
              <CheckCircleIcon size={36} />
              <h4 style={{ margin: '12px 0 6px' }}>Đổi mật khẩu thành công!</h4>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>
                Hệ thống đã tự động thu hồi phiên đăng nhập cũ nhằm bảo mật. Đang chuyển hướng về màn hình đăng nhập…
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="dialog-body">
              {error && (
                <div className="alert-banner alert-danger" role="alert">
                  <AlertTriangleIcon size={18} aria-hidden="true" />
                  <div>{error}</div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="change-pw-current" className="form-label">
                  Mật khẩu hiện tại <span className="req-star">*</span>
                </label>
                <input
                  id="change-pw-current"
                  name="currentPassword"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Nhập mật khẩu đang dùng…"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="change-pw-new" className="form-label">
                  Mật khẩu mới (tối thiểu 12 ký tự) <span className="req-star">*</span>
                </label>
                <span id="change-pw-new-hint" className="field-hint">
                  Độ dài: {newPassword.length}/12 ký tự {isLengthValid ? '✓ Đạt chuẩn bảo mật' : ''}
                </span>
                <input
                  id="change-pw-new"
                  name="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Tối thiểu 12 ký tự bảo mật…"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  aria-describedby="change-pw-new-hint"
                />
                {newPassword && newPassword === currentPassword && (
                  <div className="field-error-msg" role="alert">Mật khẩu mới không được trùng mật khẩu cũ.</div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="change-pw-confirm" className="form-label">
                  Xác nhận mật khẩu mới <span className="req-star">*</span>
                </label>
                <input
                  id="change-pw-confirm"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Nhập lại mật khẩu mới…"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  aria-describedby={confirmPassword ? 'change-pw-confirm-msg' : undefined}
                />
                {confirmPassword && (
                  <div
                    id="change-pw-confirm-msg"
                    className={isMatching ? 'field-hint' : 'field-error-msg'}
                    role={isMatching ? undefined : 'alert'}
                    style={{ color: isMatching ? 'var(--ledger-teal)' : 'var(--signal-crimson)', marginTop: '4px' }}
                  >
                    {isMatching ? '✓ Mật khẩu xác nhận trùng khớp' : '✗ Mật khẩu xác nhận chưa khớp'}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '16px', fontSize: '0.825rem' }}>
                <label htmlFor="change-pw-show" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    id="change-pw-show"
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    disabled={loading}
                  />
                  Hiện các trường mật khẩu
                </label>
              </div>
            </div>

            <div className="dialog-footer dialog-form-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleReset}
                disabled={loading}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={loading || !isLengthValid || !isMatching}
              >
                {loading ? 'Đang cập nhật…' : 'Lưu mật khẩu mới'}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}
