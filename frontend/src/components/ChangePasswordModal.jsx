import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { KeyIcon, LockIcon, CheckCircleIcon } from './Icons'

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

  // Native dialog cancel (Esc key) handling
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (e) => {
      e.preventDefault()
      handleReset()
    }

    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [handleReset])

  // Light-dismiss (click outside dialog boundary) per Modern Web Guidance
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
        handleReset()
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
      className="native-modal-dialog"
      aria-labelledby="change-password-title"
    >
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <div className="modal-title-icon">
              <KeyIcon size={18} />
            </div>
            <h3 id="change-password-title">Đổi mật khẩu tài khoản</h3>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={handleReset}
            aria-label="Đóng hộp thoại"
          >
            &times;
          </button>
        </div>

        {success ? (
          <div className="modal-body">
            <div className="success-state-card">
              <div className="success-state-icon">
                <CheckCircleIcon size={36} />
              </div>
              <h4>Đổi mật khẩu thành công!</h4>
              <p>Hệ thống đã tự động thu hồi phiên đăng nhập cũ nhằm bảo mật. Đang chuyển hướng về màn hình đăng nhập…</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-body modern-form">
            {error && (
              <div className="alert alert-error" role="alert">
                <span>⚠️</span>
                <div>{error}</div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="current-pw">Mật khẩu hiện tại</label>
              <div className="input-with-icon">
                <span className="input-icon">
                  <LockIcon size={16} />
                </span>
                <input
                  id="current-pw"
                  name="currentPassword"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  placeholder="Nhập mật khẩu đang dùng..."
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="new-pw">Mật khẩu mới (tối thiểu 12 ký tự)</label>
              <div className="input-with-icon">
                <span className="input-icon">
                  <KeyIcon size={16} />
                </span>
                <input
                  id="new-pw"
                  name="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  placeholder="Tối thiểu 12 ký tự bảo mật..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  aria-describedby="password-rules"
                />
              </div>

              {/* Strength Meter Bar */}
              <div className="password-strength-bar">
                <div
                  className={`strength-progress ${isLengthValid ? 'is-valid' : ''}`}
                  style={{ width: `${Math.min(100, (newPassword.length / 12) * 100)}%` }}
                />
              </div>
              <div id="password-rules" className="field-hint-row">
                <span className="field-hint">
                  Độ dài: {newPassword.length}/12 ký tự {isLengthValid ? '✓ Đạt chuẩn' : ''}
                </span>
                {newPassword && newPassword === currentPassword && (
                  <span className="field-hint text-danger">Không được trùng mật khẩu cũ</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirm-pw">Xác nhận mật khẩu mới</label>
              <div className="input-with-icon">
                <span className="input-icon">
                  <LockIcon size={16} />
                </span>
                <input
                  id="confirm-pw"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  placeholder="Nhập lại mật khẩu mới..."
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </div>
              {confirmPassword && (
                <span className={`field-hint ${isMatching ? 'text-success' : 'text-danger'}`}>
                  {isMatching ? '✓ Mật khẩu xác nhận trùng khớp' : '✗ Mật khẩu xác nhận chưa khớp'}
                </span>
              )}
            </div>

            <div className="form-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                />
                {' '}Hiện các trường mật khẩu
              </label>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleReset}
                disabled={loading}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="btn btn-primary"
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
