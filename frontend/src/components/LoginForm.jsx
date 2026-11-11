import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { MoonLogoIcon, UserIcon, LockIcon, AlertTriangleIcon } from './Icons'

export default function LoginForm({ onRegister }) {
  const { login } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')

    if (!username.trim()) {
      setErrorMessage('Vui lòng nhập tên đăng nhập.')
      return
    }

    if (!password) {
      setErrorMessage('Vui lòng nhập mật khẩu.')
      return
    }

    setLoading(true)
    const result = await login(username, password)
    setLoading(false)

    if (!result.success) {
      setErrorMessage(result.error)
    }
  }

  return (
    <div className="login-split-wrapper min-[901px]:flex-row-reverse">
      {/* Form column; the informational showcase has no focusable content, so visual order is safe to swap. */}
      <div className="login-form-side">
        <div className="login-card-inner">
          <div className="login-brand-header">
            <div className="login-logo-badge">
              <MoonLogoIcon size={24} />
            </div>
            <div>
              <span className="login-brand-name">BlueMoon</span>
              <span className="login-brand-tag">Quản lý căn hộ và thu phí</span>
            </div>
          </div>

          <div className="login-welcome-text">
            <h2>Đăng nhập tài khoản</h2>
            <p>Nhập tên đăng nhập và mật khẩu để bắt đầu phiên làm việc</p>
          </div>

          {errorMessage && (
            <div className="alert alert-error" role="alert">
              <AlertTriangleIcon size={18} className="shrink-0" />
              <div>{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="modern-form" noValidate={false}>
            <div className="form-group">
              <label htmlFor="login-username">Tên đăng nhập</label>
              <div className="input-with-icon">
                <span className="input-icon">
                  <UserIcon size={16} />
                </span>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  className="form-control"
                  placeholder="Nhập tên đăng nhập"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                  spellCheck="false"
                  autoCapitalize="none"
                  enterKeyHint="next"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Mật khẩu</label>
              <div className="input-with-icon">
                <span className="input-icon">
                  <LockIcon size={16} />
                </span>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control input-has-toggle"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  enterKeyHint="done"
                  required
                />
                <button
                  type="button"
                  className="btn-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-pressed={showPassword}
                  aria-controls="login-password"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="btn-spinner" />
                  <span>Đang xác thực…</span>
                </>
              ) : (
                'Đăng nhập'
              )}
            </button>

            <p className="login-switch">Cư dân chưa có tài khoản? <button type="button" className="link-button" disabled={loading} onClick={onRegister}>Đăng ký</button></p>
          </form>
        </div>
      </div>

      <div className="login-showcase-side">
        <div className="showcase-content">
          <h2 className="showcase-title">Thông tin rõ ràng. Quản lý thuận tiện.</h2>
          <p className="showcase-desc">
            Không gian làm việc của ban quản lý và cư dân: tra cứu hồ sơ căn hộ, theo dõi khoản thu và biểu phí trong phạm vi được cấp quyền.
          </p>
          <p className="showcase-desc">Hệ thống quản lý nội bộ BlueMoon</p>
        </div>
      </div>
    </div>
  )
}
