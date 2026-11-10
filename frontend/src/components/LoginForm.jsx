import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { MoonLogoIcon, AlertTriangleIcon } from './Icons'

export default function LoginForm() {
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
    <div className="login-split-wrapper">
      {/* Left Column: Operations Showcase */}
      <div className="login-showcase-side">
        <div>
          <div className="login-showcase-brand">
            <div className="brand-logo-wrapper">
              <MoonLogoIcon size={22} />
            </div>
            <div>
              <div className="login-brand-name">BlueMoon</div>
              <div className="login-brand-caption">Quản lý căn hộ và thu phí</div>
            </div>
          </div>

          <h1 className="login-showcase-title">
            Thông tin rõ ràng. Quản lý thuận tiện.
          </h1>
          <p className="login-showcase-desc">
            Không gian làm việc của ban quản lý và cư dân: tra cứu hồ sơ căn hộ, theo dõi khoản thu và biểu phí trong phạm vi được cấp quyền.
          </p>
        </div>

        <div className="login-showcase-footer">
          <div>Hệ thống quản lý nội bộ BlueMoon</div>
        </div>
      </div>

      {/* Right Column: Form Side */}
      <div className="login-form-side">
        <div className="login-header-group">
          <h2 className="login-form-title">Đăng nhập tài khoản</h2>
          <p className="login-form-desc">
            Nhập tên đăng nhập và mật khẩu để bắt đầu phiên làm việc
          </p>
        </div>

        {errorMessage && (
          <div className="alert-banner alert-danger" role="alert">
            <AlertTriangleIcon size={18} aria-hidden="true" />
            <div>{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate={false}>
          <div className="form-group">
            <label htmlFor="login-username" className="form-label">
              Tên đăng nhập <span className="req-star">*</span>
            </label>
            <input
              id="login-username"
              name="username"
              type="text"
              className="form-input"
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

          <div className="form-group">
            <div className="login-password-label">
              <label htmlFor="login-password" className="form-label">
                Mật khẩu <span className="req-star">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="login-password-toggle"
                aria-pressed={showPassword}
                aria-controls="login-password"
              >
                {showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              </button>
            </div>
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              enterKeyHint="done"
              required
            />
          </div>

          <div className="login-form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Đang xác thực thông tin…' : 'Đăng nhập vào hệ thống'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
