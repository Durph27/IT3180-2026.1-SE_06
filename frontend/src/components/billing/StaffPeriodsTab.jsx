import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  closeBillingPeriodApi,
  createBillingPeriodApi,
  generateInvoicesApi,
  getBillingPeriodsApi,
  getInvoicesApi,
  updateBillingPeriodApi,
} from '../../api/billing'
import { getAllApartmentsApi } from '../../api/apartments'
import { apiErrorMessage } from '../../api/errors'
import { getFeeCatalogApi } from '../../api/fees'
import { getAllHouseholdsApi } from '../../api/households'
import { getAllOccupanciesApi } from '../../api/maintenance'
import { useAuth } from '../../hooks/useAuth'
import { useModalDialog } from '../../hooks/useModalDialog'
import { todayInVietnam } from '../../residents/validation.js'
import {
  addMonths, findPeriodForMonth, formatDay, formatMoney, generationWarnings, monthLabel, periodDefaultsForMonth,
  periodMonth, periodStatusLabel, previousPeriod, summarizeByHousehold, summarizeInvoices,
} from '../../utils/billingUtils'
import { AlertTriangleIcon, CheckCircleIcon, LockIcon, ReceiptIcon } from '../Icons'
import Pagination from '../Pagination'
import StatusBadge from '../StatusBadge'
import IssueConfirmDialog from './IssueConfirmDialog'
import { MONEY } from './ui'

const STATUS_TONE = { DRAFT: 'neutral', ISSUED: 'info', CLOSED: 'success' }
const HOUSEHOLD_PAGE = 20

const clampDate = (value, from, to) => (value < from ? from : value > to ? to : value)
const orEmpty = (allowed, load) => (allowed ? load() : Promise.resolve([]))

function CloseConfirmDialog({ period, onClose, onClosed }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useModalDialog(onClose, busy)
  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await closeBillingPeriodApi(period.id)
      onClosed(`Đã khóa sổ tháng ${monthLabel(periodMonth(period))}.`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không khóa sổ được. Vui lòng thử lại.'))
      setBusy(false)
    }
  }
  return (
    <dialog ref={ref} className="native-modal-dialog account-edit-dialog" aria-labelledby="close-period-title">
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="close-period-title">Khóa sổ tháng {monthLabel(periodMonth(period))}?</h2>
          <button type="button" className="modal-close" disabled={busy} onClick={onClose} aria-label="Đóng hộp thoại">&times;</button>
        </div>
        <div className="modal-body">
          {error && <p className="alert alert-error" role="alert">{error}</p>}
          <p>Số liệu của tháng này được chốt và không thay đổi nữa. Hộ còn nợ vẫn nộp được.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Hủy</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>{busy ? 'Đang khóa…' : 'Khóa sổ'}</button>
          </div>
        </div>
      </div>
    </dialog>
  )
}

function HouseholdTable({ rows }) {
  const [filter, setFilter] = useState('owing')
  const [page, setPage] = useState(0)
  const counts = { all: rows.length, owing: rows.filter((row) => !row.settled).length, settled: rows.filter((row) => row.settled).length }
  const shown = rows.filter((row) => filter === 'all' || (filter === 'owing' ? !row.settled : row.settled))
  const totalPages = Math.max(1, Math.ceil(shown.length / HOUSEHOLD_PAGE))
  const current = Math.min(page, totalPages - 1)
  const pick = (value) => { setFilter(value); setPage(0) }
  const chips = [['owing', 'Còn nợ'], ['settled', 'Đã đóng'], ['all', 'Tất cả']]
  return (
    <section className="table-card" aria-labelledby="household-collection-title">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <h3 id="household-collection-title" className="m-0 text-base font-semibold text-slate-900">Tình hình thu theo hộ</h3>
        <div className="filter-buttons-group" role="group" aria-label="Lọc theo tình trạng">
          {chips.map(([value, label]) => (
            <button key={value} type="button" className={`filter-btn ${filter === value ? 'active' : ''}`} aria-pressed={filter === value} onClick={() => pick(value)}>
              {label} ({counts[value]})
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-600">{filter === 'owing' ? 'Tất cả các hộ đã đóng đủ.' : 'Không có hộ nào.'}</p>
      ) : (
        <div tabIndex={0} role="region" aria-labelledby="household-collection-title" className="table-wrapper">
          <table className="modern-table">
            <thead>
              <tr>
                <th scope="col">Hộ / Căn hộ</th>
                <th scope="col" className={MONEY}>Tổng</th>
                <th scope="col" className={MONEY}>Đã đóng</th>
                <th scope="col" className={MONEY}>Còn nợ</th>
                <th scope="col">Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(current * HOUSEHOLD_PAGE, (current + 1) * HOUSEHOLD_PAGE).map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="row-header-th">
                    {row.apartmentCodes.join(', ') || '—'}
                    {row.householdCode && <span className="block text-xs font-normal text-slate-500">Hộ {row.householdCode}</span>}
                  </th>
                  <td data-label="Tổng" className={MONEY}>{formatMoney(row.total)}</td>
                  <td data-label="Đã đóng" className={MONEY}>{formatMoney(row.paid)}</td>
                  <td data-label="Còn nợ" className={`${MONEY} ${row.settled ? '' : 'font-semibold text-red-700'}`}>{formatMoney(row.outstanding)}</td>
                  <td data-label="Tình trạng">{row.settled ? <StatusBadge tone="success">Đã đóng</StatusBadge> : <StatusBadge tone="warning">Còn nợ</StatusBadge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={current} totalPages={totalPages} totalElements={shown.length} unit="hộ" onPageChange={setPage} />
    </section>
  )
}

/**
 * Monthly billing for staff. One button computes the month's bills (creating the period and
 * generating invoices behind the scenes), one dialog reviews and sends them. Drafts never show.
 */
export default function StaffPeriodsTab({ onOpenFees }) {
  const { hasPermission } = useAuth()
  const can = {
    create: hasPermission('billing-period.write') && hasPermission('invoice.generate') && hasPermission('billing-period.issue'),
    close: hasPermission('billing-period.close'),
    fees: hasPermission('fee-type.read') && hasPermission('fee-rate.read'),
    occupancies: hasPermission('occupancy.read'),
    apartments: hasPermission('apartment.read'),
    households: hasPermission('household.read'),
  }
  const today = todayInVietnam()
  const thisMonth = today.slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [preparing, setPreparing] = useState(false)
  const [review, setReview] = useState(null) // { period, invoices }
  const [closing, setClosing] = useState(null)
  const [success, setSuccess] = useState('')

  const reload = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([
      getBillingPeriodsApi(signal),
      getInvoicesApi({}, signal),
      can.fees ? getFeeCatalogApi({ signal }) : Promise.resolve({ feeTypes: [], ratesByFeeType: {} }),
      orEmpty(can.occupancies, () => getAllOccupanciesApi(signal)),
      orEmpty(can.apartments, () => getAllApartmentsApi({ signal })),
      orEmpty(can.households, () => getAllHouseholdsApi(signal)),
    ]).then(([periods, invoices, catalog, occupancies, apartments, households]) => {
      if (signal.aborted) return
      setData({ periods, invoices, ...catalog, occupancies, apartments, households })
      setError('')
    }).catch((err) => {
      if (!signal.aborted) setError(apiErrorMessage(err, 'Không tải được danh sách đợt thu.'))
    })
    return () => controller.abort()
  }, [revision, can.fees, can.occupancies, can.apartments, can.households])

  useEffect(() => {
    if (!success) return undefined
    const timer = setTimeout(() => setSuccess(''), 6000)
    return () => clearTimeout(timer)
  }, [success])

  const invoicesByPeriod = useMemo(() => {
    const grouped = new Map()
    for (const invoice of data?.invoices ?? []) {
      if (!grouped.has(invoice.periodId)) grouped.set(invoice.periodId, [])
      grouped.get(invoice.periodId).push(invoice)
    }
    return grouped
  }, [data])

  const lookups = data ? { occupancies: data.occupancies, apartments: data.apartments, households: data.households } : {}
  const apartmentCodeOf = (occupancy) => data?.apartments.find((apartment) => apartment.id === occupancy.apartmentId)?.code ?? 'Căn chưa rõ mã'
  const period = data ? findPeriodForMonth(data.periods, month) : null
  const sent = period && period.status !== 'DRAFT'
  const periodInvoices = sent ? invoicesByPeriod.get(period.id) ?? [] : []
  const summary = summarizeInvoices(periodInvoices)
  const householdRows = sent ? summarizeByHousehold(periodInvoices, lookups) : []
  const pastPeriods = (data?.periods ?? [])
    .filter((row) => row.status !== 'DRAFT' && row.id !== period?.id)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
  const monthOptions = [1, 0, -1, -2, -3].map((offset) => addMonths(thisMonth, offset))
  if (!monthOptions.includes(month)) monthOptions.push(month)

  // Creates or reuses the month's period with today's snapshot, then computes its bills.
  const prepare = async () => {
    setPreparing(true)
    setError('')
    try {
      const defaults = periodDefaultsForMonth(month, today)
      let target = findPeriodForMonth(data.periods, month)
      if (!target) {
        try {
          target = (await createBillingPeriodApi(defaults)).data
        } catch (err) {
          if (err.response?.status !== 409) throw err
          target = findPeriodForMonth(await getBillingPeriodsApi(), month)
          if (!target) throw err
        }
      }
      if (target.status !== 'DRAFT') {
        reload()
        return
      }
      const snapshotDate = clampDate(today, target.startDate, target.endDate)
      if (target.snapshotDate !== snapshotDate) target = (await updateBillingPeriodApi(target.id, { snapshotDate })).data
      await generateInvoicesApi(target.id)
      const invoices = await getInvoicesApi({ periodId: target.id })
      setReview({ period: target, invoices })
    } catch (err) {
      setError(apiErrorMessage(err, 'Không lập được phiếu thu. Vui lòng thử lại.'))
    } finally {
      setPreparing(false)
    }
  }

  const previous = review && data ? previousPeriod(data.periods, review.period) : null

  return (
    <div className="flex flex-col gap-6">
      {success && (
        <div className="alert alert-success" role="status">
          <CheckCircleIcon size={18} className="shrink-0" />
          <div>{success}</div>
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangleIcon size={18} className="shrink-0" />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={reload}>Tải lại</button>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-solid border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="current-period-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="current-period-title" className="m-0 text-lg font-semibold text-slate-900">Tháng</h2>
            <label htmlFor="billing-month" className="sr-only">Chọn tháng</label>
            <select id="billing-month" className="form-control min-h-10 w-auto" value={month} onChange={(event) => setMonth(event.target.value)}>
              {monthOptions.sort().reverse().map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}
            </select>
            {sent && <StatusBadge tone={STATUS_TONE[period.status]}>{periodStatusLabel(period.status)}</StatusBadge>}
          </div>
          {sent && period.status === 'ISSUED' && can.close && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setClosing(period)}>
              <LockIcon size={14} />
              <span>Khóa sổ</span>
            </button>
          )}
        </div>

        {data === null && !error && <p role="status" className="mt-4 mb-0 text-sm text-slate-600">Đang tải…</p>}

        {data && !sent && (
          <div className="mt-4 flex flex-col items-start gap-2">
            <p className="m-0 text-sm text-slate-600">Chưa gửi phiếu thu cho tháng {monthLabel(month)}.</p>
            {can.create ? (
              <button type="button" className="btn btn-primary" onClick={prepare} disabled={preparing}>
                <ReceiptIcon size={16} />
                <span>{preparing ? 'Đang tính tiền…' : `Lập phiếu thu tháng ${monthLabel(month)}`}</span>
              </button>
            ) : (
              <p className="m-0 text-sm text-slate-500">Bạn không có quyền lập phiếu thu.</p>
            )}
          </div>
        )}

        {sent && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="m-0 text-sm text-slate-600">Hạn nộp <strong>{formatDay(period.dueDate)}</strong> · Số người, số xe tính tại {formatDay(period.snapshotDate)}</p>
            <p className="m-0 text-2xl font-bold tabular-nums text-slate-900">
              {formatMoney(summary.paid)} <span className="text-base font-normal text-slate-500">/ {formatMoney(summary.total)} đã thu ({summary.percentPaid}%)</span>
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Tỷ lệ đã thu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.percentPaid}>
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${summary.percentPaid}%` }} />
            </div>
            <p className="m-0 text-sm text-slate-600">{summary.paidCount}/{summary.count} căn đã đóng đủ · còn nợ {formatMoney(summary.outstanding)}</p>
          </div>
        )}
      </section>

      {sent && <HouseholdTable key={period.id} rows={householdRows} />}

      {pastPeriods.length > 0 && (
        <section className="table-card" aria-labelledby="past-periods-title">
          <h3 id="past-periods-title" className="m-0 px-4 pt-4 text-base font-semibold text-slate-900">Các tháng khác</h3>
          <ul className="m-0 list-none p-0">
            {pastPeriods.map((row) => {
              const rowSummary = summarizeInvoices(invoicesByPeriod.get(row.id) ?? [])
              return (
                <li key={row.id} className="border-0 border-t border-solid border-slate-100 first:border-t-0">
                  <button type="button" className="flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 border-0 bg-transparent px-4 py-3 text-left hover:bg-slate-50" onClick={() => setMonth(periodMonth(row))}>
                    <span className="w-20 font-semibold text-slate-900">{monthLabel(periodMonth(row))}</span>
                    <StatusBadge tone={STATUS_TONE[row.status]}>{periodStatusLabel(row.status)}</StatusBadge>
                    <span className="text-sm text-slate-600">{rowSummary.percentPaid}% đã thu</span>
                    {rowSummary.outstanding > 0n && <span className="text-sm font-semibold text-red-700">còn nợ {formatMoney(rowSummary.outstanding)}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {review && (
        <IssueConfirmDialog
          period={review.period}
          summary={summarizeInvoices(review.invoices)}
          previousSummary={previous ? summarizeInvoices(invoicesByPeriod.get(previous.id) ?? []) : null}
          warnings={generationWarnings({ ...data, invoices: review.invoices, snapshotDate: review.period.snapshotDate })}
          apartmentCodeOf={apartmentCodeOf}
          onClose={() => { setReview(null); reload() }}
          onOpenFees={onOpenFees}
          onIssued={(message) => { setReview(null); setSuccess(message); reload() }}
        />
      )}
      {closing && (
        <CloseConfirmDialog
          period={closing}
          onClose={() => setClosing(null)}
          onClosed={(message) => { setClosing(null); setSuccess(message); reload() }}
        />
      )}
    </div>
  )
}
