import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getHouseholdsApi, getHouseholdMembersApi, getResidentApi } from '../api/residents'
import { apiErrorMessage } from '../api/errors'
import ResidentTable from './ResidentTable'
import ResidentFormModal from './ResidentFormModal'
import ForbiddenView from './ForbiddenView'
import PageHeader from './PageHeader'
import FilterBar from './FilterBar'

export default function ResidentManagement() {
  const auth = useAuth()
  const buildingWide = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'AUTHORITY'].some(auth.hasRole)
  const allowed = buildingWide ? auth.hasPermission('resident.read') && auth.hasPermission('household.read')
    : auth.householdIds.some((householdId) => auth.hasPermission('resident.read', { householdId }) && auth.hasPermission('household.read', { householdId }))
  if (!allowed) return <ForbiddenView />
  // Remount and clear resident data whenever the session's grants or scope change.
  const scopeKey = JSON.stringify([auth.user.id, auth.permissions, auth.roles, auth.householdIds])
  return <Management key={scopeKey} buildingWide={buildingWide} />
}

function Management({ buildingWide }) {
  const { householdIds, hasPermission } = useAuth()
  const [householdResult, setHouseholdResult] = useState(null)
  const [selected, setSelected] = useState('')
  const [householdPage, setHouseholdPage] = useState(0)
  const [householdRetry, setHouseholdRetry] = useState(0)
  const [result, setResult] = useState({ residents: [], totalPages: 0, householdId: '', page: -1 })
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  const householdRequestKey = `${householdPage}-${householdRetry}`
  const householdCurrent = householdResult?.key === householdRequestKey
  const householdLoading = buildingWide && !householdCurrent
  const householdError = householdCurrent ? householdResult.error : ''
  const householdPages = householdCurrent ? householdResult.totalPages : 0
  const options = buildingWide ? (householdCurrent ? householdResult.content : []) : householdIds.map((id) => ({ id, code: id }))
  const householdId = options.some((item) => item.id === selected) ? selected : options[0]?.id || ''

  useEffect(() => {
    if (!buildingWide) return
    const controller = new AbortController()
    getHouseholdsApi(householdPage, controller.signal).then((data) => {
      if (!controller.signal.aborted) setHouseholdResult({ key: householdRequestKey, content: data.content, totalPages: data.totalPages, error: '' })
    }).catch((cause) => {
      if (!controller.signal.aborted) setHouseholdResult({ key: householdRequestKey, content: [], totalPages: 0, error: apiErrorMessage(cause, 'Không tải được hộ gia đình. Vui lòng thử lại.') })
    })
    return () => controller.abort()
  }, [buildingWide, householdPage, householdRequestKey])

  useEffect(() => {
    if (!householdId) return
    const controller = new AbortController()
    getHouseholdMembersApi(householdId, page, controller.signal).then(async (data) => {
      const residents = await Promise.all(data.content.map(async (member) => ({
        ...await getResidentApi(member.residentId, controller.signal), ...member, id: member.residentId, memberId: member.id,
      })))
      if (!controller.signal.aborted) setResult({ residents, totalPages: data.totalPages, householdId, page, refresh, error: '' })
    }).catch((cause) => {
      if (!controller.signal.aborted) setResult({ residents: [], totalPages: 0, householdId, page, refresh, error: apiErrorMessage(cause, 'Không tải được nhân khẩu. Vui lòng thử lại.') })
    })
    return () => controller.abort()
  }, [householdId, page, refresh])

  function changeHousehold(value) { setSelected(value); setPage(0); setModal(null); setNotice('') }
  const currentResult = result.householdId === householdId && result.page === page && result.refresh === refresh
  const loading = householdId && !currentResult
  const error = currentResult ? result.error : ''
  const writable = householdId && !options.find((item) => item.id === householdId)?.closedAt && hasPermission('resident.write') && hasPermission('household.write')
  return <section className="flex flex-col gap-6" aria-labelledby="residents-title">
    <PageHeader titleId="residents-title" title="Quản lý nhân khẩu căn hộ" description="Chọn hộ gia đình để xem và cập nhật thông tin thành viên."
      actions={writable && <button type="button" className="btn btn-primary" onClick={() => { setNotice(''); setModal({ resident: null }) }}>Thêm nhân khẩu</button>} />
    <FilterBar>
      <div className="household-select-field"><label htmlFor="resident-household">Hộ gia đình</label>
        <select id="resident-household" className="form-control block min-h-11 w-full" disabled={householdLoading} value={householdId} onChange={(event) => changeHousehold(event.target.value)}>
          {!options.length && <option value="">{householdLoading ? 'Đang tải…' : 'Chưa có hộ gia đình'}</option>}
          {options.map((item) => <option key={item.id} value={item.id}>{item.code}{item.closedAt ? ' (Đã đóng)' : ''}</option>)}
        </select>
      </div>
      {buildingWide && householdPages > 1 && <nav className="household-pagination" aria-label="Phân trang hộ gia đình">
        <button type="button" className="btn btn-outline" disabled={householdLoading || householdPage === 0} onClick={() => { changeHousehold(''); setHouseholdPage(householdPage - 1) }}>Hộ trước</button>
        <span>Trang hộ {householdPage + 1}/{householdPages}</span><button type="button" className="btn btn-outline" disabled={householdLoading || householdPage + 1 >= householdPages} onClick={() => { changeHousehold(''); setHouseholdPage(householdPage + 1) }}>Hộ tiếp</button>
      </nav>}
    </FilterBar>
    {householdError && <div role="alert"><p>{householdError}</p><button type="button" className="btn btn-outline" onClick={() => setHouseholdRetry(householdRetry + 1)}>Tải lại hộ gia đình</button></div>}
    {notice && <p className="alert alert-info" role="status">{notice}</p>}
    {loading && <p role="status">Đang tải nhân khẩu…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="btn btn-outline" onClick={() => setRefresh(refresh + 1)}>Tải lại nhân khẩu</button></div>}
    {!loading && !error && currentResult && <><ResidentTable residents={result.residents} householdId={householdId}
      onEdit={(resident) => { setNotice(''); setModal({ resident }) }} />
      {result.totalPages > 1 && <div className="resident-pagination"><button type="button" className="btn btn-outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Trước</button>
        <span>Trang {page + 1}/{result.totalPages}</span><button type="button" className="btn btn-outline" disabled={page + 1 >= result.totalPages} onClick={() => setPage(page + 1)}>Tiếp</button></div>}</>}
    {modal && <ResidentFormModal key={`${householdId}-${modal.resident?.id || 'new'}`} resident={modal.resident} householdId={householdId} onClose={() => setModal(null)}
      onSaved={() => { setModal(null); setNotice('Đã lưu thông tin nhân khẩu.'); setRefresh(refresh + 1) }} />}
  </section>
}
