import { useId } from 'react'
import { Link } from 'react-router'
import { ROUTES } from '../routes'
import { formatDate, formatMoney, periodMonthLabel, toCents } from '../utils/billingUtils'
import { formatDateTime, PAYMENT_CHANNEL_LABELS } from '../utils/paymentUtils'
import { formatDateVn } from '../utils/residentDirectoryUtils'
import { RESIDENCE_CHANGE_STATUS, RESIDENCE_CHANGE_TYPES } from '../utils/residenceValidation'
import StatusBadge from './StatusBadge'
import {
  AlertTriangleIcon,
  ApartmentIcon,
  CalendarIcon,
  CheckCircleIcon,
  CreditCardIcon,
  HomeIcon,
  ReceiptIcon,
  ReceiptTaxIcon,
  ShieldCheckIcon,
  UsersIcon,
  WalletIcon,
} from './Icons'

const PERIOD_BADGES = {
  DRAFT: { label: 'Bản nháp', tone: 'neutral' },
  ISSUED: { label: 'Đã phát hành', tone: 'success' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
}

export function BillingProgressCard({
  billingSummary,
  loading = false,
  canGenerate = false,
  canRecordPayment = false,
}) {
  const labelId = useId()
  const { currentPeriod, activeInvoiceCount, reconciliation, collectionPercent } = billingSummary || {}
  const periodBadge = currentPeriod ? PERIOD_BADGES[currentPeriod.status] || PERIOD_BADGES.DRAFT : null

  return (
    <section className="rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="overview-billing-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-0 border-b border-solid border-slate-100 pb-3.5">
        <div>
          <h3 id="overview-billing-title" className="text-base font-bold text-slate-900">
            Tiến độ kỳ thu hiện tại
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {currentPeriod
              ? `Kỳ ${currentPeriod.code} (${periodMonthLabel(currentPeriod)}) · Hạn nộp ${formatDate(currentPeriod.dueDate)}`
              : loading
                ? 'Đang tải thông tin kỳ thu…'
                : 'Chưa có kỳ thu phí nào được khởi tạo.'}
          </p>
        </div>
        {periodBadge && <StatusBadge tone={periodBadge.tone}>{periodBadge.label}</StatusBadge>}
      </div>

      {!currentPeriod && !loading && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
          <p className="text-sm font-semibold text-slate-700">Chưa có kỳ thu để tổng hợp số liệu</p>
          <p className="mt-1 text-xs text-slate-500">Tạo kỳ thu mới và lập bảng kê tại phân hệ Khoản thu.</p>
          <Link to={ROUTES.billing} className="btn btn-primary btn-sm mt-3 no-underline">
            Mở Khoản thu
          </Link>
        </div>
      )}

      {currentPeriod && (
        <div className="mt-4 space-y-4">
          {currentPeriod.status === 'DRAFT' && (
            <div className="flex items-start gap-2.5 rounded-xl border border-solid border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <AlertTriangleIcon size={16} className="mt-0.5 shrink-0" />
              <span>
                {activeInvoiceCount === 0
                  ? 'Kỳ thu đang ở trạng thái Bản nháp và chưa có bảng kê phát sinh.'
                  : `Kỳ thu đang ở Bản nháp với ${activeInvoiceCount} bảng kê chờ phát hành cho cư dân.`}
              </span>
            </div>
          )}

          {!reconciliation.isMatched && activeInvoiceCount > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-solid border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900">
              <AlertTriangleIcon size={16} className="mt-0.5 shrink-0" />
              <span>
                Phát hiện {reconciliation.discrepantCount} bảng kê lệch đối chiếu dòng phí. Kiểm tra tại tab Đối chiếu kế toán.
              </span>
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label id={labelId} className="font-semibold text-slate-700">
                Tỷ lệ hoàn thành thu phí ({reconciliation.paidCount}/{activeInvoiceCount} bảng kê)
              </label>
              <span className="font-bold text-slate-900 tabular-nums">{collectionPercent}%</span>
            </div>
            <progress
              className="overview-progress"
              style={{ '--progress-bar-fill': collectionPercent >= 100 ? 'var(--emerald-600, #059669)' : 'var(--primary)' }}
              max={100}
              value={collectionPercent}
              aria-labelledby={labelId}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
              <span className="block text-xs text-slate-500">Tổng phải thu</span>
              <strong className="mt-0.5 block text-base font-extrabold text-slate-900 tabular-nums">
                {formatMoney(reconciliation.totalInvoiceAmount)}
              </strong>
            </div>
            <div className="rounded-xl bg-emerald-50/70 px-3.5 py-2.5">
              <span className="block text-xs text-emerald-800">Đã thực thu</span>
              <strong className="mt-0.5 block text-base font-extrabold text-emerald-700 tabular-nums">
                {formatMoney(reconciliation.totalPaid)}
              </strong>
            </div>
            <div className="rounded-xl bg-amber-50/70 px-3.5 py-2.5">
              <span className="block text-xs text-amber-800">Còn nợ ({reconciliation.debtCount} hộ)</span>
              <strong className="mt-0.5 block text-base font-extrabold text-amber-800 tabular-nums">
                {formatMoney(reconciliation.totalOutstanding)}
              </strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link to={ROUTES.billing} className="btn btn-secondary btn-sm no-underline">
              {canGenerate && currentPeriod.status === 'DRAFT' ? 'Lập / Phát hành bảng kê' : 'Xem bảng kê kỳ thu'}
            </Link>
            {canRecordPayment && (
              <Link to={ROUTES.payments} className="btn btn-primary btn-sm no-underline">
                Ghi nhận thu tiền
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export function PendingResidenceChangesCard({
  changes = [],
  totalCount = 0,
  mode = 'pending', // 'pending' | 'approved' | 'household'
  loading = false,
}) {
  const isPending = mode === 'pending'
  const isHousehold = mode === 'household'
  const heading = isPending
    ? 'Hồ sơ cư trú chờ xử lý'
    : isHousehold
      ? 'Hồ sơ biến động cư trú gần đây'
      : 'Biến động cư trú đã duyệt gần đây'

  return (
    <section className="rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="overview-changes-title">
      <div className="flex items-start justify-between gap-3 border-0 border-b border-solid border-slate-100 pb-3.5">
        <div>
          <h3 id="overview-changes-title" className="text-base font-bold text-slate-900">
            {heading}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {isPending
              ? totalCount > 0
                ? `Có ${totalCount} yêu cầu tạm trú, tạm vắng hoặc chuyển hộ cần xem xét.`
                : 'Không có hồ sơ biến động cư trú tồn đọng.'
              : isHousehold
                ? 'Theo dõi trạng thái các yêu cầu tạm trú, tạm vắng hoặc chuyển hộ đã gửi.'
                : 'Tổng hợp các thay đổi nhân khẩu, tạm trú, tạm vắng mới nhất.'}
          </p>
        </div>
        <Link to={ROUTES.residenceChanges} className="text-xs font-semibold text-(--primary) no-underline hover:underline">
          Xem tất cả →
        </Link>
      </div>

      {loading ? (
        <p className="mt-4 text-xs text-slate-500" role="status">Đang tải biến động cư trú…</p>
      ) : changes.length === 0 ? (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <CheckCircleIcon size={16} className="shrink-0 text-emerald-600" />
          <span>{isPending ? 'Tất cả hồ sơ biến động cư trú đã được xử lý xong.' : 'Chưa phát sinh hồ sơ biến động cư trú nào.'}</span>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 p-0 list-none m-0">
          {changes.map((item) => {
            const typeMeta = RESIDENCE_CHANGE_TYPES[item.changeType] || { label: item.changeType }
            const statusMeta = RESIDENCE_CHANGE_STATUS[item.status] || { label: item.status, tone: 'neutral' }
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-900">{typeMeta.label}</span>
                  <span className="mt-0.5 block text-slate-500">
                    Hiệu lực: {formatDateVn(item.effectiveFrom)}
                    {item.effectiveTo ? ` → ${formatDateVn(item.effectiveTo)}` : ''}
                  </span>
                </div>
                <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function RecentPaymentsCard({ paymentSummary, maintenanceSummary, loading = false, showMaintenance = false }) {
  const { postedTotal, cashTotal, bankTransferTotal, recentPayments } = paymentSummary || {}

  return (
    <section className="rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="overview-payments-title">
      <div className="flex items-start justify-between gap-3 border-0 border-b border-solid border-slate-100 pb-3.5">
        <div>
          <h3 id="overview-payments-title" className="text-base font-bold text-slate-900">
            Sổ quỹ thu tiền & Phiếu thu gần đây
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Tiền mặt: <strong className="text-slate-700 tabular-nums">{formatMoney(cashTotal || 0n)}</strong> · Chuyển khoản:{' '}
            <strong className="text-slate-700 tabular-nums">{formatMoney(bankTransferTotal || 0n)}</strong>
          </p>
        </div>
        <Link to={ROUTES.payments} className="text-xs font-semibold text-(--primary) no-underline hover:underline">
          Mở Sổ quỹ →
        </Link>
      </div>

      {showMaintenance && maintenanceSummary && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs">
          <span className="text-slate-600">
            Quỹ bảo trì ({maintenanceSummary.fundCount} quỹ) · Đã ghi sổ thu:{' '}
            <strong className="text-slate-800 tabular-nums">{formatMoney(postedTotal || 0n)}</strong>
          </span>
          <Link to={ROUTES.maintenanceFunds} className="font-semibold text-(--primary) no-underline hover:underline">
            Số dư: {formatMoney(maintenanceSummary.totalBalance || 0n)} →
          </Link>
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-xs text-slate-500" role="status">Đang tải nhật ký thu tiền…</p>
      ) : !recentPayments?.length ? (
        <p className="mt-4 text-xs text-slate-500">Chưa có phiếu thu nào được ghi nhận.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 p-0 list-none m-0">
          {recentPayments.map((pay) => (
            <li key={pay.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
              <div className="min-w-0">
                <span className="font-mono font-bold text-slate-900">{pay.paymentNo}</span>
                <span className="mt-0.5 block text-slate-500">
                  {PAYMENT_CHANNEL_LABELS[pay.channel] || pay.channel} · {formatDateTime(pay.paidAt)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <strong className={`tabular-nums ${pay.status === 'VOIDED' ? 'text-slate-400 line-through' : 'text-emerald-700'}`}>
                  {formatMoney(toCents(pay.amount))}
                </strong>
                <StatusBadge tone={pay.status === 'VOIDED' ? 'error' : 'success'}>
                  {pay.status === 'VOIDED' ? 'Đã hủy' : 'Đã thu'}
                </StatusBadge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ResidenceBreakdownCard({ summary, apartmentSummary, loading = false }) {
  const labelId = useId()
  const total = summary?.total || 0
  const residentRatio = total > 0 ? Math.round(((summary.permanent + summary.temporaryResidence) / total) * 100) : 0

  return (
    <section className="rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="overview-residence-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-0 border-b border-solid border-slate-100 pb-3.5">
        <div>
          <h3 id="overview-residence-title" className="text-base font-bold text-slate-900">
            Cơ cấu trạng thái lưu trú toàn chung cư
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Căn hộ đang có cư trú: <strong className="text-slate-800">{apartmentSummary.occupied}/{apartmentSummary.total}</strong> ({apartmentSummary.occupancyRate}%)
          </p>
        </div>
        <Link to={ROUTES.residents} className="btn btn-primary btn-sm no-underline">
          Rà soát lưu trú &amp; Xuất Excel
        </Link>
      </div>

      {loading ? (
        <p className="mt-4 text-xs text-slate-500" role="status">Đang tổng hợp dữ liệu cư trú…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <label id={labelId} className="font-semibold text-slate-700">
                Tỷ lệ nhân khẩu đang hiện diện (Thường trú + Tạm trú)
              </label>
              <span className="font-bold text-slate-900 tabular-nums">{residentRatio}%</span>
            </div>
            <progress className="overview-progress" max={100} value={residentRatio} aria-labelledby={labelId} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-emerald-50/70 px-3 py-2">
              <span className="block text-xs text-emerald-800">Thường trú</span>
              <strong className="text-lg font-extrabold text-emerald-700 tabular-nums">{summary.permanent}</strong>
            </div>
            <div className="rounded-xl bg-blue-50/70 px-3 py-2">
              <span className="block text-xs text-blue-800">Tạm trú</span>
              <strong className="text-lg font-extrabold text-blue-700 tabular-nums">{summary.temporaryResidence}</strong>
            </div>
            <div className="rounded-xl bg-amber-50/70 px-3 py-2">
              <span className="block text-xs text-amber-800">Tạm vắng</span>
              <strong className="text-lg font-extrabold text-amber-800 tabular-nums">{summary.temporaryAbsence}</strong>
            </div>
            <div className="rounded-xl bg-slate-100 px-3 py-2">
              <span className="block text-xs text-slate-600">Chuyển đi / Khác</span>
              <strong className="text-lg font-extrabold text-slate-700 tabular-nums">{summary.movedOut + summary.unassigned}</strong>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export function ResidentHouseholdOverview({ residentSummary, loading = false, canReadInvoices = false }) {
  const { householdLabel, totalOutstanding, outstandingPeriods, recentPayments } = residentSummary || {}

  return (
    <section className="rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="overview-resident-hh-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-0 border-b border-solid border-slate-100 pb-3.5">
        <div>
          <h3 id="overview-resident-hh-title" className="text-base font-bold text-slate-900">
            Khoản thu &amp; Giao dịch — {householdLabel}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {totalOutstanding > 0n
              ? `Tổng công nợ chưa thanh toán: ${formatMoney(totalOutstanding)} (${outstandingPeriods.length} kỳ)`
              : 'Hộ gia đình đã hoàn thành toàn bộ nghĩa vụ phí đã phát hành.'}
          </p>
        </div>
        {canReadInvoices && (
          <Link to={ROUTES.billing} className="btn btn-primary btn-sm no-underline">
            Xem khoản thu
          </Link>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-xs text-slate-500" role="status">Đang tải thông tin hộ gia đình…</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-solid border-slate-200 bg-slate-50/60 p-3.5">
            <h4 className="m-0 text-xs font-bold uppercase tracking-wider text-slate-600">Các kỳ cần đóng</h4>
            {outstandingPeriods.length === 0 ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircleIcon size={15} /> Không còn khoản nợ đọng.
              </p>
            ) : (
              <ul className="mt-2 space-y-2 p-0 list-none m-0">
                {outstandingPeriods.map((entry) => (
                  <li key={entry.period.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      <strong className="text-slate-900">{entry.period.code}</strong>
                      <span className="block text-slate-500">Hạn: {formatDate(entry.period.dueDate)}</span>
                    </span>
                    <strong className="font-bold text-amber-800 tabular-nums">{formatMoney(entry.amount)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-solid border-slate-200 bg-slate-50/60 p-3.5">
            <h4 className="m-0 text-xs font-bold uppercase tracking-wider text-slate-600">Thanh toán gần đây</h4>
            {!recentPayments?.length ? (
              <p className="mt-2 text-xs text-slate-500">Chưa phát sinh lịch sử nộp tiền.</p>
            ) : (
              <ul className="mt-2 space-y-2 p-0 list-none m-0">
                {recentPayments.map((pay) => (
                  <li key={pay.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      <strong className="font-mono text-slate-900">{pay.paymentNo}</strong>
                      <span className="block text-slate-500">{formatDateTime(pay.paidAt)}</span>
                    </span>
                    <strong className="font-bold text-emerald-700 tabular-nums">{formatMoney(toCents(pay.amount))}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export function QuickActionsPanel({ links = [] }) {
  if (!links.length) return null

  const iconMap = {
    apartments: ApartmentIcon,
    residents: UsersIcon,
    residenceChanges: CalendarIcon,
    billing: ReceiptIcon,
    payments: CreditCardIcon,
    fees: ReceiptTaxIcon,
    maintenanceFunds: WalletIcon,
    users: ShieldCheckIcon,
    family: HomeIcon,
  }

  return (
    <section className="rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="quick-actions-title">
      <h2 id="quick-actions-title" className="text-base font-bold text-slate-900">
        Không gian tác nghiệp
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">Truy cập nhanh các phân hệ được cấp quyền</p>
      <div className="mt-3.5 flex flex-col gap-2">
        {links.map((item) => {
          const Icon = iconMap[item.key] || ApartmentIcon
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-xl border border-solid border-slate-200 bg-white px-3.5 py-2.5 text-left no-underline transition-colors hover:border-(--primary-border) hover:bg-(--primary-light)"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-(--primary-light) text-(--primary)" aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900">{item.title}</span>
                <span className="block truncate text-xs text-slate-500">{item.description}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
