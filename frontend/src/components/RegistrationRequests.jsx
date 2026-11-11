import { useEffect, useMemo, useState } from 'react'
import { approveRegistrationApi, getPendingRegistrationsApi, rejectRegistrationApi } from '../api/registrations'
import { getActiveOccupanciesApi, getAllHouseholdsApi, getHouseholdMembersApi, placeHouseholdApi } from '../api/households'
import { getAllApartmentsApi, getAllBuildingsApi } from '../api/apartments'
import { activeMembers } from './personOptions'
import { todayInVietnam } from '../residents/validation'
import { approvalPlacement, findApartmentByCode, householdCodeError, occupancyByApartment, suggestHouseholdCode } from '../utils/householdLinks'
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
  const [directory, setDirectory] = useState(null)
  const [version, setVersion] = useState(0)
  const [pickedApartmentId, setPickedApartmentId] = useState(null)
  const [codeDrafts, setCodeDrafts] = useState({})
  const [headCheck, setHeadCheck] = useState({ householdId: null, hasHead: undefined })
  const [pendingHousehold, setPendingHousehold] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useModalDialog(onClose, saving)
  const today = todayInVietnam()

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([getAllApartmentsApi({ signal }), getAllBuildingsApi({ signal }), getActiveOccupanciesApi(today, signal), getAllHouseholdsApi(signal)])
      .then(([apartments, buildings, occupancies, households]) => {
        if (!signal.aborted) setDirectory({ apartments, buildings, occupancies, households })
      })
      .catch((err) => {
        if (!signal.aborted) { setDirectory({ apartments: [], buildings: [], occupancies: [], households: [] }); setError(apiErrorMessage(err, 'Không thể tải danh sách căn hộ và hộ gia đình.')) }
      })
    return () => controller.abort()
  }, [today, version])

  const occupancies = useMemo(() => occupancyByApartment(directory?.occupancies ?? [], today), [directory, today])
  const households = useMemo(() => new Map((directory?.households ?? []).map((household) => [household.id, household])), [directory])
  const buildings = useMemo(() => new Map((directory?.buildings ?? []).map((building) => [building.id, building])), [directory])
  const declared = directory ? findApartmentByCode(directory.apartments, request.apartmentCode) : null
  const apartmentId = pickedApartmentId ?? declared?.id ?? ''
  const apartment = directory?.apartments.find((item) => item.id === apartmentId) ?? null
  const occupancy = apartment ? occupancies.get(apartment.id) : undefined
  const occupyingHousehold = occupancy ? households.get(occupancy.householdId) : null
  const takenCodes = (directory?.households ?? []).map((household) => household.code)
  const code = apartment ? codeDrafts[apartment.id] ?? suggestHouseholdCode(apartment.code, takenCodes) : ''
  const pendingId = pendingHousehold && apartment && pendingHousehold.apartmentId === apartment.id ? pendingHousehold.householdId : null
  const codeError = pendingId ? '' : householdCodeError(code, takenCodes)
  const placement = approvalPlacement({ apartment, occupancy, hasHead: headCheck.householdId === occupancy?.householdId ? headCheck.hasHead : undefined })

  useEffect(() => {
    if (!occupancy) return undefined
    const controller = new AbortController()
    getHouseholdMembersApi(occupancy.householdId, controller.signal)
      .then((rows) => { if (!controller.signal.aborted) setHeadCheck({ householdId: occupancy.householdId, hasHead: activeMembers(rows, today).some((member) => member.isHead) }) })
      .catch((err) => { if (!controller.signal.aborted) setError(apiErrorMessage(err, 'Không thể kiểm tra chủ hộ của hộ đang ở căn này.')) })
    return () => controller.abort()
  }, [occupancy, today])

  const apartmentLabel = (item) => {
    const building = buildings.get(item.buildingId)
    const current = occupancies.get(item.id)
    const state = item.status === 'INACTIVE' ? 'Tạm ngưng' : current ? `Hộ ${households.get(current.householdId)?.code ?? 'đang ở'}` : 'Còn trống'
    return `${item.code}${building ? ` · ${building.name}` : ''} — ${state}`
  }
  const canSubmit = !saving && (placement === 'open' || (placement === 'vacant' && !codeError))

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      const householdId = placement === 'open'
        ? occupancy.householdId
        : await placeHouseholdApi({
          householdId: pendingId,
          code,
          apartmentId: apartment.id,
          validFrom: today,
          onHouseholdCreated: (id) => setPendingHousehold({ apartmentId: apartment.id, householdId: id }),
        })
      await approveRegistrationApi(request.id, householdId)
      await onDone(`Đã duyệt và kích hoạt tài khoản "${request.username}" tại căn ${apartment.code}.`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể duyệt yêu cầu.'))
      setSaving(false)
      // A step may have succeeded before the failure; reload so a retry continues from the real state.
      setVersion((value) => value + 1)
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
          <p><strong>{request.fullName}</strong> khai báo căn hộ <strong>{request.apartmentCode}</strong> và sẽ trở thành chủ hộ của hộ ở căn được chọn.</p>
          {directory === null ? <p role="status">Đang tải danh sách căn hộ…</p> : (
            <>
              {!declared && <p className="alert alert-info"><span>Căn hộ khai báo "{request.apartmentCode}" chưa có trong hệ thống. Tạo căn hộ ở trang Căn hộ, hoặc chọn căn khác nếu cư dân khai sai mã.</span></p>}
              <div className="form-group">
                <label htmlFor="approve-apartment">Căn hộ</label>
                <select id="approve-apartment" className="form-control" value={apartmentId} onChange={(event) => { setPickedApartmentId(event.target.value); setError('') }} disabled={saving} required>
                  <option value="">Chọn căn hộ…</option>
                  {directory.apartments.map((item) => <option key={item.id} value={item.id} disabled={item.status === 'INACTIVE'}>{apartmentLabel(item)}</option>)}
                </select>
                {declared && apartment && apartment.id !== declared.id && <span className="field-hint">Căn được chọn khác căn {declared.code} mà cư dân khai báo.</span>}
              </div>
              {placement === 'vacant' && (
                <div className="form-group">
                  <label htmlFor="approve-household-code">Mã hộ mới</label>
                  <input id="approve-household-code" className="form-control" maxLength={30} value={code} onChange={(event) => setCodeDrafts((drafts) => ({ ...drafts, [apartment.id]: event.target.value }))} disabled={saving || Boolean(pendingId)} aria-invalid={Boolean(codeError)} aria-describedby="approve-household-hint" />
                  <span id="approve-household-hint" className={codeError ? 'field-hint text-danger' : 'field-hint'}>
                    {codeError || 'Căn còn trống: hệ thống sẽ tạo hộ mới, gắn vào căn từ hôm nay rồi đặt người đăng ký làm chủ hộ.'}
                  </span>
                </div>
              )}
              {placement === 'checking' && <p role="status">Đang kiểm tra hộ đang ở căn này…</p>}
              {placement === 'open' && <p className="alert alert-info"><span>Hộ <strong>{occupyingHousehold?.code}</strong> đang ở căn này và chưa có chủ hộ. {request.fullName} sẽ trở thành chủ hộ.</span></p>}
              {placement === 'headed' && <p className="alert alert-error"><span>Hộ <strong>{occupyingHousehold?.code}</strong> đang ở căn này đã có chủ hộ. Người đăng ký luôn trở thành chủ hộ nên không thể duyệt vào hộ này. Nếu đây là thành viên của hộ, hãy từ chối yêu cầu để chủ hộ tự thêm ở trang Hộ gia đình.</span></p>}
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>{saving ? 'Đang duyệt…' : 'Duyệt và kích hoạt'}</button>
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
