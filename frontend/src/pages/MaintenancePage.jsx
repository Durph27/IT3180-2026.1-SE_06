import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
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
import { STAFF_ROLES, formatMoney, toCents } from '../utils/billingUtils'
import {
  ALLOCATION_BASIS_OPTIONS,
  buildFundReconciliationReport,
  formatShortDate,
} from '../utils/maintenanceUtils'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import FilterBar, { FilterField } from '../components/FilterBar'
import ForbiddenView from '../components/ForbiddenView'
import MaintenanceFundCreateModal from '../components/MaintenanceFundCreateModal'
import MaintenanceRoundCreateModal from '../components/MaintenanceRoundCreateModal'
import MaintenanceExpenseRecordModal from '../components/MaintenanceExpenseRecordModal'
import MaintenanceRoundsTable from '../components/MaintenanceRoundsTable'
import MaintenanceReconciliationReport from '../components/MaintenanceReconciliationReport'
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  PlusIcon,
  ReceiptIcon,
  RefreshIcon,
  WalletIcon,
} from '../components/Icons'

const CODE_TAG = 'rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[13px] font-semibold text-slate-800'
const CONTROL = 'form-control block min-h-11 w-full'

const TAB_DEFS = [
  { id: 'funds', label: 'Danh sách quỹ bảo trì', requiresFunds: true },
  { id: 'report', label: 'Báo cáo đối chiếu số dư', requiresFunds: true },
  { id: 'rounds', label: 'Đợt thu bảo trì', requiresRounds: true },
]

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

  const [searchParams, setSearchParams] = useSearchParams()
  const availableTabs = useMemo(
    () => TAB_DEFS.filter((t) => (!t.requiresFunds || canReadFunds) && (!t.requiresRounds || canReadRounds)),
    [canReadFunds, canReadRounds],
  )
  const requestedTab = searchParams.get('tab')
  const activeTab = availableTabs.some((t) => t.id === requestedTab)
    ? requestedTab
    : (availableTabs[0]?.id ?? 'funds')

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

  // Round filters (Tab 3)
  const [roundFundFilter, setRoundFundFilter] = useState('ALL')
  const [roundBasisFilter, setRoundBasisFilter] = useState('ALL')
  const [roundSearch, setRoundSearch] = useState('')

  // Modal state
  const [showFundModal, setShowFundModal] = useState(false)
  const [roundModalDefaultFundId, setRoundModalDefaultFundId] = useState(null)
  const [expenseModalFund, setExpenseModalFund] = useState(null)

  const [successMsg, setSuccessMsg] = useState('')
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

  // Fetch authoritative single-fund balance & expenses when inspecting Tab 2
  useEffect(() => {
    if (!canReadFunds || !selectedFundId || activeTab !== 'report') return undefined
    const controller = new AbortController()
    const { signal } = controller

    Promise.all([
      getMaintenanceFundByIdApi(selectedFundId, signal),
      canReadExpenses ? getMaintenanceExpensesApi(selectedFundId, signal) : Promise.resolve([]),
    ])
      .then(([fund, expenses]) => {
        if (signal.aborted) return
        setFundDetailState({ key: detailKey, error: '', fund, expenses })
      })
      .catch((err) => {
        if (signal.aborted) return
        setFundDetailState({
          key: detailKey,
          error: apiErrorMessage(err, 'Không thể tải chi tiết đối chiếu quỹ bảo trì.'),
          fund: null,
          expenses: [],
        })
      })

    return () => controller.abort()
  }, [canReadFunds, canReadExpenses, selectedFundId, activeTab, detailKey])

  const loadingOverview = overview.loadedRevision !== revision
  const loadingDetail = Boolean(
    activeTab === 'report' && selectedFundId && fundDetailState.key !== detailKey,
  )

  const fundsById = useMemo(
    () => new Map(overview.funds.map((f) => [f.id, f])),
    [overview.funds],
  )

  const totalFundsStats = useMemo(() => {
    let opening = 0n
    let collected = 0n
    let expense = 0n
    let balance = 0n
    for (const f of overview.funds) {
      opening += toCents(f.openingBalance)
      collected += toCents(f.collectedAmount)
      expense += toCents(f.expenseAmount)
      balance += toCents(f.balance)
    }
    return { count: overview.funds.length, opening, collected, expense, balance }
  }, [overview.funds])

  // Build enriched round rows for BOTH Tab 2 and Tab 3 cleanly through one helper
  const selectedFundReport = useMemo(() => {
    const fund =
      (fundDetailState.key === detailKey && fundDetailState.fund)
      || fundsById.get(selectedFundId)
      || null
    if (!fund) return null
    const fundRounds = overview.rounds.filter((r) => r.fundId === fund.id)
    const fundExpenses = fundDetailState.key === detailKey ? fundDetailState.expenses : []
    return buildFundReconciliationReport({
      fund,
      rounds: fundRounds,
      expenses: fundExpenses,
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
  }, [
    fundDetailState,
    detailKey,
    fundsById,
    selectedFundId,
    overview,
    canReadPayments,
  ])

  const allRoundsEnriched = useMemo(() => {
    const pseudoFund = overview.funds[0] ?? {
      openingBalance: '0.00',
      collectedAmount: '0.00',
      expenseAmount: '0.00',
      balance: '0.00',
    }
    return (
      buildFundReconciliationReport({
        fund: pseudoFund,
        rounds: overview.rounds,
        expenses: [],
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
      })?.roundRows ?? []
    )
  }, [overview, canReadPayments])

  const filteredRounds = useMemo(() => {
    const q = roundSearch.trim().toLowerCase()
    return allRoundsEnriched.filter((r) => {
      if (roundFundFilter !== 'ALL' && r.fundId !== roundFundFilter) return false
      if (roundBasisFilter !== 'ALL' && r.allocationBasis !== roundBasisFilter) return false
      if (q) {
        const fundCode = fundsById.get(r.fundId)?.code?.toLowerCase() ?? ''
        const desc = (r.description ?? '').toLowerCase()
        const periodCode = (r.periodCode ?? '').toLowerCase()
        if (!desc.includes(q) && !fundCode.includes(q) && !periodCode.includes(q)) return false
      }
      return true
    })
  }, [allRoundsEnriched, roundFundFilter, roundBasisFilter, roundSearch, fundsById])

  const roundStats = useMemo(() => {
    let allocated = 0n
    let collected = 0n
    let unknownCollected = false
    for (const r of filteredRounds) {
      allocated += r.totalCostCents
      if (r.collectedCents === null || r.collectedCents === undefined) {
        unknownCollected = true
      } else {
        collected += r.collectedCents
      }
    }
    return {
      count: filteredRounds.length,
      allocated,
      collected: unknownCollected ? null : collected,
    }
  }, [filteredRounds])

  const selectTab = (tabId, fundId = selectedFundId) => {
    const next = { tab: tabId }
    if (fundId) next.quy = fundId
    setSearchParams(next)
  }

  return (
    <div className="user-management-container">
      <PageHeader
        title="Quỹ bảo trì & Đối chiếu số dư"
        description="Quản lý quỹ bảo trì, lập đợt thu và đối chiếu thu – chi – số dư. Phí bảo trì được cộng vào phiếu báo phí của tháng đã chọn; cư dân nộp chung và tiền được ghi ở Sổ thu tiền."
        actions={(
          <>
            <button type="button" className="btn btn-secondary" onClick={refreshAll} disabled={loadingOverview}>
              <RefreshIcon size={16} />
              <span>Làm mới</span>
            </button>
            {canWriteFunds && (
              <button type="button" className="btn btn-secondary" onClick={() => setShowFundModal(true)}>
                <PlusIcon size={16} />
                <span>Tạo quỹ bảo trì</span>
              </button>
            )}
            {canWriteRounds && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setRoundModalDefaultFundId(selectedFundId || '')}
                disabled={overview.funds.length === 0}
                title={overview.funds.length === 0 ? 'Vui lòng tạo quỹ bảo trì trước' : 'Tạo đợt thu mới'}
              >
                <CalendarIcon size={16} />
                <span>Tạo đợt thu</span>
              </button>
            )}
          </>
        )}
      />

      {successMsg && (
        <div className="alert alert-success" role="status">
          <CheckCircleIcon size={18} className="shrink-0" />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <span>{successMsg}</span>
            <button type="button" className="btn btn-outline btn-xs" onClick={() => setSuccessMsg('')}>Đóng</button>
          </div>
        </div>
      )}

      {overview.error && !dismissedError && (
        <div className="alert alert-error" role="alert">
          <AlertTriangleIcon size={18} className="shrink-0" />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
            <span>{overview.error}</span>
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline btn-xs" onClick={refreshAll}>Thử lại</button>
              <button type="button" className="btn btn-outline btn-xs" onClick={() => setDismissedError(true)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="filter-buttons-group w-fit max-w-full flex-wrap" role="tablist" aria-label="Phân hệ quỹ bảo trì">
        {availableTabs.map((tab) => {
          const isSelected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`panel-${tab.id}`}
              className={`filter-btn ${isSelected ? 'active' : ''}`}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* TAB 1: Funds List */}
      {activeTab === 'funds' && canReadFunds && (
        <div role="tabpanel" id="panel-funds" aria-labelledby="tab-funds" className="flex flex-col gap-6">
          {!loadingOverview && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Tổng số quỹ bảo trì" value={totalFundsStats.count} icon={WalletIcon} />
              <StatCard label="Tổng đã thu lũy kế" value={formatMoney(totalFundsStats.collected)} tone="success" icon={CheckCircleIcon} />
              <StatCard label="Tổng đã chi lũy kế" value={formatMoney(totalFundsStats.expense)} tone="warning" icon={ReceiptIcon} />
              <StatCard label="Tổng số dư hiện tại" value={formatMoney(totalFundsStats.balance)} tone="success" icon={WalletIcon} />
            </div>
          )}

          <div className="table-card">
            <div className="table-toolbar">
              <div>
                <h2 className="text-base font-bold text-slate-900">Danh sách quỹ bảo trì ({overview.funds.length})</h2>
                <p className="text-xs text-slate-500">Chọn một quỹ để xem báo cáo đối chiếu thu – chi – số dư chi tiết</p>
              </div>
            </div>
            <div tabIndex={0} role="region" aria-label="Bảng danh sách quỹ bảo trì" className="table-wrapper">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th scope="col">Mã quỹ</th>
                    <th scope="col">Tên quỹ / Ngày mở</th>
                    <th scope="col" className="text-right!">Số dư đầu kỳ</th>
                    <th scope="col" className="text-right!">Đã thu</th>
                    <th scope="col" className="text-right!">Đã chi</th>
                    <th scope="col" className="text-right!">Số dư hiện tại</th>
                    <th scope="col" className="text-right!">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingOverview ? (
                    <tr>
                      <td colSpan={7} className="empty-table-cell">
                        <div className="table-loading-box">
                          <div className="loading-spinner-ring" />
                          <p>Đang tải danh sách quỹ bảo trì…</p>
                        </div>
                      </td>
                    </tr>
                  ) : overview.funds.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-table-cell">
                        <div className="empty-state-box">
                          <WalletIcon size={32} className="text-slate-400" />
                          <p className="font-semibold text-slate-900">Chưa có quỹ bảo trì nào</p>
                          <p className="text-sm text-slate-600">Hãy khởi tạo quỹ bảo trì đầu tiên để theo dõi thu chi và lập đợt phân bổ.</p>
                          {canWriteFunds && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowFundModal(true)}>
                              <PlusIcon size={15} />
                              <span>Tạo quỹ bảo trì</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    overview.funds.map((fund) => (
                      <tr key={fund.id}>
                        <th scope="row" className="row-header-th">
                          <span className={CODE_TAG}>{fund.code}</span>
                        </th>
                        <td data-label="Tên quỹ">
                          <span className="block font-semibold text-slate-900">{fund.name}</span>
                          <span className="block text-xs text-slate-500">Mở ngày {formatShortDate(fund.openingDate)}</span>
                        </td>
                        <td data-label="Số dư đầu kỳ" className="text-right!">
                          {formatMoney(toCents(fund.openingBalance))}
                        </td>
                        <td data-label="Đã thu" className="text-right! font-semibold text-emerald-700">
                          {formatMoney(toCents(fund.collectedAmount))}
                        </td>
                        <td data-label="Đã chi" className="text-right! font-semibold text-amber-800">
                          {formatMoney(toCents(fund.expenseAmount))}
                        </td>
                        <td data-label="Số dư hiện tại" className="text-right! font-extrabold text-slate-900">
                          {formatMoney(toCents(fund.balance))}
                        </td>
                        <td data-label="Thao tác" className="text-right!">
                          <div className="inline-flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => selectTab('report', fund.id)}
                            >
                              <span>Đối chiếu số dư</span>
                            </button>
                            {canWriteRounds && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => setRoundModalDefaultFundId(fund.id)}
                              >
                                <PlusIcon size={14} />
                                <span>Đợt thu</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Fund Detail & Balance Reconciliation Report */}
      {activeTab === 'report' && canReadFunds && (
        <div role="tabpanel" id="panel-report" aria-labelledby="tab-report" className="flex flex-col gap-6">
          {overview.funds.length > 0 && (
            <FilterBar>
              <FilterField id="report-fund-select" label="Quỹ bảo trì đối chiếu">
                <select
                  id="report-fund-select"
                  className={CONTROL}
                  value={selectedFundId}
                  onChange={(e) => selectTab('report', e.target.value)}
                >
                  {overview.funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.code} — {fund.name} (Số dư: {formatMoney(toCents(fund.balance))})
                    </option>
                  ))}
                </select>
              </FilterField>
            </FilterBar>
          )}

          <MaintenanceReconciliationReport
            report={selectedFundReport}
            loading={loadingOverview || loadingDetail}
            error={fundDetailState.key === detailKey ? fundDetailState.error : ''}
            onRetry={refreshAll}
            canReadRounds={canReadRounds}
            canReadExpenses={canReadExpenses}
            canWriteRounds={canWriteRounds}
            canRecordExpense={canRecordExpense}
            onCreateRound={() => setRoundModalDefaultFundId(selectedFundId)}
            onRecordExpense={() => {
              if (selectedFundReport?.fund) setExpenseModalFund(selectedFundReport.fund)
            }}
          />
        </div>
      )}

      {/* TAB 3: All Maintenance Rounds */}
      {activeTab === 'rounds' && canReadRounds && (
        <div role="tabpanel" id="panel-rounds" aria-labelledby="tab-rounds" className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Số đợt thu khớp lọc" value={roundStats.count} icon={CalendarIcon} />
            <StatCard label="Tổng chi phí phân bổ" value={formatMoney(roundStats.allocated)} icon={ReceiptIcon} />
            <StatCard
              label="Tổng đã thu qua đợt"
              value={roundStats.collected !== null ? formatMoney(roundStats.collected) : 'Xem theo quỹ'}
              tone="success"
              icon={CheckCircleIcon}
            />
          </div>

          <FilterBar>
            <FilterField id="filter-round-search" label="Tìm kiếm đợt thu">
              <input
                id="filter-round-search"
                type="search"
                className={CONTROL}
                placeholder="Mô tả, mã quỹ hoặc mã kỳ thu…"
                value={roundSearch}
                onChange={(e) => setRoundSearch(e.target.value)}
              />
            </FilterField>
            {canReadFunds && (
              <FilterField id="filter-round-fund" label="Quỹ bảo trì">
                <select
                  id="filter-round-fund"
                  className={CONTROL}
                  value={roundFundFilter}
                  onChange={(e) => setRoundFundFilter(e.target.value)}
                >
                  <option value="ALL">Tất cả quỹ bảo trì</option>
                  {overview.funds.map((f) => (
                    <option key={f.id} value={f.id}>{f.code} — {f.name}</option>
                  ))}
                </select>
              </FilterField>
            )}
            <FilterField id="filter-round-basis" label="Cơ sở phân bổ">
              <select
                id="filter-round-basis"
                className={CONTROL}
                value={roundBasisFilter}
                onChange={(e) => setRoundBasisFilter(e.target.value)}
              >
                <option value="ALL">Tất cả phương thức</option>
                {ALLOCATION_BASIS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FilterField>
          </FilterBar>

          <div className="table-card">
            <div className="table-toolbar">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Danh sách đợt thu quỹ bảo trì ({filteredRounds.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Mỗi đợt thu gắn với một kỳ thu nháp và sinh dòng phí cho các căn hộ được chọn
                </p>
              </div>
              {canWriteRounds && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setRoundModalDefaultFundId(roundFundFilter !== 'ALL' ? roundFundFilter : (selectedFundId || ''))}
                  disabled={overview.funds.length === 0}
                >
                  <PlusIcon size={15} />
                  <span>Tạo đợt thu mới</span>
                </button>
              )}
            </div>

            {loadingOverview ? (
              <div className="empty-state-box py-10">
                <div className="loading-spinner-ring" />
                <p className="text-sm text-slate-600">Đang tải danh sách đợt thu…</p>
              </div>
            ) : (
              <MaintenanceRoundsTable
                rounds={filteredRounds}
                fundsById={fundsById}
                showFundColumn
                canReadPayments={canReadPayments}
                emptyAction={
                  canWriteRounds && overview.funds.length > 0 ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setRoundModalDefaultFundId(selectedFundId || '')}
                    >
                      <PlusIcon size={15} />
                      <span>Tạo đợt thu mới</span>
                    </button>
                  ) : null
                }
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {canWriteFunds && (
        <MaintenanceFundCreateModal
          isOpen={showFundModal}
          onClose={() => setShowFundModal(false)}
          onSuccess={(created) => {
            setSuccessMsg(`Đã tạo quỹ bảo trì ${created?.code || ''} (${created?.name || ''}) thành công!`)
            refreshAll()
            if (created?.id) {
              setSearchParams({ tab: 'report', quy: created.id })
            }
          }}
        />
      )}

      {canWriteRounds && roundModalDefaultFundId !== null && (
        <MaintenanceRoundCreateModal
          isOpen
          onClose={() => setRoundModalDefaultFundId(null)}
          funds={overview.funds}
          defaultFundId={roundModalDefaultFundId}
          onSuccess={(created) => {
            const count = created?.allocations?.length ?? 0
            setSuccessMsg(`Đã tạo đợt thu "${created?.description || ''}" và phân bổ cho ${count} cư trú vào kỳ thu nháp!`)
            refreshAll()
            if (created?.fundId && activeTab === 'funds') {
              setSearchParams({ tab: 'report', quy: created.fundId })
            }
          }}
        />
      )}

      {canRecordExpense && expenseModalFund && (
        <MaintenanceExpenseRecordModal
          isOpen
          onClose={() => setExpenseModalFund(null)}
          fund={expenseModalFund}
          onSuccess={(created) => {
            setSuccessMsg(`Đã ghi nhận khoản chi "${created?.description || ''}" (${formatMoney(toCents(created?.amount))}) thành công!`)
            refreshAll()
          }}
        />
      )}
    </div>
  )
}
