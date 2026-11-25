import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { getAllApartmentsApi, getAllBuildingsApi } from '../api/apartments'
import { getBillingPeriodsApi, getFeeTypesApi, getInvoicesApi } from '../api/billing'
import { getAllHouseholdsApi } from '../api/households'
import {
  getAllOccupanciesApi,
  getMaintenanceExpensesApi,
  getMaintenanceFundByIdApi,
  getMaintenanceFundsApi,
  getMaintenanceRoundsApi,
  getPostedPaymentsApi,
} from '../api/maintenance'
import { getUsersApi } from '../api/users'
import { apiErrorMessage } from '../api/errors'
import { STAFF_ROLES, formatMoney, monthLabel, periodMonth, toCents } from '../utils/billingUtils'
import { buildFundReconciliationReport } from '../utils/maintenanceUtils'
import { ROUTES } from '../routes'
import PageHeader from '../components/PageHeader'
import ForbiddenView from '../components/ForbiddenView'
import MaintenanceFundCreateModal from '../components/MaintenanceFundCreateModal'
import MaintenanceExpenseRecordModal from '../components/MaintenanceExpenseRecordModal'
import CollectMaintenanceModal from '../components/maintenance/CollectMaintenanceModal'
import ExpenseList from '../components/maintenance/ExpenseList'
import FundSummary from '../components/maintenance/FundSummary'
import ReconciliationDialog from '../components/maintenance/ReconciliationDialog'
import RoundApartmentsDialog from '../components/maintenance/RoundApartmentsDialog'
import RoundList from '../components/maintenance/RoundList'
import { AlertTriangleIcon, CheckCircleIcon, PlusIcon, ReceiptIcon, WalletIcon } from '../components/Icons'

export default function MaintenancePage({ onBack }) {
  const { hasRole, hasPermission } = useAuth()
  const isStaff = STAFF_ROLES.some((role) => hasRole(role))
  const canReadFunds = hasPermission('maintenance-fund.read')
  const canReadRounds = hasPermission('maintenance-round.read')

  if (!isStaff || (!canReadFunds && !canReadRounds)) {
    return <ForbiddenView onBack={onBack} />
  }

  return <MaintenanceContent canReadFunds={canReadFunds} canReadRounds={canReadRounds} />
}

function MaintenanceContent({ canReadFunds, canReadRounds }) {
  const { hasPermission } = useAuth()
  const canWriteFunds = hasPermission('maintenance-fund.write')
  const canWriteRounds = hasPermission('maintenance-round.write')
  const canReadExpenses = hasPermission('maintenance-expense.read')
  const canRecordExpense = hasPermission('maintenance-expense.record')
  const canReadPayments = hasPermission('payment.read')
  const canReadInvoices = hasPermission('invoice.read')
  const canReadPeriods = hasPermission('billing-period.read')
  const canReadFeeTypes = hasPermission('fee-type.read')
  const canReadOccupancies = hasPermission('occupancy.read')
  const canReadApartments = hasPermission('apartment.read')
  const canReadHouseholds = hasPermission('household.read')
  const canReadBuildings = hasPermission('building.read')
  const canReadUsers = hasPermission('user.read')
  // Collecting creates the month's draft period and the maintenance fee type when missing.
  const canCollect = canWriteRounds && hasPermission('billing-period.write') && hasPermission('fee-type.write')

  const [searchParams, setSearchParams] = useSearchParams()
  const [revision, setRevision] = useState(0)
  const [overview, setOverview] = useState({
    loadedRevision: -1,
    error: '',
    funds: [],
    rounds: [],
    periods: [],
    feeTypes: [],
    occupancies: [],
    apartments: [],
    households: [],
    buildings: [],
    invoices: [],
    payments: [],
    users: [],
  })

  const [fundDetailState, setFundDetailState] = useState({
    key: '',
    error: '',
    fund: null,
    expenses: [],
  })

  const [modal, setModal] = useState('') // 'fund' | 'collect' | 'expense'
  const [success, setSuccess] = useState(null) // { message, toBilling }
  const [dismissedError, setDismissedError] = useState(false)

  const refreshAll = useCallback(() => {
    setDismissedError(false)
    setRevision((v) => v + 1)
  }, [])

  // Load main overview catalog & ledger data
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    Promise.all([
      canReadFunds ? getMaintenanceFundsApi(signal) : Promise.resolve([]),
      canReadRounds ? getMaintenanceRoundsApi({}, signal) : Promise.resolve([]),
      canReadPeriods ? getBillingPeriodsApi(signal) : Promise.resolve([]),
      canReadFeeTypes ? getFeeTypesApi(signal) : Promise.resolve([]),
      canReadOccupancies ? getAllOccupanciesApi(signal) : Promise.resolve([]),
      canReadApartments ? getAllApartmentsApi({ signal }) : Promise.resolve([]),
      canReadHouseholds ? getAllHouseholdsApi(signal) : Promise.resolve([]),
      canReadBuildings ? getAllBuildingsApi({ signal }) : Promise.resolve([]),
      canReadInvoices ? getInvoicesApi({}, signal) : Promise.resolve([]),
      canReadPayments ? getPostedPaymentsApi(signal) : Promise.resolve([]),
      canReadUsers ? getUsersApi(0, 100).then((d) => d.content ?? []) : Promise.resolve([]),
    ])
      .then(([
        funds,
        rounds,
        periods,
        feeTypes,
        occupancies,
        apartments,
        households,
        buildings,
        invoices,
        payments,
        users,
      ]) => {
        if (signal.aborted) return
        setOverview({
          loadedRevision: revision,
          error: '',
          funds,
          rounds,
          periods,
          feeTypes,
          occupancies,
          apartments,
          households,
          buildings,
          invoices,
          payments,
          users,
        })
      })
      .catch((err) => {
        if (signal.aborted) return
        setOverview((prev) => ({
          ...prev,
          loadedRevision: revision,
          error: apiErrorMessage(err, 'Không thể tải dữ liệu quỹ bảo trì. Vui lòng thử lại.'),
        }))
      })

    return () => controller.abort()
  }, [
    revision,
    canReadFunds,
    canReadRounds,
    canReadPeriods,
    canReadFeeTypes,
    canReadOccupancies,
    canReadApartments,
    canReadHouseholds,
    canReadBuildings,
    canReadInvoices,
    canReadPayments,
    canReadUsers,
  ])

  const selectedFundId = useMemo(() => {
    const fromQuery = searchParams.get('quy')
    if (fromQuery && overview.funds.some((f) => f.id === fromQuery)) return fromQuery
    return overview.funds[0]?.id ?? ''
  }, [searchParams, overview.funds])

  const detailKey = selectedFundId ? `${selectedFundId}|${revision}` : ''

  // Authoritative balance and expenses of the fund being shown.
  useEffect(() => {
    if (!canReadFunds || !selectedFundId) return undefined
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([
      getMaintenanceFundByIdApi(selectedFundId, signal),
      canReadExpenses ? getMaintenanceExpensesApi(selectedFundId, signal) : Promise.resolve([]),
    ])
      .then(([fund, expenses]) => {
        if (!signal.aborted) setFundDetailState({ key: detailKey, error: '', fund, expenses })
      })
      .catch((err) => {
        if (!signal.aborted) setFundDetailState({ key: detailKey, error: apiErrorMessage(err, 'Không thể tải chi tiết quỹ bảo trì.'), fund: null, expenses: [] })
      })
    return () => controller.abort()
  }, [canReadFunds, canReadExpenses, selectedFundId, detailKey])

  const loadingOverview = overview.loadedRevision !== revision
  const loadingDetail = Boolean(selectedFundId && fundDetailState.key !== detailKey)

  const report = useMemo(() => {
    const fund = (fundDetailState.key === detailKey && fundDetailState.fund) || overview.funds.find((f) => f.id === selectedFundId) || null
    if (!fund) return null
    return buildFundReconciliationReport({
      fund,
      rounds: overview.rounds.filter((r) => r.fundId === fund.id),
      expenses: fundDetailState.key === detailKey ? fundDetailState.expenses : [],
      invoices: overview.invoices,
      payments: overview.payments,
      occupancies: overview.occupancies,
      apartments: overview.apartments,
      households: overview.households,
      buildings: overview.buildings,
      periods: overview.periods,
      feeTypes: overview.feeTypes,
      users: overview.users,
      canReadPayments,
    })
  }, [fundDetailState, detailKey, overview, selectedFundId, canReadPayments])

  const fund = report?.fund ?? null
  const summary = report?.summary
  const showExpenses = searchParams.get('xem') === 'chi'
  const [roundForApartments, setRoundForApartments] = useState(null)
  const [showReconciliation, setShowReconciliation] = useState(false)
  const selectView = (expenses) => {
    const next = new URLSearchParams(searchParams)
    if (expenses) next.set('xem', 'chi')
    else next.delete('xem')
    setSearchParams(next)
  }
  const selectFund = (id) => setSearchParams({ quy: id })

  return (
    <div className="user-management-container">
      <PageHeader
        title="Quỹ bảo trì"
        actions={fund && (
          <>
            {canCollect && (
              <button type="button" className="btn btn-primary" onClick={() => setModal('collect')} disabled={loadingOverview}>
                <PlusIcon size={16} />
                <span>Thu bảo trì</span>
              </button>
            )}
            {canRecordExpense && (
              <button type="button" className="btn btn-secondary" onClick={() => setModal('expense')} disabled={loadingDetail}>
                <ReceiptIcon size={16} />
                <span>Ghi khoản chi</span>
              </button>
            )}
          </>
        )}
      />

      {success && (
        <div className="alert alert-success" role="status">
          <CheckCircleIcon size={18} className="shrink-0" />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <span>
              {success.message}
              {success.toBilling && <>{' '}<Link to={ROUTES.billing} className="font-semibold underline">Gửi phiếu báo phí</Link></>}
            </span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setSuccess(null)}>Đóng</button>
          </div>
        </div>
      )}

      {overview.error && !dismissedError && (
        <div className="alert alert-error" role="alert">
          <AlertTriangleIcon size={18} className="shrink-0" />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <span>{overview.error}</span>
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={refreshAll}>Thử lại</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setDismissedError(true)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {loadingOverview && <p role="status" className="text-sm text-slate-600">Đang tải quỹ bảo trì…</p>}

      {!loadingOverview && overview.funds.length === 0 && (
        <div className="table-card">
          <div className="empty-state-box py-10">
            <WalletIcon size={32} className="text-slate-400" />
            <p className="font-semibold text-slate-900">Chưa có quỹ bảo trì</p>
            <p className="text-sm text-slate-600">Tạo quỹ với số dư đầu kỳ để bắt đầu thu và chi bảo trì.</p>
            {canWriteFunds && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal('fund')}>
                <PlusIcon size={15} />
                <span>Tạo quỹ bảo trì</span>
              </button>
            )}
          </div>
        </div>
      )}

      {fund && summary && (
        <FundSummary
          fund={fund}
          summary={summary}
          funds={overview.funds}
          expenseCount={report.expenseRows.length}
          onSelectFund={selectFund}
          onCreateFund={canWriteFunds ? () => setModal('fund') : undefined}
          onOpenReconciliation={() => setShowReconciliation(true)}
        />
      )}

      {report && (canReadRounds || canReadExpenses) && (
        <section className="table-card" aria-label="Đợt thu và khoản chi">
          <div className="px-4 pt-4">
            <div className="filter-buttons-group" role="group" aria-label="Xem đợt thu hoặc khoản chi">
              {canReadRounds && (
                <button type="button" className={`filter-btn ${showExpenses ? '' : 'active'}`} aria-pressed={!showExpenses} onClick={() => selectView(false)}>
                  Đợt thu ({report.roundRows.length})
                </button>
              )}
              {canReadExpenses && (
                <button type="button" className={`filter-btn ${showExpenses || !canReadRounds ? 'active' : ''}`} aria-pressed={showExpenses || !canReadRounds} onClick={() => selectView(true)}>
                  Khoản chi ({report.expenseRows.length})
                </button>
              )}
            </div>
          </div>
          {canReadRounds && !showExpenses ? (
            <RoundList
              rounds={report.roundRows}
              onShowApartments={setRoundForApartments}
              emptyAction={canCollect && <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal('collect')}>Thu bảo trì</button>}
            />
          ) : (
            <ExpenseList
              expenses={report.expenseRows}
              emptyAction={canRecordExpense && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal('expense')}>Ghi khoản chi</button>}
            />
          )}
        </section>
      )}

      {roundForApartments && <RoundApartmentsDialog round={roundForApartments} onClose={() => setRoundForApartments(null)} />}
      {showReconciliation && report && (
        <ReconciliationDialog
          report={report}
          loading={loadingOverview || loadingDetail}
          error={fundDetailState.key === detailKey ? fundDetailState.error : ''}
          onRetry={refreshAll}
          onClose={() => setShowReconciliation(false)}
        />
      )}

      {modal === 'fund' && canWriteFunds && (
        <MaintenanceFundCreateModal
          isOpen
          existingCodes={overview.funds.map((row) => row.code)}
          onClose={() => setModal('')}
          onSuccess={(created) => {
            setSuccess({ message: `Đã tạo quỹ "${created?.name ?? ''}".` })
            refreshAll()
            if (created?.id) setSearchParams({ quy: created.id })
          }}
        />
      )}

      {modal === 'collect' && fund && (
        <CollectMaintenanceModal
          fund={fund}
          periods={overview.periods}
          feeTypes={overview.feeTypes}
          occupancies={overview.occupancies}
          apartments={overview.apartments}
          households={overview.households}
          buildings={overview.buildings}
          onClose={() => setModal('')}
          onCollected={(created, period) => {
            setModal('')
            const month = periodMonth(period)
            setSuccess({ message: `Đã cộng "${created?.description ?? ''}" vào phiếu báo phí tháng ${monthLabel(month)} cho ${created?.allocations?.length ?? 0} căn.`, toBilling: true })
            refreshAll()
          }}
        />
      )}

      {modal === 'expense' && fund && (
        <MaintenanceExpenseRecordModal
          isOpen
          onClose={() => setModal('')}
          fund={fund}
          onSuccess={(created) => {
            setSuccess({ message: `Đã ghi khoản chi "${created?.description || ''}" (${formatMoney(toCents(created?.amount))}).` })
            refreshAll()
          }}
        />
      )}
    </div>
  )
}
