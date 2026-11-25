import { useId, useState } from 'react'
import { useModalDialog } from '../../hooks/useModalDialog'
import { formatMoney, monthLabel, toCents } from '../../utils/billingUtils'
import { ALLOCATION_FILTERS, filterRoundAllocations } from '../../utils/maintenanceUtils'
import Pagination from '../Pagination'
import StatusBadge from '../StatusBadge'

const PAGE_SIZE = 20
const MONEY = 'text-right! tabular-nums whitespace-nowrap'
const CHIPS = [[ALLOCATION_FILTERS.UNPAID, 'Chưa nộp'], [ALLOCATION_FILTERS.PAID, 'Đã nộp'], [ALLOCATION_FILTERS.ALL, 'Tất cả']]

/** Apartments of one round, opening on those still owing, so follow-up calls are one click away. */
export default function RoundApartmentsDialog({ round, onClose }) {
  const titleId = useId()
  const ref = useModalDialog(onClose, false)
  const [status, setStatus] = useState(ALLOCATION_FILTERS.UNPAID)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const allocations = round.allocations ?? []
  const rows = filterRoundAllocations(allocations, { status, search })
  const count = (value) => filterRoundAllocations(allocations, { status: value }).length
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, totalPages - 1)
  const change = (update) => { update(); setPage(0) }

  return (
    <dialog ref={ref} className="native-modal-dialog account-edit-dialog" aria-labelledby={titleId}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 id={titleId}>{round.description} · tháng {monthLabel(String(round.snapshotDate).slice(0, 7))}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng hộp thoại">&times;</button>
        </div>
        <div className="modal-body">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="filter-buttons-group" role="group" aria-label="Lọc theo tình trạng nộp">
              {CHIPS.map(([value, label]) => (
                <button key={value} type="button" className={`filter-btn ${status === value ? 'active' : ''}`} aria-pressed={status === value} onClick={() => change(() => setStatus(value))}>
                  {label} ({count(value)})
                </button>
              ))}
            </div>
            <input type="search" className="form-control max-w-56" placeholder="Tìm căn hoặc mã hộ" aria-label="Tìm căn hoặc mã hộ" value={search} onChange={(event) => change(() => setSearch(event.target.value))} />
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-600">{status === ALLOCATION_FILTERS.UNPAID && !search ? 'Tất cả các căn đã nộp đủ.' : 'Không có căn nào phù hợp.'}</p>
          ) : (
            <div className="table-wrapper">
              <table className="modern-table">
                <caption className="sr-only">Các căn của đợt thu</caption>
                <thead>
                  <tr>
                    <th scope="col">Căn</th>
                    <th scope="col">Hộ</th>
                    <th scope="col" className={MONEY}>Phải nộp</th>
                    <th scope="col" className={MONEY}>Đã nộp</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((row) => {
                    const due = row.allocatedCents ?? toCents(row.amount)
                    return (
                      <tr key={row.id}>
                        <th scope="row" className="row-header-th">{row.apartmentLabel}</th>
                        <td data-label="Hộ">{row.householdCode}</td>
                        <td data-label="Phải nộp" className={MONEY}>{formatMoney(due)}</td>
                        <td data-label="Đã nộp" className={MONEY}>
                          {row.collectedCents === null || row.collectedCents === undefined
                            ? <StatusBadge tone={row.status?.tone}>{row.status?.label}</StatusBadge>
                            : <span className={row.collectedCents >= due ? 'text-emerald-700' : 'text-slate-700'}>{formatMoney(row.collectedCents)}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={current} totalPages={totalPages} totalElements={rows.length} unit="căn" onPageChange={setPage} />
        </div>
      </div>
    </dialog>
  )
}
