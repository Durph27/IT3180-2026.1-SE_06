import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import {
  getBillingPeriodsApi,
  getContributionCampaignsApi,
  getFeeTypesApi,
  getInvoicesApi,
  getOpenInvoicesApi,
} from '../api/billing'
import { apiErrorMessage } from '../api/errors'
import { useAuth } from '../hooks/useAuth'
import { placeOptionLabel, useHouseholdPlaces } from '../hooks/useHouseholdPlaces'
import BillingPeriodSelector from '../components/BillingPeriodSelector'
import DueDateAlertBanner from '../components/DueDateAlertBanner'
import FeeItemTable from '../components/FeeItemTable'
import ForbiddenView from '../components/ForbiddenView'
import PermissionGate from '../components/PermissionGate'
import PageHeader from '../components/PageHeader'
import FilterBar from '../components/FilterBar'
import StatCard from '../components/StatCard'
import { BuildingIcon, ReceiptIcon } from '../components/Icons'
import StaffPeriodsTab from '../components/billing/StaffPeriodsTab'
import OutstandingPeriods from '../components/OutstandingPeriods'
import ResidentContributions from '../components/contributions/ResidentContributions'
import { classifyFeeItems, collectDueAlerts, defaultPeriod, FEE_CATEGORY, formatMoney, STAFF_ROLES, summarizeOutstandingPeriods, summarizeTotals } from '../utils/billingUtils'
import { canAccess } from '../auth/rbac'
import { ROUTES } from '../routes'

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

// Staff send this month's bills here; the price list is its own page ("Phí cố định").
function StaffBilling({ onBack }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  if (auth.isLoading) return null
  // Old links to the price-list tab land on the page that replaced it.
  if (searchParams.get('tab') === 'bang-phi') return <Navigate to={ROUTES.fixedFees} replace />
  if (!canAccess(auth, 'invoice.read') || !canAccess(auth, 'billing-period.read')) return <ForbiddenView onBack={onBack} />
  const canOpenFees = canAccess(auth, 'fee-type.read') && canAccess(auth, 'fee-rate.read')
  return (
    <div className="user-management-container">
      <PageHeader title="Đợt thu" description="Lập và gửi phiếu báo phí hằng tháng, theo dõi thu tiền và khóa sổ từng tháng." />
      <StaffPeriodsTab onOpenFees={canOpenFees ? () => navigate(ROUTES.fixedFees) : undefined} />
    </div>
  )
}

// Residents only ever see bills that were sent to them: draft periods stay with the accountant.
function BillingContent({ householdId, householdOptions, onSelectHousehold }) {
  const { hasPermission } = useAuth()
  const scope = { householdId }
  const canReadFeeTypes = hasPermission('fee-type.read', scope)
  const canReadCampaigns = hasPermission('campaign.read', scope)

  const placeLabels = useHouseholdPlaces(householdOptions, householdOptions.length > 1)
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
  const items = useMemo(() => (catalog && selectedPeriod ? classifyFeeItems({ invoices, feeTypes: catalog.feeTypes, campaigns: [], period: selectedPeriod }) : []), [catalog, invoices, selectedPeriod])
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
                {householdOptions.map((id, index) => <option key={id} value={id}>{placeOptionLabel(placeLabels, id, index, householdOptions.length)}</option>)}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Tổng phải đóng tháng này" value={formatMoney(totals.mandatory)} icon={ReceiptIcon} />
            <StatCard label="Số khoản trong phiếu" value={items.length} icon={BuildingIcon} />
          </div>
          <FeeItemTable key={`mandatory-${selectedPeriod.id}`} category={FEE_CATEGORY.MANDATORY} items={mandatoryItems} total={totals.mandatory} />
          {voluntaryItems.length > 0 && <FeeItemTable key={`voluntary-${selectedPeriod.id}`} category={FEE_CATEGORY.VOLUNTARY} items={voluntaryItems} total={totals.voluntary} />}
        </>
      )}

      {catalog && (
        <ResidentContributions campaigns={catalog.campaigns} householdId={householdId} canReadContributions={hasPermission('contribution.read', scope)} />
      )}
    </div>
  )
}
