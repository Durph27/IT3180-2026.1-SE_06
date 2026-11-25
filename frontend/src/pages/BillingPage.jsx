import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  getBillingPeriodsApi,
  getContributionCampaignsApi,
  getFeeTypesApi,
  getInvoicesApi,
  getOpenInvoicesApi,
} from '../api/billing'
import { apiErrorMessage } from '../api/errors'
import { useAuth } from '../hooks/useAuth'
import BillingPeriodSelector from '../components/BillingPeriodSelector'
import DueDateAlertBanner from '../components/DueDateAlertBanner'
import FeeItemTable from '../components/FeeItemTable'
import ForbiddenView from '../components/ForbiddenView'
import PermissionGate from '../components/PermissionGate'
import PageHeader from '../components/PageHeader'
import FilterBar from '../components/FilterBar'
import StatCard from '../components/StatCard'
import { BuildingIcon, CheckCircleIcon, ReceiptIcon } from '../components/Icons'
import StaffPeriodsTab from '../components/billing/StaffPeriodsTab'
import FeeTableTab from '../components/billing/FeeTableTab'
import OutstandingPeriods from '../components/OutstandingPeriods'
import { classifyFeeItems, collectDueAlerts, defaultPeriod, FEE_CATEGORY, formatMoney, STAFF_ROLES, summarizeOutstandingPeriods, summarizeTotals } from '../utils/billingUtils'
import { canAccess } from '../auth/rbac'

export default function BillingPage({ onBack }) {
  const { householdIds, hasRole } = useAuth()
  const [selectedHousehold, setSelectedHousehold] = useState('')
  const buildingWide = STAFF_ROLES.some((role) => hasRole(role))
  if (buildingWide) return <StaffBilling onBack={onBack} />
  const householdId = householdIds.includes(selectedHousehold) ? selectedHousehold : householdIds[0]
  const denied = <ForbiddenView onBack={onBack} />
  return (
    <PermissionGate permission="invoice.read" householdId={householdId} fallback={denied}>
      <PermissionGate permission="billing-period.read" householdId={householdId} fallback={denied}>
        <BillingContent key={householdId} householdId={householdId} householdOptions={householdIds} onSelectHousehold={setSelectedHousehold} />
      </PermissionGate>
    </PermissionGate>
  )
}

const STAFF_TABS = Object.freeze([
  { id: 'dot-thu', label: 'Đợt thu', allowed: (auth) => canAccess(auth, 'invoice.read') && canAccess(auth, 'billing-period.read') },
  { id: 'bang-phi', label: 'Bảng phí', allowed: (auth) => canAccess(auth, 'fee-type.read') && canAccess(auth, 'fee-rate.read') },
])

// Staff work in two places only: send this month's bills, and keep the price list current.
function StaffBilling({ onBack }) {
  const auth = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs = STAFF_TABS.filter((tab) => tab.allowed(auth))
  if (auth.isLoading) return null
  if (tabs.length === 0) return <ForbiddenView onBack={onBack} />
  const active = tabs.find((tab) => tab.id === searchParams.get('tab'))?.id ?? tabs[0].id
  const select = (id) => setSearchParams({ tab: id })
  return (
    <div className="user-management-container">
      <PageHeader title="Khoản thu" description="Lập phiếu báo phí hằng tháng, theo dõi thu tiền và quản lý bảng phí của chung cư." />
      {tabs.length > 1 && (
        <div className="filter-buttons-group w-fit max-w-full flex-wrap" role="tablist" aria-label="Khoản thu">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`billing-tab-${tab.id}`}
              aria-selected={active === tab.id}
              aria-controls={`billing-panel-${tab.id}`}
              className={`filter-btn ${active === tab.id ? 'active' : ''}`}
              onClick={() => select(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel" id={`billing-panel-${active}`} aria-labelledby={`billing-tab-${active}`}>
        {active === 'dot-thu'
          ? <StaffPeriodsTab onOpenFees={tabs.some((tab) => tab.id === 'bang-phi') ? () => select('bang-phi') : undefined} />
          : <FeeTableTab />}
      </div>
    </div>
  )
}

// Residents only ever see bills that were sent to them: draft periods stay with the accountant.
function BillingContent({ householdId, householdOptions, onSelectHousehold }) {
  const { hasPermission } = useAuth()
  const scope = { householdId }
  const canReadFeeTypes = hasPermission('fee-type.read', scope)
  const canReadCampaigns = hasPermission('campaign.read', scope)

  const [catalog, setCatalog] = useState(null)
  const [loaded, setLoaded] = useState({ key: null, invoices: [] })
  const [openInvoices, setOpenInvoices] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedCode = searchParams.get('ky')
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([
      getBillingPeriodsApi(signal),
      canReadFeeTypes ? getFeeTypesApi(signal) : [],
      canReadCampaigns ? getContributionCampaignsApi(signal) : [],
    ]).then(([periods, feeTypes, campaigns]) => {
      if (!signal.aborted) setCatalog({ periods: periods.filter((period) => period.status !== 'DRAFT'), feeTypes, campaigns })
    }).catch((err) => {
      if (!signal.aborted) setError(apiErrorMessage(err, 'Không thể tải danh mục kỳ thu.'))
    })
    return () => controller.abort()
  }, [canReadFeeTypes, canReadCampaigns, version])

  const selectedPeriod = catalog ? catalog.periods.find((period) => period.code === selectedCode) ?? defaultPeriod(catalog.periods) : null
  // Households load their full history so an older unpaid bill still raises the banner.
  const invoiceKey = `${householdId}|${version}`

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    getInvoicesApi({ householdId }, signal).then((invoices) => {
      if (!signal.aborted) setLoaded({ key: invoiceKey, invoices })
    }).catch((err) => {
      if (!signal.aborted) setError(apiErrorMessage(err, 'Không thể tải phiếu báo phí.'))
    })
    return () => controller.abort()
  }, [householdId, invoiceKey])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    getOpenInvoicesApi({ householdId }, signal).then((rows) => {
      if (!signal.aborted) setOpenInvoices(rows)
    }).catch((err) => {
      if (!signal.aborted) setError(apiErrorMessage(err, 'Không thể tải danh sách kỳ còn nợ.'))
    })
    return () => controller.abort()
  }, [householdId, version])

  const outstanding = useMemo(() => (catalog && openInvoices ? summarizeOutstandingPeriods({ invoices: openInvoices, feeTypes: catalog.feeTypes, periods: catalog.periods }) : null), [catalog, openInvoices])
  const invoices = useMemo(() => (loaded.key === invoiceKey ? loaded.invoices : []), [loaded, invoiceKey])
  const items = useMemo(() => (catalog && selectedPeriod ? classifyFeeItems({ invoices, feeTypes: catalog.feeTypes, campaigns: catalog.campaigns, period: selectedPeriod }) : []), [catalog, invoices, selectedPeriod])
  const alerts = useMemo(() => (catalog ? collectDueAlerts({ invoices, feeTypes: catalog.feeTypes, periods: catalog.periods }) : []), [catalog, invoices])
  const totals = summarizeTotals(items)
  const mandatoryItems = items.filter((item) => item.category === FEE_CATEGORY.MANDATORY)
  const voluntaryItems = items.filter((item) => item.category === FEE_CATEGORY.VOLUNTARY)
  const loading = !error && (catalog === null || loaded.key !== invoiceKey)

  const selectPeriod = (periodId) => {
    setSearchParams({ ky: catalog.periods.find((period) => period.id === periodId).code })
  }

  const retry = () => {
    setError('')
    setVersion((value) => value + 1)
  }

  return (
    <div className="user-management-container">
      <DueDateAlertBanner alerts={alerts} />
      <PageHeader title="Khoản thu" description="Các khoản thu của hộ gia đình theo từng tháng." />

      {error && <div className="alert alert-error" role="alert"><div>{error} <button type="button" className="btn btn-outline" onClick={retry}>Thử lại</button></div></div>}

      {outstanding && <OutstandingPeriods summary={outstanding} selectedId={selectedPeriod?.id} onSelect={selectPeriod} showInvoiceCount={false} />}

      {(householdOptions.length > 1 || selectedPeriod) && (
        <FilterBar>
          {householdOptions.length > 1 && (
            <div className="household-select-field">
              <label htmlFor="billing-household">Hộ gia đình</label>
              <select id="billing-household" className="form-control block min-h-11 w-full" value={householdId} onChange={(event) => onSelectHousehold(event.target.value)}>
                {householdOptions.map((id, index) => <option key={id} value={id}>Hộ {index + 1}</option>)}
              </select>
            </div>
          )}
          {selectedPeriod && <BillingPeriodSelector periods={catalog.periods} value={selectedPeriod.id} onChange={selectPeriod} />}
        </FilterBar>
      )}

      {loading && <p role="status">Đang tải khoản thu…</p>}
      {catalog?.periods.length === 0 && <p className="alert alert-info">Chưa có phiếu báo phí nào được gửi.</p>}

      {selectedPeriod && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Tổng phí bắt buộc" value={formatMoney(totals.mandatory)} icon={ReceiptIcon} />
            <StatCard label="Tổng đóng góp tự nguyện" value={formatMoney(totals.voluntary)} icon={CheckCircleIcon} />
            <StatCard label="Số khoản trong kỳ" value={items.length} icon={BuildingIcon} />
          </div>
          <FeeItemTable key={`mandatory-${selectedPeriod.id}`} category={FEE_CATEGORY.MANDATORY} items={mandatoryItems} total={totals.mandatory} />
          <FeeItemTable key={`voluntary-${selectedPeriod.id}`} category={FEE_CATEGORY.VOLUNTARY} items={voluntaryItems} total={totals.voluntary} />
        </>
      )}
    </div>
  )
}
