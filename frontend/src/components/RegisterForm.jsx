import { useState } from 'react'
import { registerApi } from '../api/auth'
import { apiErrorMessage } from '../api/errors'
import { MoonLogoIcon } from './Icons'
import { GENDERS, registrationError } from './personOptions'
import { todayInVietnam } from '../residents/validation'

const EMPTY = {
  fullName: '', birthDate: '', gender: 'UNSPECIFIED', identityNo: '', phone: '',
  apartmentCode: '', username: '', password: '', confirmPassword: '',
}

export default function RegisterForm({ onBackToLogin }) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    const problem = registrationError(form)
    setError(problem)
    if (problem) return
    setSaving(true)
    try {
      await registerApi(form)
      setForm(EMPTY)
      setSubmitted(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể gửi đăng ký. Vui lòng thử lại.'))
    } finally {
      setSaving(false)
    }
  }

  const field = (name, label, props = {}) => (
    <div className="form-group">
      <label htmlFor={`register-${name}`}>{label}</label>
      <input id={`register-${name}`} name={name} className="form-control" value={form[name]} onChange={update} disabled={saving} required {...props} />
    </div>
  )

  return (
    <div className="login-split-wrapper register-wrapper">
      <div className="login-form-side">
        <div className="login-card-inner">
          <div className="login-brand-header">
            <div className="login-logo-badge"><MoonLogoIcon size={24} /></div>
            <div>
              <span className="login-brand-name">BlueMoon</span>
              <span className="login-brand-tag">Quản lý thu phí chung cư</span>
            </div>
          </div>

          {submitted ? (
            <>
              <div className="login-welcome-text">
                <h2>Đã gửi đăng ký</h2>
                <p>Tài khoản sẽ dùng được sau khi Ban quản trị hoặc Admin duyệt và gắn bạn vào hộ gia đình.</p>
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={onBackToLogin}>Quay lại đăng nhập</button>
            </>
          ) : (
            <>
              <div className="login-welcome-text">
                <h2>Đăng ký tài khoản cư dân</h2>
                <p>Dành cho chủ hộ. Người trong gia đình được chủ hộ thêm sau và không cần tài khoản riêng.</p>
              </div>
              {error && <div className="alert alert-error" role="alert"><div>{error}</div></div>}
              <form onSubmit={submit} className="modern-form" aria-busy={saving}>
                <div className="form-grid-2">
                  {field('fullName', 'Họ và tên', { maxLength: 120, autoComplete: 'name' })}
                  {field('identityNo', 'Số CCCD', { maxLength: 12, inputMode: 'numeric', pattern: '[0-9]{12}', title: 'CCCD gồm đúng 12 chữ số', placeholder: '12 chữ số' })}
                  {field('birthDate', 'Ngày sinh', { type: 'date', max: todayInVietnam() })}
                  <div className="form-group">
                    <label htmlFor="register-gender">Giới tính</label>
                    <select id="register-gender" name="gender" className="form-control" value={form.gender} onChange={update} disabled={saving}>
                      {GENDERS.map((gender) => <option key={gender.value} value={gender.value}>{gender.label}</option>)}
                    </select>
                  </div>
                  {field('phone', 'Số điện thoại', { type: 'tel', maxLength: 10, inputMode: 'numeric', pattern: '[0-9]{10}', title: 'Số điện thoại gồm đúng 10 chữ số', autoComplete: 'tel', placeholder: '10 chữ số' })}
                  {field('apartmentCode', 'Mã căn hộ', { maxLength: 30, placeholder: 'Ví dụ: A-101' })}
                  {field('username', 'Tên đăng nhập', { maxLength: 60, autoComplete: 'username', spellCheck: 'false', autoCapitalize: 'none', placeholder: 'Không dấu, ví dụ: nguyenvana' })}
                  <div aria-hidden="true" />
                  {field('password', 'Mật khẩu', { type: 'password', minLength: 12, maxLength: 128, autoComplete: 'new-password' })}
                  {field('confirmPassword', 'Nhập lại mật khẩu', { type: 'password', autoComplete: 'new-password' })}
                </div>
                <button type="submit" className="btn btn-primary btn-block" disabled={saving}>{saving ? 'Đang gửi…' : 'Gửi đăng ký'}</button>
              </form>
              <p className="login-switch">Đã có tài khoản? <button type="button" className="link-button" disabled={saving} onClick={onBackToLogin}>Đăng nhập</button></p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
