import { useState } from 'react'
import { registerApi } from '../api/auth'
import { apiErrorMessage } from '../api/errors'
import { MoonLogoIcon } from './Icons'
import { registrationError } from './personOptions'

const EMPTY = { identityNo: '', phone: '', password: '', confirmPassword: '' }
const DIGITS_ONLY = new Set(['identityNo', 'phone'])

// Residents are entered by the management board beforehand; registering claims that record with the CCCD and phone on file.
export default function RegisterForm({ onBackToLogin }) {
  const [form, setForm] = useState(EMPTY)
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdFor, setCreatedFor] = useState('')
  const update = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: DIGITS_ONLY.has(name) ? value.replace(/\D/g, '') : value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    const problem = registrationError(form)
    setError(problem)
    if (problem) return
    setSaving(true)
    try {
      await registerApi(form)
      setCreatedFor(form.identityNo)
      setForm(EMPTY)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể tạo tài khoản. Vui lòng thử lại.'))
    } finally {
      setSaving(false)
    }
  }

  const passwordType = showPassword ? 'text' : 'password'

  return (
    <div className="login-split-wrapper register-wrapper max-w-[480px]!">
      <div className="login-form-side">
        <div className="login-card-inner">
          <div className="login-brand-header">
            <div className="login-logo-badge"><MoonLogoIcon size={24} /></div>
            <div>
              <span className="login-brand-name">BlueMoon</span>
              <span className="login-brand-tag">Quản lý thu phí chung cư</span>
            </div>
          </div>

          {createdFor ? (
            <>
              <div className="login-welcome-text" role="status">
                <h2>Đã tạo tài khoản</h2>
                <p>Đăng nhập bằng số CCCD <strong>{createdFor}</strong> và mật khẩu vừa đặt.</p>
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={onBackToLogin}>Đến trang đăng nhập</button>
            </>
          ) : (
            <>
              <div className="login-welcome-text">
                <h2>Tạo tài khoản cư dân</h2>
                <p>Hồ sơ cư dân đã được Ban quản trị lưu sẵn. Nhập số CCCD và số điện thoại trong hồ sơ, rồi đặt mật khẩu. Số CCCD sẽ là tên đăng nhập.</p>
              </div>
              {error && <div className="alert alert-error" role="alert"><div>{error}</div></div>}
              <form onSubmit={submit} className="modern-form" aria-busy={saving}>
                <div className="form-group">
                  <label htmlFor="register-identityNo">Số CCCD</label>
                  <input
                    id="register-identityNo" name="identityNo" className="form-control" value={form.identityNo} onChange={update} disabled={saving} required autoFocus
                    maxLength={12} inputMode="numeric" pattern="[0-9]{12}" title="CCCD gồm đúng 12 chữ số" placeholder="12 chữ số"
                    autoComplete="username"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="register-phone">Số điện thoại</label>
                  <input
                    id="register-phone" name="phone" type="tel" className="form-control" value={form.phone} onChange={update} disabled={saving} required
                    maxLength={10} inputMode="numeric" pattern="[0-9]{10}" title="Số điện thoại gồm đúng 10 chữ số" placeholder="10 chữ số"
                    autoComplete="tel" aria-describedby="register-phone-hint"
                  />
                  <span id="register-phone-hint" className="field-hint">Dùng số đã khai với Ban quản trị. Nếu đã đổi số, hãy liên hệ Ban quản trị để cập nhật hồ sơ.</span>
                </div>
                <div className="form-group">
                  <label htmlFor="register-password">Mật khẩu</label>
                  <div className="relative flex items-center">
                    <input
                      id="register-password" name="password" type={passwordType} className="form-control input-has-toggle" value={form.password} onChange={update} disabled={saving} required
                      minLength={12} maxLength={128} autoComplete="new-password" aria-describedby="register-password-hint"
                    />
                    <button
                      type="button" className="btn-toggle-password" onClick={() => setShowPassword((value) => !value)}
                      aria-pressed={showPassword} aria-controls="register-password register-confirmPassword" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? 'Ẩn' : 'Hiện'}
                    </button>
                  </div>
                  <span id="register-password-hint" className="field-hint">Ít nhất 12 ký tự.</span>
                </div>
                <div className="form-group">
                  <label htmlFor="register-confirmPassword">Nhập lại mật khẩu</label>
                  <input
                    id="register-confirmPassword" name="confirmPassword" type={passwordType} className="form-control" value={form.confirmPassword} onChange={update} disabled={saving} required
                    maxLength={128} autoComplete="new-password"
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-block" disabled={saving}>{saving ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</button>
              </form>
              <p className="login-switch">Đã có tài khoản? <button type="button" className="link-button" disabled={saving} onClick={onBackToLogin}>Đăng nhập</button></p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
