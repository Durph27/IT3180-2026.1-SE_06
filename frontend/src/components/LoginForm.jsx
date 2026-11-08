import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useHealth } from '../hooks/useHealth'
import { MoonLogoIcon, UserIcon, LockIcon, BuildingIcon, ShieldCheckIcon, CheckCircleIcon } from './Icons'

export default function LoginForm() {
  const { login } = useAuth()
  const state = useHealth()
  const connected = state === 'connected'

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
      {/* Left Column: Form */}
      <div className="login-form-side">
        <div className="login-card-inner">
          <div className="login-brand-header">
            <div className="login-logo-badge">
              <MoonLogoIcon size={24} />
            </div>
            <div>
              <span className="login-brand-name">BlueMoon</span>
              <span className="login-brand-tag">Quản lý thu phí chung cư</span>
            </div>
          </div>

          <div className="login-welcome-text">
            <h2>Đăng nhập tài khoản</h2>
            <p>Nhập thông tin xác thực để truy cập bảng điều khiển</p>
          </div>

          {errorMessage && (
            <div className="alert alert-error" role="alert">
              <span>⚠️</span>
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
                  placeholder="Ví dụ: admin"
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

            <div className="demo-credentials-box">
              <div className="demo-header">
                <span className="demo-dot" />
                <span>Tài khoản thử nghiệm (Demo)</span>
              </div>
              <p className="demo-desc">Đăng nhập nhanh với quyền Quản trị viên:</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-block"
                onClick={fillAdminCredentials}
              >
                ⚡ Tự động điền tài khoản Admin
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right Column: Hero / Features Showcase */}
      <div className="login-showcase-side">
        <div className="showcase-content">
          <div className="showcase-badge">
            <ShieldCheckIcon size={16} />
            <span>Nền tảng Quản trị Chung cư Thông minh</span>
          </div>

          <h2 className="showcase-title">
            Minh bạch thu phí, <br />
            quản trị cư trú toàn diện
          </h2>

          <p className="showcase-desc">
            BlueMoon cung cấp bộ công cụ tự động hóa toàn bộ quy trình từ quản lý căn hộ, lập kỳ thu, bảng kê hóa đơn đến đối soát dòng tiền và quỹ bảo trì.
          </p>

          <div className="showcase-features-list">
            <div className="showcase-feature-item">
              <div className="feature-item-icon">
                <BuildingIcon size={18} />
              </div>
              <div>
                <h4>Quản lý Cư trú & Căn hộ</h4>
                <p>Theo dõi nhân khẩu, chủ hộ, diện tích căn hộ và lịch sử biến động tạm trú/tạm vắng.</p>
              </div>
            </div>

            <div className="showcase-feature-item">
              <div className="feature-item-icon">
                <CheckCircleIcon size={18} />
              </div>
              <div>
                <h4>Tự động hóa Kỳ thu & Bảng kê</h4>
                <p>Lập bảng kê dịch vụ theo diện tích hoặc định mức, xuất biên lai và phiếu thu tức thì.</p>
              </div>
            </div>

            <div className="showcase-feature-item">
              <div className="feature-item-icon">
                <ShieldCheckIcon size={18} />
              </div>
              <div>
                <h4>Bảo mật & Phân quyền RBAC</h4>
                <p>Phân tách 5 vai trò hệ thống, mã hóa BCrypt hai lớp, an toàn dữ liệu tài chính.</p>
              </div>
            </div>
          </div>

          <div className="showcase-system-status">
            <div className="status-live-pill">
              <span className={`status-dot ${connected ? 'dot-pulse' : 'dot-danger'}`} />
              <span>{connected ? 'Hệ thống Backend & Database: Sẵn sàng' : 'Đang kiểm tra kết nối hệ thống…'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
