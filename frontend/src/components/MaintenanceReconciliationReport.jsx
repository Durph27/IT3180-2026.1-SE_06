import StatCard from './StatCard'
import StatusBadge from './StatusBadge'
import MaintenanceRoundsTable from './MaintenanceRoundsTable'
import { formatMoney } from '../utils/billingUtils'
import { formatDateTimeVietnam, formatShortDate } from '../utils/maintenanceUtils'
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  PlusIcon,
  PrinterIcon,
  ReceiptTaxIcon,
  RefreshIcon,
  WalletIcon,
} from './Icons'

const CODE_TAG = 'rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[13px] font-semibold text-slate-800'

export default function MaintenanceReconciliationReport({
  report,
  loading = false,
  error = '',
  onRetry,
  canReadRounds = true,
  canReadExpenses = true,
  canWriteRounds = false,
  canRecordExpense = false,
  onCreateRound,
  onRecordExpense,
}) {
  if (loading && !report) {
    return (
      <div className="table-card p-8 text-center" role="status">
        <div className="loading-spinner-ring mx-auto mb-3" />
        <p className="text-sm text-slate-600">Đang tổng hợp báo cáo đối chiếu số dư quỹ bảo trì…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="alert alert-error" role="alert">
        <AlertTriangleIcon size={18} />
        <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          {onRetry && (
            <button type="button" className="btn btn-outline btn-xs" onClick={onRetry}>
              Thử lại
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="table-card p-8 text-center">
        <WalletIcon size={32} className="mx-auto mb-2 text-slate-400" />
        <p className="font-semibold text-slate-900">Chọn một quỹ bảo trì để xem báo cáo đối chiếu</p>
      </div>
    )
  }

  const { fund, roundRows, expenseRows, canReadPayments, summary } = report

  return (
    <div className="flex flex-col gap-6">
      {/* Fund Summary Header & Actions */}
      <div className="rounded-2xl border border-solid border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={CODE_TAG}>{fund.code}</span>
              <h2 className="text-lg font-extrabold text-slate-900">{fund.name}</h2>
              {summary.isBalanced ? (
                <StatusBadge tone="success">Khớp sổ quỹ</StatusBadge>
              ) : (
                <StatusBadge tone="warning">Cần kiểm tra chênh lệch</StatusBadge>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-600">
              Ngày mở quỹ: <strong>{formatShortDate(fund.openingDate)}</strong> · Tỷ lệ thu đợt phân bổ:{' '}
              <strong>{summary.collectionRatePct}%</strong> ({roundRows.length} đợt thu, {expenseRows.length} chứng từ chi)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {onRetry && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={loading}>
                <RefreshIcon size={15} />
                <span>Đối chiếu lại</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => typeof window !== 'undefined' && window.print?.()}
            >
              <PrinterIcon size={15} />
              <span>In báo cáo</span>
            </button>
            {canWriteRounds && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onCreateRound}>
                <PlusIcon size={15} />
                <span>Tạo đợt thu</span>
              </button>
            )}
            {canRecordExpense && (
              <button type="button" className="btn btn-primary btn-sm" onClick={onRecordExpense}>
                <ReceiptTaxIcon size={15} />
                <span>Ghi nhận khoản chi</span>
              </button>
            )}
          </div>
        </div>

        {!summary.isBalanced && (
          <div className="alert alert-error mt-4 mb-0!" role="alert">
            <AlertTriangleIcon size={18} />
            <div>
              Phát hiện chênh lệch đối chiếu sổ quỹ: Thu ({formatMoney(summary.collectedDiscrepancyCents)}), Chi ({formatMoney(summary.expenseDiscrepancyCents)}), Số dư ({formatMoney(summary.balanceDiscrepancyCents)}).
            </div>
          </div>
        )}

        {summary.isBalanced && (
          <div className="alert alert-success mt-4 mb-0!" role="status">
            <CheckCircleIcon size={18} />
            <div>
              Đối chiếu khớp: Số dư đầu kỳ ({formatMoney(summary.openingCents)}) + Đã thu ({formatMoney(summary.reportedCollectedCents)}) − Đã chi ({formatMoney(summary.reportedExpenseCents)}) = <strong>{formatMoney(summary.reportedBalanceCents)}</strong>
              {!canReadPayments && ' (chi tiết chứng từ thu từng dòng được tổng hợp từ sổ quỹ do tài khoản không có quyền payment.read).'}
            </div>
          </div>
        )}
      </div>

      {/* 4 Key Financial Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="I. Số dư đầu kỳ" value={formatMoney(summary.openingCents)} icon={WalletIcon} />
        <StatCard label="II. Tổng đã thu" value={formatMoney(summary.reportedCollectedCents)} tone="success" icon={CheckCircleIcon} />
        <StatCard label="III. Tổng đã chi" value={formatMoney(summary.reportedExpenseCents)} tone="warning" icon={ReceiptTaxIcon} />
        <StatCard label="IV. Số dư quỹ hiện tại" value={formatMoney(summary.reportedBalanceCents)} tone="success" icon={WalletIcon} />
      </div>

      {/* Ledger Reconciliation Table */}
      <section className="table-card" aria-labelledby="reconciliation-ledger-title">
        <div className="table-toolbar">
          <div>
            <h3 id="reconciliation-ledger-title" className="text-base font-bold text-slate-900">
              Bảng đối chiếu số dư quỹ bảo trì
            </h3>
            <p className="text-xs text-slate-500">
              Đối chiếu số liệu tổng hợp trên sổ quỹ với tổng hợp các đợt phân bổ, chứng từ thu và chứng từ chi
            </p>
          </div>
        </div>
        <div className="table-scroll-region">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Chỉ tiêu đối chiếu</th>
                <th scope="col" className="col-num">Theo chứng từ / chi tiết</th>
                <th scope="col" className="col-num">Theo sổ quỹ hệ thống</th>
                <th scope="col" className="col-num">Chênh lệch</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="text-left font-bold text-slate-900">
                  I. Số dư đầu kỳ (ngày {formatShortDate(fund.openingDate)})
                </th>
                <td className="col-num font-semibold">{formatMoney(summary.openingCents)}</td>
                <td className="col-num font-semibold">{formatMoney(summary.openingCents)}</td>
                <td className="col-num text-emerald-700">{formatMoney(0n)}</td>
              </tr>
              <tr>
                <th scope="row" className="text-left font-bold text-slate-900">
                  II. (+) Thu từ các đợt phân bổ ({roundRows.length} đợt)
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                    Tổng đã phân bổ: {formatMoney(summary.totalAllocatedCents)} · Còn phải thu:{' '}
                    {formatMoney(summary.outstandingCollectionCents)}
                  </span>
                </th>
                <td className="col-num font-semibold text-emerald-700">
                  {summary.computedCollectedCents !== null
                    ? formatMoney(summary.computedCollectedCents)
                    : <span className="text-xs font-normal text-slate-500">Theo sổ quỹ</span>}
                </td>
                <td className="col-num font-semibold text-emerald-700">
                  {formatMoney(summary.reportedCollectedCents)}
                </td>
                <td className={`col-num font-semibold ${summary.collectedDiscrepancyCents === 0n ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatMoney(summary.collectedDiscrepancyCents)}
                </td>
              </tr>
              <tr>
                <th scope="row" className="text-left font-bold text-slate-900">
                  III. (−) Chi phí bảo trì đã ghi nhận ({expenseRows.length} chứng từ)
                </th>
                <td className="col-num font-semibold text-amber-800">{formatMoney(summary.computedExpenseCents)}</td>
                <td className="col-num font-semibold text-amber-800">{formatMoney(summary.reportedExpenseCents)}</td>
                <td className={`col-num font-semibold ${summary.expenseDiscrepancyCents === 0n ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatMoney(summary.expenseDiscrepancyCents)}
                </td>
              </tr>
              <tr className="bg-slate-50">
                <th scope="row" className="text-left text-base font-extrabold text-slate-900">
                  IV. (=) Số dư cuối kỳ đối chiếu (I + II − III)
                </th>
                <td className="col-num text-base font-extrabold text-slate-900">
                  {formatMoney(summary.expectedBalanceCents)}
                </td>
                <td className="col-num text-base font-extrabold text-slate-900">
                  {formatMoney(summary.reportedBalanceCents)}
                </td>
                <td className={`col-num text-base font-extrabold ${summary.balanceDiscrepancyCents === 0n ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatMoney(summary.balanceDiscrepancyCents)}
                </td>
              </tr>
              <tr>
                <th scope="row" className="text-left text-xs font-semibold text-slate-600">
                  Tham chiếu: Số dư dự kiến nếu thu đủ 100% các đợt đã lập (I + Tổng phân bổ − III)
                </th>
                <td className="col-num font-semibold text-slate-700" colSpan={2}>
                  {formatMoney(summary.projectedBalanceCents)}
                </td>
                <td className="col-num text-xs text-slate-500">
                  Còn phải thu {formatMoney(summary.outstandingCollectionCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Detail Section 1: Rounds & Allocations */}
      {canReadRounds && (
        <section className="table-card" aria-labelledby="fund-rounds-title">
          <div className="table-toolbar">
            <div>
              <h3 id="fund-rounds-title" className="text-base font-bold text-slate-900">
                Chi tiết các đợt thu thuộc quỹ ({roundRows.length})
              </h3>
              <p className="text-xs text-slate-500">
                Nhấn &ldquo;Phân bổ&rdquo; trên từng đợt để đối chiếu số tiền đã phân bổ và thực thu theo từng hộ/căn hộ
              </p>
            </div>
            {canWriteRounds && (
              <button type="button" className="btn btn-secondary btn-sm print:hidden" onClick={onCreateRound}>
                <PlusIcon size={15} />
                <span>Tạo đợt thu mới</span>
              </button>
            )}
          </div>
          <MaintenanceRoundsTable
            rounds={roundRows}
            showFundColumn={false}
            canReadPayments={canReadPayments}
            emptyTitle="Quỹ chưa có đợt thu nào"
            emptyDescription="Tạo đợt thu mới gắn với kỳ thu Bản nháp để bắt đầu phân bổ chi phí cho các căn hộ."
          />
        </section>
      )}

      {/* Detail Section 2: Expenses Ledger */}
      {canReadExpenses && (
        <section className="table-card" aria-labelledby="fund-expenses-title">
          <div className="table-toolbar">
            <div>
              <h3 id="fund-expenses-title" className="text-base font-bold text-slate-900">
                Lịch sử khoản chi bảo trì ({expenseRows.length})
              </h3>
              <p className="text-xs text-slate-500">
                Tổng hợp toàn bộ chứng từ chi đã ghi nhận trừ vào số dư quỹ {fund.code}
              </p>
            </div>
            {canRecordExpense && (
              <button type="button" className="btn btn-secondary btn-sm print:hidden" onClick={onRecordExpense}>
                <PlusIcon size={15} />
                <span>Ghi nhận khoản chi</span>
              </button>
            )}
          </div>
          <div className="table-wrapper">
            <table className="modern-table">
              <thead>
                <tr>
                  <th scope="col">Thời điểm chi</th>
                  <th scope="col">Nội dung chi</th>
                  <th scope="col">Người ghi nhận</th>
                  <th scope="col" className="text-right!">Số tiền chi</th>
                </tr>
              </thead>
              <tbody>
                {expenseRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-table-cell">
                      <div className="empty-state-box">
                        <ReceiptTaxIcon size={28} className="text-slate-400" />
                        <p className="font-semibold text-slate-900">Chưa có khoản chi nào</p>
                        <p className="text-sm text-slate-600">Các khoản chi sau khi ghi nhận sẽ tự động cập nhật giảm số dư quỹ.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  expenseRows.map((expense) => (
                    <tr key={expense.id}>
                      <th scope="row" className="row-header-th font-medium text-slate-700">
                        {formatDateTimeVietnam(expense.spentAt)}
                      </th>
                      <td data-label="Nội dung chi" className="font-semibold text-slate-900">
                        {expense.description}
                      </td>
                      <td data-label="Người ghi nhận" className="text-sm text-slate-600">
                        {expense.recordedByLabel}
                      </td>
                      <td data-label="Số tiền chi" className="text-right! font-semibold text-amber-800">
                        {formatMoney(expense.amountCents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {expenseRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 font-bold text-slate-900">
                    <th scope="row" colSpan={3} className="px-6 py-3 text-left text-xs uppercase tracking-wider">
                      Tổng chi bảo trì đã ghi nhận
                    </th>
                    <td className="px-6 py-3 text-right text-amber-800">
                      {formatMoney(summary.computedExpenseCents)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
