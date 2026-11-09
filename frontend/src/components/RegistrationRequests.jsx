import { useEffect, useState } from 'react'
import { approveRegistrationApi, getPendingRegistrationsApi, rejectRegistrationApi } from '../api/registrations'
import { getOpenHouseholdsApi } from '../api/households'
import { apiErrorMessage } from '../api/errors'
import { useModalDialog } from '../hooks/useModalDialog'

export default function RegistrationRequests({ onReviewed }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [review, setReview] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let ignore = false
    getPendingRegistrationsApi()
      .then((rows) => { if (!ignore) { setRequests(rows); setError('') } })
      .catch((err) => { if (!ignore) setError(apiErrorMessage(err, 'Không thể tải yêu cầu đăng ký.')) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [version])

  const finish = async (message) => {
    setReview(null)
    setNotice(message)
    setVersion((current) => current + 1)
    await onReviewed()
  }

  if (!loading && !error && requests.length === 0 && !notice) return null

  return (
    <section className="table-card registration-requests" aria-labelledby="registration-title">
      <h2 id="registration-title" className="section-title">Yêu cầu đăng ký chờ duyệt ({requests.length})</h2>
      {notice && <p className="alert alert-success" role="status">{notice}</p>}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {loading ? <p role="status">Đang tải yêu cầu đăng ký…</p> : requests.length > 0 && (
        <div tabIndex={0} role="region" aria-labelledby="registration-title" className="table-wrapper">
          <table className="modern-table">
            <thead>
              <tr>
                <th scope="col">Họ và tên</th>
                <th scope="col">Tên đăng nhập</th>
                <th scope="col">CCCD</th>
                <th scope="col">Căn hộ khai báo</th>
                <th scope="col">Điện thoại</th>
                <th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <th scope="row" className="row-header-th">{request.fullName}</th>
                  <td data-label="Tên đăng nhập">{request.username}</td>
                  <td data-label="CCCD">{request.identityNo}</td>
                  <td data-label="Căn hộ khai báo">{request.apartmentCode}</td>
                  <td data-label="Điện thoại">{request.phone || '—'}</td>
                  <td data-label="Thao tác">
                    <div className="account-row-actions">
                      <button type="button" className="action-btn action-btn-unlock" onClick={() => { setNotice(''); setReview({ request, action: 'approve' }) }}>Duyệt</button>
                      <button type="button" className="action-btn action-btn-lock" onClick={() => { setNotice(''); setReview({ request, action: 'reject' }) }}>Từ chối</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {review?.action === 'approve' && <ApproveDialog request={review.request} onClose={() => setReview(null)} onDone={finish} />}
      {review?.action === 'reject' && <RejectDialog request={review.request} onClose={() => setReview(null)} onDone={finish} />}
    </section>
  )
}

function ApproveDialog({ request, onClose, onDone }) {
  const [households, setHouseholds] = useState(null)
  const [householdId, setHouseholdId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useModalDialog(onClose, saving)

  useEffect(() => {
    let ignore = false
    getOpenHouseholdsApi()
      .then((rows) => { if (!ignore) setHouseholds(rows) })
      .catch((err) => { if (!ignore) { setHouseholds([]); setError(apiErrorMessage(err, 'Không thể tải danh sách hộ.')) } })
    return () => { ignore = true }
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (!householdId) return
    setSaving(true)
    setError('')
    try {
      await approveRegistrationApi(request.id, householdId)
      await onDone(`Đã duyệt và kích hoạt tài khoản "${request.username}".`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể duyệt yêu cầu.'))
      setSaving(false)
    }
  }

  return (
    <dialog ref={ref} className="native-modal-dialog account-edit-dialog" aria-labelledby="approve-title">
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="approve-title">Duyệt đăng ký</h2>
          <button type="button" className="modal-close" disabled={saving} onClick={onClose} aria-label="Đóng hộp thoại">&times;</button>
        </div>
        <form onSubmit={submit} className="modal-body modern-form" aria-busy={saving}>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          <p><strong>{request.fullName}</strong> khai báo căn hộ <strong>{request.apartmentCode}</strong> và sẽ trở thành chủ hộ của hộ được chọn.</p>
          {households === null ? <p role="status">Đang tải danh sách hộ…</p> : households.length === 0 && !error
            ? <p className="alert alert-info">Chưa có hộ nào đang mở. Cần tạo hộ gia đình trước khi duyệt.</p>
            : (
              <div className="form-group">
                <label htmlFor="approve-household">Hộ gia đình</label>
                <select id="approve-household" className="form-control" value={householdId} onChange={(event) => setHouseholdId(event.target.value)} disabled={saving} required>
                  <option value="">Chọn hộ…</option>
                  {households.map((household) => <option key={household.id} value={household.id}>{household.code}</option>)}
                </select>
              </div>
            )}
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !householdId}>{saving ? 'Đang duyệt…' : 'Duyệt và kích hoạt'}</button>
          </div>
        </form>
      </div>
    </dialog>
  )
}

function RejectDialog({ request, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useModalDialog(onClose, saving)

  const submit = async (event) => {
    event.preventDefault()
    if (!reason.trim()) return
    setSaving(true)
    setError('')
    try {
      await rejectRegistrationApi(request.id, reason.trim())
      await onDone(`Đã từ chối yêu cầu của "${request.username}".`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể từ chối yêu cầu.'))
      setSaving(false)
    }
  }

  return (
    <dialog ref={ref} className="native-modal-dialog account-edit-dialog" aria-labelledby="reject-title">
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="reject-title">Từ chối đăng ký</h2>
          <button type="button" className="modal-close" disabled={saving} onClick={onClose} aria-label="Đóng hộp thoại">&times;</button>
        </div>
        <form onSubmit={submit} className="modal-body modern-form" aria-busy={saving}>
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          <div className="form-group">
            <label htmlFor="reject-reason">Lý do từ chối yêu cầu của {request.fullName}</label>
            <textarea id="reject-reason" className="form-control" rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} required />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-danger" disabled={saving || !reason.trim()}>{saving ? 'Đang lưu…' : 'Từ chối'}</button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
