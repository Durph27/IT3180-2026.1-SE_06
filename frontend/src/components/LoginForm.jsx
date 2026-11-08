import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { MoonLogoIcon } from './Icons'

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

  const fillAdminCredentials = () => {
    setUsername('admin')
    setPassword('Admin@123456!')
    setErrorMessage('')
  }

  return (
    <div className="login-split-wrapper">
      {/* Left Column: Architectural Showcase */}
      <div className="login-showcase-side">
        <div>
          <div className="login-showcase-brand">
            <div className="brand-logo-wrapper">
              <MoonLogoIcon size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>BlueMoon</div>
              <div style={{ fontSize: '0.725rem', color: '#94A3B8' }}>Property & Fee Management</div>
            </div>
          </div>

          <h1 className="login-showcase-title">
            Hệ thống Quản lý Vận hành Chung cư Hiện đại
          </h1>
          <p className="login-showcase-desc">
            Nền tảng kiểm soát cư trú, quản lý hồ sơ căn hộ, tự động hóa lập bảng kê chi phí và đối soát thu phí minh bạch, chuẩn xác.
          </p>
        </div>

        <div className="login-showcase-footer">
          <div>Phiên bản Sprint 1 · Kiến trúc Phân quyền RBAC</div>
          <div style={{ color: '#64748B', marginTop: 4 }}>Bảo mật mã hóa BCrypt · Quản lý phiên Bearer Token</div>
        </div>
      </div>

      {/* Right Column: Form Side */}
      <div className="login-form-side">
        <div className="login-header-group">
          <h2 className="login-form-title">Đăng nhập tài khoản</h2>
          <p className="login-form-desc">
            Nhập thông tin xác thực để truy cập bảng điều khiển vận hành
          </p>
        </div>

        {errorMessage && (
          <div className="alert-banner alert-danger" role="alert">
            <span>⚠️</span>
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
              placeholder="Nhập tên đăng nhập (VD: admin)"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="login-password" className="form-label">
                Mật khẩu <span className="req-star">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--cobalt-action)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0
                }}
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

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px', padding: '10px' }}
            disabled={loading}
          >
            {loading ? 'Đang xác thực thông tin…' : 'Đăng nhập vào hệ thống'}
          </button>

          {/* Quick Admin fill helper */}
          <div className="quick-admin-box">
            <span>Tài khoản thử nghiệm: <code>admin</code></span>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={fillAdminCredentials}
              disabled={loading}
            >
              Tự động điền
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
