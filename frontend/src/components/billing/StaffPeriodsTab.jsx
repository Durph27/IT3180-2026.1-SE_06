import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  cancelInvoiceApi,
  closeBillingPeriodApi,
  createBillingPeriodApi,
  deleteInvoiceLineApi,
  generateInvoicesApi,
  getBillingPeriodsApi,
  getInvoicesApi,
  updateBillingPeriodApi,
} from '../../api/billing'
import { getAllApartmentsApi } from '../../api/apartments'
import { apiErrorMessage } from '../../api/errors'
import { getFeeCatalogApi } from '../../api/fees'
import { getAllHouseholdsApi } from '../../api/households'
import { getAllOccupanciesApi, getMaintenanceFundsApi, getMaintenanceRoundsApi } from '../../api/maintenance'
import { useAuth } from '../../hooks/useAuth'
import { ROUTES } from '../../routes'
import { useModalDialog } from '../../hooks/useModalDialog'
import { todayInVietnam } from '../../residents/validation.js'
import {
  addMonths, canCreateBilling, findPeriodForMonth, formatDay, formatMoney, generationWarnings, monthLabel,
  occupancyLookups, periodDefaultsForMonth, periodMonth, periodStatusLabel, previousPeriod, reconcileInvoices,
  summarizeInvoices,
} from '../../utils/billingUtils'
import AccountingReconciliation from '../AccountingReconciliation'
import AddInvoiceLineModal from '../AddInvoiceLineModal'
import CancelInvoiceModal from '../CancelInvoiceModal'
import { AlertTriangleIcon, CheckCircleIcon, LockIcon, ReceiptIcon } from '../Icons'
import InvoiceListTable from '../InvoiceListTable'
import ReceiptModal from '../ReceiptModal'
import RecordPaymentModal from '../RecordPaymentModal'
import StatusBadge from '../StatusBadge'
import IssueConfirmDialog from './IssueConfirmDialog'

const STATUS_TONE = { DRAFT: 'neutral', ISSUED: 'info', CLOSED: 'success' }

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

function ReconciliationPanel({ invoices, period, lookups }) {
  return (
    <details className="table-card">
      <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-700">Đối chiếu kế toán</summary>
      <div className="p-4 pt-0">
        <AccountingReconciliation reconciliation={reconcileInvoices(invoices, period)} apartmentMap={lookups.apartmentMap} householdMap={lookups.householdMap} />
      </div>
    </details>
  )
}

/**
 * Monthly billing for staff. One button computes the month's bills (creating the period and
 * generating invoices behind the scenes), one dialog reviews and sends them. Drafts stay hidden
 * unless the accountant chooses to review and edit individual bills before sending.
 */
export default function StaffPeriodsTab({ onOpenFees }) {
  const { hasPermission } = useAuth()
  const can = {
    create: canCreateBilling(hasPermission),
    close: hasPermission('billing-period.close'),
    fees: hasPermission('fee-type.read') && hasPermission('fee-rate.read'),
    occupancies: hasPermission('occupancy.read'),
    apartments: hasPermission('apartment.read'),
    households: hasPermission('household.read'),
    maintenance: hasPermission('maintenance-fund.read') && hasPermission('maintenance-round.read'),
    recordPayment: hasPermission('payment.record'),
    writeInvoice: hasPermission('invoice.write'),
    cancelInvoice: hasPermission('invoice.cancel') || hasPermission('invoice.write'),
  }
  const today = todayInVietnam()
  const thisMonth = today.slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [preparing, setPreparing] = useState(false)
  const [review, setReview] = useState(null) // { period, invoices }
  const [reviewingId, setReviewingId] = useState(null) // draft period being edited bill by bill
  const [closing, setClosing] = useState(null)
  const [paying, setPaying] = useState(null) // { invoice, householdId }
  const [receipt, setReceipt] = useState(null) // { receipt, payment }
  const [lineInvoice, setLineInvoice] = useState(null)
  const [cancelling, setCancelling] = useState(null) // { invoice, busy }
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
      orEmpty(can.maintenance, () => getMaintenanceFundsApi(signal)),
      orEmpty(can.maintenance, () => getMaintenanceRoundsApi({}, signal)),
    ]).then(([periods, invoices, catalog, occupancies, apartments, households, maintenanceFunds, maintenanceRounds]) => {
      if (signal.aborted) return
      setData({ periods, invoices, ...catalog, occupancies, apartments, households, maintenanceFunds, maintenanceRounds })
      setError('')
    }).catch((err) => {
      if (!signal.aborted) setError(apiErrorMessage(err, 'Không tải được danh sách đợt thu.'))
    })
    return () => controller.abort()
  }, [revision, can.fees, can.occupancies, can.apartments, can.households, can.maintenance])

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
  const lookups = useMemo(() => occupancyLookups(data ?? {}), [data])
  const activeOccupancies = useMemo(() => (data?.occupancies ?? []).filter((row) => row.validFrom <= today && (!row.validTo || row.validTo > today)), [data, today])

  const apartmentCodeOf = (occupancy) => data?.apartments.find((apartment) => apartment.id === occupancy.apartmentId)?.code ?? 'Căn chưa rõ mã'
  const period = data ? findPeriodForMonth(data.periods, month) : null
  const sent = period && period.status !== 'DRAFT'
  const reviewing = period?.status === 'DRAFT' && reviewingId === period.id
  const periodInvoices = period ? invoicesByPeriod.get(period.id) ?? [] : []
  const summary = summarizeInvoices(periodInvoices)
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
          target = await createBillingPeriodApi(defaults)
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
      if (target.snapshotDate !== snapshotDate) target = await updateBillingPeriodApi(target.id, { snapshotDate })
      await generateInvoicesApi(target.id)
      const invoices = await getInvoicesApi({ periodId: target.id })
      setReview({ period: target, invoices })
    } catch (err) {
      setError(apiErrorMessage(err, 'Không lập được phiếu báo phí. Vui lòng thử lại.'))
    } finally {
      setPreparing(false)
    }
  }

  const placeOf = (invoice) => (lookups.apartmentMap[invoice.occupancyId]?.code ? `căn ${lookups.apartmentMap[invoice.occupancyId].code}` : 'căn này')

  const startPayment = (invoice) => setPaying({ invoice, householdId: lookups.householdMap[invoice.occupancyId]?.id ?? '' })

  const deleteLine = async (invoice, lineId) => {
    if (!window.confirm('Xóa dòng phí này khỏi phiếu báo phí?')) return
    try {
      await deleteInvoiceLineApi(invoice.id, lineId, { version: invoice.version })
      setSuccess(`Đã xóa dòng phí khỏi phiếu báo phí ${placeOf(invoice)}.`)
      reload()
    } catch (err) {
      setError(apiErrorMessage(err, 'Không xóa được dòng phí. Vui lòng thử lại.'))
    }
  }

  const confirmCancel = async (reason) => {
    const { invoice } = cancelling
    setCancelling({ invoice, busy: true })
    try {
      await cancelInvoiceApi(invoice.id, { version: invoice.version, reason })
      setCancelling(null)
      setSuccess(`Đã hủy phiếu báo phí ${placeOf(invoice)}.`)
      reload()
    } catch (err) {
      setCancelling(null)
      setError(apiErrorMessage(err, 'Không hủy được phiếu. Vui lòng thử lại.'))
    }
  }

  const previous = review && data ? previousPeriod(data.periods, review.period) : null
  // A maintenance round can only join a draft month, so remind before the bills go out.
  const maintenanceHint = Boolean(review && data?.maintenanceFunds?.length
    && !data.maintenanceRounds.some((round) => round.periodId === review.period.id))

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
            {(sent || reviewing) && <StatusBadge tone={STATUS_TONE[period.status]}>{periodStatusLabel(period.status)}</StatusBadge>}
          </div>
          {sent && period.status === 'ISSUED' && can.close && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setClosing(period)}>
              <LockIcon size={14} />
              <span>Khóa sổ</span>
            </button>
          )}
        </div>

        {data === null && !error && <p role="status" className="mt-4 mb-0 text-sm text-slate-600">Đang tải…</p>}

        {data && !sent && !reviewing && (
          <div className="mt-4 flex flex-col items-start gap-2">
            <p className="m-0 text-sm text-slate-600">Chưa gửi phiếu báo phí cho tháng {monthLabel(month)}.</p>
            {can.create ? (
              <button type="button" className="btn btn-primary" onClick={prepare} disabled={preparing}>
                <ReceiptIcon size={16} />
                <span>{preparing ? 'Đang tính tiền…' : `Lập phiếu báo phí tháng ${monthLabel(month)}`}</span>
              </button>
            ) : (
              <p className="m-0 text-sm text-slate-500">Bạn không có quyền lập phiếu báo phí.</p>
            )}
          </div>
        )}

        {reviewing && (
          <div className="mt-4 flex flex-col items-start gap-2">
            <p className="m-0 text-sm text-slate-600">
              Đang kiểm tra {summary.count} phiếu nháp, tổng <strong>{formatMoney(summary.total)}</strong>. Cư dân chưa thấy các phiếu này.
            </p>
            <p className="m-0 text-xs text-slate-500">
              Nếu lập lại vào ngày khác, các dòng tính theo bảng phí (kể cả dòng thêm tay có chọn giá) sẽ được tính lại.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => setReview({ period, invoices: periodInvoices })}>Gửi cho cư dân</button>
              <button type="button" className="btn btn-outline" onClick={() => setReviewingId(null)}>Xong, để sau</button>
            </div>
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
            <p className="m-0 text-xs text-slate-500">Tiền đã nộp được ghi ở <Link to={ROUTES.payments} className="font-semibold underline">Sổ thu tiền</Link>.</p>
          </div>
        )}
      </section>

      {(sent || reviewing) && (
        <>
          <InvoiceListTable
            key={period.id}
            invoices={periodInvoices}
            apartmentMap={lookups.apartmentMap}
            householdMap={lookups.householdMap}
            onRefresh={reload}
            canRecordPayment={sent && can.recordPayment}
            onRecordPayment={startPayment}
            canWriteInvoice={reviewing && can.writeInvoice}
            onAddLine={setLineInvoice}
            onDeleteLine={deleteLine}
            onCancelInvoice={sent && can.cancelInvoice ? (invoice) => setCancelling({ invoice, busy: false }) : undefined}
          />
          <ReconciliationPanel invoices={periodInvoices} period={period} lookups={lookups} />
        </>
      )}

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
          maintenanceHint={maintenanceHint}
          onReviewBills={can.writeInvoice ? () => { setReviewingId(review.period.id); setReview(null); reload() } : undefined}
          onIssued={(message) => { setReview(null); setReviewingId(null); setSuccess(message); reload() }}
        />
      )}
      {closing && (
        <CloseConfirmDialog
          period={closing}
          onClose={() => setClosing(null)}
          onClosed={(message) => { setClosing(null); setSuccess(message); reload() }}
        />
      )}
      {paying && (
        <RecordPaymentModal
          isOpen
          initialHouseholdId={paying.householdId}
          initialInvoice={paying.invoice}
          households={data.households}
          apartments={data.apartments}
          occupancies={activeOccupancies}
          onClose={() => setPaying(null)}
          onSuccess={(payment, paymentReceipt) => {
            setPaying(null)
            setSuccess(`Đã thu tiền. Mã phiếu thu: ${payment.paymentNo}.`)
            if (paymentReceipt) setReceipt({ receipt: paymentReceipt, payment })
            reload()
          }}
        />
      )}
      {receipt && <ReceiptModal isOpen receipt={receipt.receipt} payment={receipt.payment} onClose={() => setReceipt(null)} />}
      {lineInvoice && (
        <AddInvoiceLineModal
          isOpen
          invoice={lineInvoice}
          period={period}
          feeTypes={data.feeTypes}
          apartment={lookups.apartmentMap[lineInvoice.occupancyId] ?? null}
          onClose={() => setLineInvoice(null)}
          onSuccess={(line) => { setLineInvoice(null); setSuccess(`Đã thêm "${line.description}" vào phiếu.`); reload() }}
        />
      )}
      {cancelling && (
        <CancelInvoiceModal
          isOpen
          invoice={cancelling.invoice}
          placeLabel={placeOf(cancelling.invoice)}
          isCancelling={cancelling.busy}
          onConfirm={confirmCancel}
          onClose={() => setCancelling(null)}
        />
      )}
    </div>
  )
}
