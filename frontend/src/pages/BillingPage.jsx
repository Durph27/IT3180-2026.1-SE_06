import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  getBillingPeriodsApi,
  getContributionCampaignsApi,
  getFeeTypesApi,
  getInvoicesApi,
  getOpenInvoicesApi,
  generateInvoicesApi,
  issueBillingPeriodApi,
  deleteInvoiceLineApi,
  cancelInvoiceApi,
  closeBillingPeriodApi,
} from '../api/billing'
import { getAllApartmentsApi } from '../api/apartments'
import { getAllHouseholdsApi, getActiveOccupanciesApi } from '../api/households'
import { apiErrorMessage } from '../api/errors'
import { useAuth } from '../hooks/useAuth'
import BillingPeriodSelector from '../components/BillingPeriodSelector'
import BillingPeriodCreateModal from '../components/BillingPeriodCreateModal'
import DueDateAlertBanner from '../components/DueDateAlertBanner'
import FeeItemTable from '../components/FeeItemTable'
import ForbiddenView from '../components/ForbiddenView'
import PermissionGate from '../components/PermissionGate'
import PageHeader from '../components/PageHeader'
import FilterBar from '../components/FilterBar'
import StatCard from '../components/StatCard'
import InvoiceListTable from '../components/InvoiceListTable'
import AccountingReconciliation from '../components/AccountingReconciliation'
import IssuePeriodModal from '../components/IssuePeriodModal'
import RecordPaymentModal from '../components/RecordPaymentModal'
import ReceiptModal from '../components/ReceiptModal'
import CreateBillingPeriodModal from '../components/CreateBillingPeriodModal'
import AddInvoiceLineModal from '../components/AddInvoiceLineModal'
import CancelInvoiceModal from '../components/CancelInvoiceModal'
import {
  AlertTriangleIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  LockIcon,
  PlusIcon,
  ReceiptIcon,
  RefreshIcon,
} from '../components/Icons'
import StatusBadge from '../components/StatusBadge'
import OutstandingPeriods from '../components/OutstandingPeriods'
import {
  classifyFeeItems,
  collectDueAlerts,
  defaultPeriod,
  FEE_CATEGORY,
  formatMoney,
  formatDate,
  periodMonthLabel,
  reconcileInvoices,
  STAFF_ROLES,
  summarizeOutstandingPeriods,
  summarizeTotals,
} from '../utils/billingUtils'

export default function BillingPage({ onBack }) {
  const { householdIds, hasRole } = useAuth()
  const [selectedHousehold, setSelectedHousehold] = useState('')
  const buildingWide = STAFF_ROLES.some((role) => hasRole(role))
  const householdId = buildingWide ? undefined : householdIds.includes(selectedHousehold) ? selectedHousehold : householdIds[0]
  const denied = <ForbiddenView onBack={onBack} />
  return (
    <PermissionGate permission="invoice.read" householdId={householdId} fallback={denied}>
      <PermissionGate permission="billing-period.read" householdId={householdId} fallback={denied}>
        <BillingContent
          key={householdId ?? 'building'}
          householdId={householdId}
          householdOptions={buildingWide ? [] : householdIds}
          onSelectHousehold={setSelectedHousehold}
          buildingWide={buildingWide}
        />
      </PermissionGate>
    </PermissionGate>
  )
}

function BillingContent({ householdId, householdOptions, onSelectHousehold, buildingWide = false }) {
  const { hasPermission } = useAuth()
  const scope = householdId ? { householdId } : undefined
  const canReadFeeTypes = hasPermission('fee-type.read', scope)
  const canReadCampaigns = hasPermission('campaign.read', scope)
  const canGenerateInvoices = hasPermission('invoice.generate')
  const canIssuePeriod = hasPermission('billing-period.issue')
  const canClosePeriod = hasPermission('billing-period.close')
  const canReadApartments = hasPermission('apartment.read')
  const canReadHouseholds = hasPermission('household.read')
  const canReadOccupancies = hasPermission('occupancy.read')
  const canRecordPayment = hasPermission('payment.record')
  const canWritePeriod = hasPermission('billing-period.write')
  const canWriteInvoice = hasPermission('invoice.write')
  const canCancelInvoice = hasPermission('invoice.cancel') || hasPermission('invoice.write')
  const isStaff = !householdId && (canWritePeriod || canGenerateInvoices || canIssuePeriod || canClosePeriod)

  const [catalog, setCatalog] = useState(null)
  const [loaded, setLoaded] = useState({ key: null, invoices: [] })
  const [openInvoices, setOpenInvoices] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedCode = searchParams.get('ky')
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  // Active view tab for staff
  const [activeTab, setActiveTab] = useState('invoices') // 'invoices' | 'reconciliation' | 'categories'

  // Billing period creation modal
  const [isCreatePeriodOpen, setIsCreatePeriodOpen] = useState(false)

  // Invoice lines mutation modal
  const [isAddLineOpen, setIsAddLineOpen] = useState(false)
  const [selectedInvoiceForLine, setSelectedInvoiceForLine] = useState(null)

  // Cancel invoice modal
  const [isCancelInvoiceOpen, setIsCancelInvoiceOpen] = useState(false)
  const [selectedInvoiceToCancel, setSelectedInvoiceToCancel] = useState(null)
  const [isCancellingInvoice, setIsCancellingInvoice] = useState(false)

  // Batch operations state
  const [isGenerating, setIsGenerating] = useState(false)
  const [isIssuing, setIsIssuing] = useState(false)
  const [batchError, setBatchError] = useState('')
  const [batchSuccess, setBatchSuccess] = useState(null)
  const [isConfirmIssueOpen, setIsConfirmIssueOpen] = useState(false)

  // Quick payment collection state
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false)
  const [quickPayInvoice, setQuickPayInvoice] = useState(null)
  const [quickPayHouseholdId, setQuickPayHouseholdId] = useState('')
  const [quickPayReceipt, setQuickPayReceipt] = useState(null)
  const [quickPayPayment, setQuickPayPayment] = useState(null)
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)

  // Residence metadata mappings (apartment/household codes for occupancyId)
  const [residenceMaps, setResidenceMaps] = useState({ apartments: {}, households: {} })
  const [rawResidenceData, setRawResidenceData] = useState({ apartments: [], households: [], occupancies: [] })

  // Actions & Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [actionError, setActionError] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const confirmDialogRef = useRef(null)

  useEffect(() => {
    const dialog = confirmDialogRef.current
    if (!dialog) return
    if (confirmAction) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [confirmAction])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([
      getBillingPeriodsApi(signal),
      canReadFeeTypes ? getFeeTypesApi(signal) : [],
      canReadCampaigns ? getContributionCampaignsApi(signal) : [],
    ]).then(([periods, feeTypes, campaigns]) => {
      if (!signal.aborted) setCatalog({ periods, feeTypes, campaigns })
    }).catch((err) => {
      if (!signal.aborted) setError(apiErrorMessage(err, 'Không thể tải danh mục kỳ thu.'))
    })
    return () => controller.abort()
  }, [canReadFeeTypes, canReadCampaigns, version])

  const selectedPeriod = catalog ? catalog.periods.find((period) => period.code === selectedCode) ?? defaultPeriod(catalog.periods) : null
  const periodFilter = householdId ? undefined : selectedPeriod?.id
  const invoiceKey = `${householdId ?? ''}|${periodFilter ?? ''}|${version}`
  const canLoadInvoices = Boolean(householdId || periodFilter)

  useEffect(() => {
    if (!canLoadInvoices) return undefined
    const controller = new AbortController()
    const { signal } = controller
    getInvoicesApi(householdId ? { householdId } : { periodId: periodFilter }, signal).then((invoices) => {
      if (!signal.aborted) setLoaded({ key: invoiceKey, invoices })
    }).catch((err) => {
      if (!signal.aborted) setError(apiErrorMessage(err, 'Không thể tải bảng kê.'))
    })
    return () => controller.abort()
  }, [canLoadInvoices, householdId, periodFilter, invoiceKey])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    getOpenInvoicesApi(householdId ? { householdId } : {}, signal).then((rows) => {
      if (!signal.aborted) setOpenInvoices(rows)
    }).catch((err) => {
      if (!signal.aborted) setError(apiErrorMessage(err, 'Không thể tải danh sách kỳ còn nợ.'))
    })
    return () => controller.abort()
  }, [householdId, version])

  // Optionally load residence mappings in staff mode for user-friendly room codes
  useEffect(() => {
    if (!buildingWide || (!canReadApartments && !canReadHouseholds && !canReadOccupancies)) return undefined
    const controller = new AbortController()
    const { signal } = controller

    Promise.allSettled([
      canReadApartments ? getAllApartmentsApi({ signal }) : Promise.resolve([]),
      canReadHouseholds ? getAllHouseholdsApi(signal) : Promise.resolve([]),
      canReadOccupancies ? getActiveOccupanciesApi(undefined, signal) : Promise.resolve([]),
    ]).then(([aptRes, hhRes, occRes]) => {
      if (signal.aborted) return
      const apartments = aptRes.status === 'fulfilled' && Array.isArray(aptRes.value) ? aptRes.value : []
      const households = hhRes.status === 'fulfilled' && Array.isArray(hhRes.value) ? hhRes.value : []
      const occupancies = occRes.status === 'fulfilled' && Array.isArray(occRes.value) ? occRes.value : []

      const aptById = new Map(apartments.map((a) => [a.id, a]))
      const hhById = new Map(households.map((h) => [h.id, h]))

      const aptMap = {}
      const hhMap = {}
      for (const occ of occupancies) {
        if (occ.apartmentId && aptById.has(occ.apartmentId)) {
          aptMap[occ.id] = aptById.get(occ.apartmentId)
        }
        if (occ.householdId && hhById.has(occ.householdId)) {
          hhMap[occ.id] = hhById.get(occ.householdId)
        }
      }
      setResidenceMaps({ apartments: aptMap, households: hhMap })
      setRawResidenceData({ apartments, households, occupancies })
    })

    return () => controller.abort()
  }, [buildingWide, canReadApartments, canReadHouseholds, canReadOccupancies])

  const outstanding = useMemo(() => (catalog && openInvoices ? summarizeOutstandingPeriods({ invoices: openInvoices, feeTypes: catalog.feeTypes, periods: catalog.periods }) : null), [catalog, openInvoices])
  const invoices = useMemo(() => (loaded.key === invoiceKey ? loaded.invoices : []), [loaded, invoiceKey])
  const items = useMemo(() => (catalog && selectedPeriod ? classifyFeeItems({ invoices, feeTypes: catalog.feeTypes, campaigns: catalog.campaigns, period: selectedPeriod }) : []), [catalog, invoices, selectedPeriod])
  const alerts = useMemo(() => (catalog ? collectDueAlerts({ invoices, feeTypes: catalog.feeTypes, periods: catalog.periods }) : []), [catalog, invoices])
  const totals = summarizeTotals(items)
  const mandatoryItems = items.filter((item) => item.category === FEE_CATEGORY.MANDATORY)
  const voluntaryItems = items.filter((item) => item.category === FEE_CATEGORY.VOLUNTARY)
  const loading = !error && (catalog === null || (canLoadInvoices && loaded.key !== invoiceKey))

  // Accounting reconciliation calculation
  const reconciliation = useMemo(() => {
    return reconcileInvoices(invoices, selectedPeriod)
  }, [invoices, selectedPeriod])

  const selectPeriod = (periodId) => {
    const found = catalog?.periods?.find((period) => period.id === periodId)
    if (found) {
      setSearchParams({ ky: found.code })
    }
  }

  const retry = () => {
    setError('')
    setBatchError('')
    setVersion((value) => value + 1)
  }

  // Batch invoice generation
  const handleGenerateInvoices = async () => {
    if (isGenerating || isIssuing || !selectedPeriod || selectedPeriod.status !== 'DRAFT') return
    setIsGenerating(true)
    setBatchError('')
    setBatchSuccess(null)
    const startTime = performance.now()
    try {
      const result = await generateInvoicesApi(selectedPeriod.id)
      const totalDuration = Math.round(performance.now() - startTime)
      const { createdCount = 0, existingCount = 0 } = result.data ?? {}
      setBatchSuccess({
        message: `Đã tính phí toàn tòa nhà thành công. Tạo mới: ${createdCount} bảng kê, Đã có: ${existingCount} bảng kê.`,
        apiDuration: result.apiDuration,
        totalDuration,
      })
      setVersion((v) => v + 1)
    } catch (err) {
      setBatchError(apiErrorMessage(err, 'Không thể tính phí toàn tòa nhà. Vui lòng thử lại.'))
    } finally {
      setIsGenerating(false)
    }
  }

  // Batch issue billing period
  const handleIssuePeriod = async () => {
    if (isGenerating || isIssuing || !selectedPeriod || selectedPeriod.status !== 'DRAFT') return
    setIsIssuing(true)
    setBatchError('')
    setBatchSuccess(null)
    const startTime = performance.now()
    try {
      const result = await issueBillingPeriodApi(selectedPeriod.id)
      const totalDuration = Math.round(performance.now() - startTime)
      setBatchSuccess({
        message: `Kỳ thu ${selectedPeriod.code} đã được phát hành thành công. Toàn bộ bảng kê đã có hiệu lực đối với cư dân.`,
        apiDuration: result.apiDuration,
        totalDuration,
      })
      setIsConfirmIssueOpen(false)
      setVersion((v) => v + 1)
    } catch (err) {
      setBatchError(apiErrorMessage(err, 'Không thể phát hành kỳ thu. Vui lòng thử lại.'))
    } finally {
      setIsIssuing(false)
    }
  }

  const handleQuickPay = (invoice, hhInfo) => {
    let targetHouseholdId = hhInfo?.id
    if (!targetHouseholdId && invoice.occupancyId) {
      const occ = rawResidenceData.occupancies.find((o) => o.id === invoice.occupancyId)
      if (occ?.householdId) {
        targetHouseholdId = occ.householdId
      }
    }
    setQuickPayHouseholdId(targetHouseholdId || '')
    setQuickPayInvoice(invoice)
    setIsRecordPaymentOpen(true)
  }

  const handlePaymentSuccess = (payment, receipt) => {
    setIsRecordPaymentOpen(false)
    setQuickPayInvoice(null)
    setQuickPayHouseholdId('')
    setBatchSuccess({
      message: `Đã thu tiền thành công. Mã phiếu thu: ${payment.paymentNo}.`,
      apiDuration: 0,
      totalDuration: 0,
    })
    setVersion((v) => v + 1)
    if (receipt) {
      setQuickPayReceipt(receipt)
      setQuickPayPayment(payment)
      setIsReceiptOpen(true)
    }
  }

  const handleOpenAddLine = (invoice) => {
    setSelectedInvoiceForLine(invoice)
    setIsAddLineOpen(true)
  }

  const handleAddLineSuccess = (newLine) => {
    setIsAddLineOpen(false)
    setSelectedInvoiceForLine(null)
    setBatchSuccess({
      message: `Đã thêm khoản phí "${newLine.description}" vào bảng kê thành công.`,
      apiDuration: 0,
      totalDuration: 0,
    })
    setVersion((v) => v + 1)
  }

  const handleDeleteLine = async (invoice, lineId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa dòng phí này khỏi bảng kê?')) {
      return
    }
    try {
      await deleteInvoiceLineApi(invoice.id, lineId, { version: invoice.version })
      setBatchSuccess({
        message: `Đã xóa dòng phí khỏi bảng kê ${invoice.invoiceNo}.`,
        apiDuration: 0,
        totalDuration: 0,
      })
      setVersion((v) => v + 1)
    } catch (err) {
      setBatchError(apiErrorMessage(err, 'Không thể xóa dòng phí. Vui lòng thử lại.'))
    }
  }

  const handleOpenCancelInvoice = (invoice) => {
    setSelectedInvoiceToCancel(invoice)
    setIsCancelInvoiceOpen(true)
  }

  const handleConfirmCancelInvoice = async () => {
    if (!selectedInvoiceToCancel || isCancellingInvoice) return
    setIsCancellingInvoice(true)
    try {
      await cancelInvoiceApi(selectedInvoiceToCancel.id, { version: selectedInvoiceToCancel.version })
      setIsCancelInvoiceOpen(false)
      setSelectedInvoiceToCancel(null)
      setBatchSuccess({
        message: `Đã hủy bảng kê ${selectedInvoiceToCancel.invoiceNo} thành công.`,
        apiDuration: 0,
        totalDuration: 0,
      })
      setVersion((v) => v + 1)
    } catch (err) {
      setBatchError(apiErrorMessage(err, 'Không thể hủy bảng kê. Vui lòng thử lại.'))
    } finally {
      setIsCancellingInvoice(false)
    }
  }

  const isBatchBusy = isGenerating || isIssuing

  const headerActions = buildingWide ? (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={retry}
        disabled={isBatchBusy || loading}
        title="Làm mới dữ liệu kỳ thu"
      >
        <RefreshIcon size={16} />
        <span>Làm mới</span>
      </button>

      {canWritePeriod && (
        <button
          type="button"
          className="btn btn-secondary inline-flex items-center gap-1.5"
          onClick={() => setIsCreatePeriodOpen(true)}
          disabled={isBatchBusy}
          title="Tạo kỳ thu phí mới"
        >
          <PlusIcon size={16} />
          <span>Tạo kỳ thu mới</span>
        </button>
      )}

      {canGenerateInvoices && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleGenerateInvoices}
          disabled={isBatchBusy || !selectedPeriod || selectedPeriod.status !== 'DRAFT'}
          title={
            selectedPeriod?.status !== 'DRAFT'
              ? 'Chỉ có thể lập bảng kê cho kỳ thu ở trạng thái Bản nháp'
              : 'Tự động tính phí toàn tòa nhà cho kỳ thu này'
          }
        >
          {isGenerating ? (
            <>
              <span className="loading-spinner-ring" aria-hidden="true" />
              <span>Đang tính phí…</span>
            </>
          ) : (
            <>
              <ReceiptIcon size={16} />
              <span>Tính phí toàn tòa nhà</span>
            </>
          )}
        </button>
      )}

      {canIssuePeriod && selectedPeriod?.status === 'DRAFT' && invoices.length > 0 && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsConfirmIssueOpen(true)}
          disabled={isBatchBusy}
          title="Phát hành kỳ thu và các bảng kê"
        >
          <CheckCircleIcon size={16} />
          <span>Phát hành kỳ thu</span>
        </button>
      )}
    </div>
  ) : null

  const executeIssuePeriod = async () => {
    if (!selectedPeriod) return
    setActionLoading('issuing')
    setActionError('')
    setActionSuccess('')
    setConfirmAction(null)
    try {
      await issueBillingPeriodApi(selectedPeriod.id)
      setActionSuccess(`Phát hành kỳ thu ${selectedPeriod.code} thành công! Toàn bộ bảng kê đã chuyển sang trạng thái Đã phát hành.`)
      setVersion((v) => v + 1)
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Không thể phát hành kỳ thu. Vui lòng kiểm tra lại.'))
    } finally {
      setActionLoading('')
    }
  }

  const executeClosePeriod = async () => {
    if (!selectedPeriod) return
    setActionLoading('closing')
    setActionError('')
    setActionSuccess('')
    setConfirmAction(null)
    try {
      await closeBillingPeriodApi(selectedPeriod.id)
      setActionSuccess(`Đã khóa kỳ thu ${selectedPeriod.code}.`)
      setVersion((v) => v + 1)
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Không thể khóa kỳ thu. Vui lòng thử lại.'))
    } finally {
      setActionLoading('')
    }
  }

  return (
    <div className="user-management-container">
      <DueDateAlertBanner alerts={alerts} />
      <PageHeader
        title="Khoản thu"
        description={householdId ? 'Các khoản thu của hộ gia đình theo từng kỳ.' : 'Các khoản thu toàn chung cư theo từng kỳ.'}
        actions={headerActions}
      />

      {error && (
        <div className="alert alert-error" role="alert">
          <div>
            {error}{' '}
            <button type="button" className="btn btn-outline" onClick={retry}>
              Thử lại
            </button>
          </div>
        </div>
      )}

      {batchSuccess && (
        <div className="alert alert-success flex items-start justify-between gap-3" role="status">
          <div className="flex items-start gap-2">
            <CheckCircleIcon size={18} className="mt-0.5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-semibold text-emerald-950">{batchSuccess.message}</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Thời gian gọi API: <strong>{batchSuccess.apiDuration} ms</strong> · Tổng thời gian frontend: <strong>{batchSuccess.totalDuration} ms</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-emerald-900 underline hover:no-underline"
            onClick={() => setBatchSuccess(null)}
          >
            Đóng
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="alert alert-success flex items-start justify-between gap-3" role="status">
          <div className="flex items-start gap-2">
            <CheckCircleIcon size={18} className="mt-0.5 shrink-0 text-emerald-700" />
            <p className="font-semibold text-emerald-950">{actionSuccess}</p>
          </div>
          <button type="button" className="text-xs font-semibold text-emerald-900 underline hover:no-underline" onClick={() => setActionSuccess('')}>
            Đóng
          </button>
        </div>
      )}

      {actionError && (
        <div className="alert alert-error flex items-start justify-between gap-3" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon size={18} className="mt-0.5 shrink-0" />
            <div>{actionError}</div>
          </div>
          <button type="button" className="text-xs font-semibold text-rose-900 underline hover:no-underline" onClick={() => setActionError('')}>
            Đóng
          </button>
        </div>
      )}

      {batchError && (
        <div className="alert alert-error flex items-start justify-between gap-3" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon size={18} className="mt-0.5 shrink-0" />
            <div>{batchError}</div>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-rose-900 underline hover:no-underline"
            onClick={() => setBatchError('')}
          >
            Đóng
          </button>
        </div>
      )}

      {outstanding && (
        <OutstandingPeriods
          summary={outstanding}
          selectedId={selectedPeriod?.id}
          onSelect={selectPeriod}
          showInvoiceCount={!householdId}
        />
      )}
      {(householdOptions.length > 1 || selectedPeriod) && (
        <FilterBar>
          {householdOptions.length > 1 && (
            <div className="household-select-field">
              <label htmlFor="billing-household">Hộ gia đình</label>
              <select
                id="billing-household"
                className="form-control block min-h-11 w-full"
                value={householdId}
                onChange={(event) => onSelectHousehold(event.target.value)}
              >
                {householdOptions.map((id, index) => (
                  <option key={id} value={id}>
                    Hộ {index + 1}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedPeriod && (
            <BillingPeriodSelector
              periods={catalog.periods}
              value={selectedPeriod.id}
              onChange={selectPeriod}
              disabled={isBatchBusy}
            />
          )}
        </FilterBar>
      )}

      {/* Notice for residents when viewing a DRAFT period */}
      {householdId && selectedPeriod?.status === 'DRAFT' && (
        <div className="alert alert-info my-3" role="status">
          <div>
            Kỳ thu này đang ở trạng thái <strong>Bản nháp</strong> và chưa được Ban quản trị phát hành.
            Số tiền và danh sách các khoản thu sẽ chính thức hiển thị sau khi kỳ thu được phát hành.
          </div>
        </div>
      )}

      {/* Staff Management Control Panel for Selected Period */}
      {isStaff && selectedPeriod && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">Quản lý kỳ thu:</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${selectedPeriod.status === 'DRAFT' ? 'bg-amber-100 text-amber-800' : selectedPeriod.status === 'ISSUED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-700 text-white'}`}>
                  {selectedPeriod.status === 'DRAFT' ? 'Bản nháp (DRAFT)' : selectedPeriod.status === 'ISSUED' ? 'Đã phát hành (ISSUED)' : 'Đã đóng (CLOSED)'}
                </span>
                <span className="text-xs text-slate-500">
                  • {invoices.length} bảng kê trong kỳ
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {selectedPeriod.status === 'DRAFT' && (
                  invoices.length === 0
                    ? 'Kỳ thu này chưa có bảng kê nào. Nhấn "Lập bảng kê nháp" để tự động tính tiền cho các căn hộ theo diện tích, nhân khẩu và biểu phí.'
                    : 'Bảng kê đang ở dạng nháp (cư dân chưa thấy số tiền). Nhấn "Phát hành kỳ thu" để chính thức công bố bảng kê và mở cổng thu phí.'
                )}
                {selectedPeriod.status === 'ISSUED' && 'Kỳ thu đã phát hành. Cư dân có thể xem và thực hiện nộp tiền phí.'}
                {selectedPeriod.status === 'CLOSED' && 'Kỳ thu đã khóa, không thể phát hành thêm bảng kê.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedPeriod.status === 'DRAFT' && canGenerateInvoices && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleGenerateInvoices}
                  disabled={Boolean(actionLoading)}
                  title="Quét diện tích, nhân khẩu và biểu phí để tự động tạo bảng kê nháp"
                >
                  <RefreshIcon size={16} />
                  <span>{actionLoading === 'generating' ? 'Đang lập bảng kê…' : 'Lập bảng kê nháp'}</span>
                </button>
              )}

              {selectedPeriod.status === 'DRAFT' && canIssuePeriod && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setConfirmAction('issue')}
                  disabled={Boolean(actionLoading) || invoices.length === 0}
                  title={invoices.length === 0 ? 'Cần lập bảng kê trước khi phát hành' : 'Phát hành toàn bộ bảng kê sang ISSUED'}
                >
                  <CheckCircleIcon size={16} />
                  <span>Phát hành kỳ thu</span>
                </button>
              )}

              {selectedPeriod.status === 'ISSUED' && canClosePeriod && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setConfirmAction('close')}
                  disabled={Boolean(actionLoading)}
                  title="Đóng kỳ thu sau khi hoàn tất"
                >
                  <LockIcon size={16} />
                  <span>Khóa kỳ thu</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {loading && <p role="status">Đang tải khoản thu…</p>}
      {catalog?.periods.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center my-4">
          <CalendarIcon size={36} className="mx-auto mb-2 text-slate-400" />
          <h3 className="text-base font-bold text-slate-900">Chưa có kỳ thu phí nào</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Để lập bảng kê và tính phí từ biểu phí bạn vừa tạo, vui lòng bấm nút dưới đây để tạo kỳ thu phí mới (ví dụ: Kỳ thu Tháng 11/2026).
          </p>
          {canWritePeriod && (
            <button
              type="button"
              className="btn btn-primary mt-4 inline-flex items-center gap-1.5"
              onClick={() => setIsCreatePeriodOpen(true)}
            >
              <PlusIcon size={16} />
              <span>Tạo kỳ thu mới</span>
            </button>
          )}
        </div>
      )}

      {selectedPeriod && (
        <div className="space-y-6">
          {/* Period Details & Warnings Card */}
          <div className="rounded-xl border border-solid border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4 border-0 border-b border-solid border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <CalendarIcon size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Kỳ thu {selectedPeriod.code} — {periodMonthLabel(selectedPeriod)}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Từ ngày {formatDate(selectedPeriod.startDate)} đến {formatDate(selectedPeriod.endDate)} · Ngày chốt số: {formatDate(selectedPeriod.snapshotDate)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  <span className="text-slate-500 block">Hạn nộp thanh toán</span>
                  <strong className="text-slate-900 font-semibold">{formatDate(selectedPeriod.dueDate)}</strong>
                </div>
                {selectedPeriod.status === 'ISSUED' && <StatusBadge tone="success">Đã phát hành</StatusBadge>}
                {selectedPeriod.status === 'DRAFT' && <StatusBadge tone="neutral">Bản nháp</StatusBadge>}
                {selectedPeriod.status === 'CLOSED' && <StatusBadge tone="neutral">Đã đóng</StatusBadge>}
              </div>
            </div>

            {selectedPeriod.status === 'CLOSED' && (
              <div className="mt-3 rounded-lg border border-solid border-slate-300 bg-slate-100 px-3.5 py-2.5 text-xs text-slate-700">
                Kỳ thu này đã khóa (Đã đóng). Toàn bộ dữ liệu bảng kê phát sinh và biểu phí được lưu trữ cố định, không thể chỉnh sửa hoặc phát sinh thêm.
              </div>
            )}
            {selectedPeriod.status === 'DRAFT' && invoices.length === 0 && (
              <div className="mt-3 rounded-lg border border-solid border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
                Kỳ thu đang ở trạng thái Bản nháp và chưa có bảng kê nào. Vui lòng nhấn nút <strong>“Tính phí toàn tòa nhà”</strong> để tự động lập bảng kê phát sinh từ định mức diện tích, nhân khẩu và biểu phí hiện hành.
              </div>
            )}
            {selectedPeriod.status === 'DRAFT' && invoices.length > 0 && (
              <div className="mt-3 rounded-lg border border-solid border-blue-300 bg-blue-50 px-3.5 py-2.5 text-xs text-blue-800">
                Kỳ thu đang ở trạng thái Bản nháp với {invoices.length} bảng kê. Kế toán cần kiểm tra đối chiếu tại tab <strong>“Đối chiếu kế toán”</strong> trước khi nhấn <strong>“Phát hành kỳ thu”</strong> để chính thức công khai đến cư dân.
              </div>
            )}
          </div>

          {/* Overview StatCards Area */}
          {buildingWide ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Căn hộ tính phí" value={reconciliation.uniqueApartmentsCount} icon={BuildingIcon} />
              <StatCard label="Tổng số bảng kê" value={reconciliation.totalInvoices} icon={ReceiptIcon} />
              <StatCard label="Tổng tiền phải thu" value={formatMoney(reconciliation.totalInvoiceAmount)} />
              <StatCard label="Tổng tiền đã thu" value={formatMoney(reconciliation.totalPaid)} tone="success" />
              <StatCard label="Tổng tiền còn nợ" value={formatMoney(reconciliation.totalOutstanding)} tone="warning" />
              <StatCard label="Bảng kê đã thanh toán" value={`${reconciliation.paidCount} / ${reconciliation.totalInvoices}`} tone="success" />
              <StatCard label="Bảng kê còn nợ" value={reconciliation.debtCount} tone="warning" />
              <StatCard
                label="Bảng kê quá hạn"
                value={reconciliation.overdueCount}
                tone={reconciliation.overdueCount > 0 ? 'error' : 'neutral'}
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Tổng phí bắt buộc" value={formatMoney(totals.mandatory)} icon={ReceiptIcon} />
              <StatCard label="Tổng đóng góp tự nguyện" value={formatMoney(totals.voluntary)} icon={CheckCircleIcon} />
              <StatCard label="Số khoản trong kỳ" value={items.length} icon={BuildingIcon} />
            </div>
          )}

          {/* View Tab Switcher for Staff */}
          {buildingWide ? (
            <div className="space-y-4">
              <div className="border-0 border-b border-solid border-slate-200" role="tablist" aria-label="Chế độ xem thu phí">
                <div className="flex gap-2">
                  <button
                    type="button"
                    role="tab"
                    id="tab-invoices"
                    aria-selected={activeTab === 'invoices'}
                    aria-controls="panel-invoices"
                    className={`border-0 border-b-2 border-solid px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                      activeTab === 'invoices'
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                    onClick={() => setActiveTab('invoices')}
                  >
                    Bảng kê phát sinh ({invoices.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="tab-reconciliation"
                    aria-selected={activeTab === 'reconciliation'}
                    aria-controls="panel-reconciliation"
                    className={`border-0 border-b-2 border-solid px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'reconciliation'
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                    onClick={() => setActiveTab('reconciliation')}
                  >
                    <span>Đối chiếu kế toán</span>
                    {reconciliation?.isMatched ? (
                      <span className="size-2 rounded-full bg-emerald-500" title="Khớp 100%" />
                    ) : (
                      <span className="size-2 rounded-full bg-rose-500" title="Có chênh lệch" />
                    )}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="tab-categories"
                    aria-selected={activeTab === 'categories'}
                    aria-controls="panel-categories"
                    className={`border-0 border-b-2 border-solid px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                      activeTab === 'categories'
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                    onClick={() => setActiveTab('categories')}
                  >
                    Khoản thu theo loại phí
                  </button>
                </div>
              </div>

              {activeTab === 'invoices' && (
                <div id="panel-invoices" role="tabpanel" aria-labelledby="tab-invoices">
                  <InvoiceListTable
                    invoices={invoices}
                    loading={loading}
                    error={error}
                    apartmentMap={residenceMaps.apartments}
                    householdMap={residenceMaps.households}
                    onRefresh={retry}
                    canRecordPayment={canRecordPayment}
                    onRecordPayment={handleQuickPay}
                    canWriteInvoice={canWriteInvoice}
                    onAddLine={handleOpenAddLine}
                    onDeleteLine={handleDeleteLine}
                    onCancelInvoice={canCancelInvoice ? handleOpenCancelInvoice : undefined}
                  />
                </div>
              )}

              {activeTab === 'reconciliation' && (
                <div id="panel-reconciliation" role="tabpanel" aria-labelledby="tab-reconciliation">
                  <AccountingReconciliation
                    reconciliation={reconciliation}
                    loading={loading}
                    error={error}
                    apartmentMap={residenceMaps.apartments}
                    householdMap={residenceMaps.households}
                  />
                </div>
              )}

              {activeTab === 'categories' && (
                <div id="panel-categories" role="tabpanel" aria-labelledby="tab-categories" className="space-y-6">
                  <FeeItemTable
                    key={`mandatory-${selectedPeriod.id}`}
                    category={FEE_CATEGORY.MANDATORY}
                    items={mandatoryItems}
                    total={totals.mandatory}
                  />
                  <FeeItemTable
                    key={`voluntary-${selectedPeriod.id}`}
                    category={FEE_CATEGORY.VOLUNTARY}
                    items={voluntaryItems}
                    total={totals.voluntary}
                  />
                </div>
              )}
            </div>
          ) : (
            <>
              <FeeItemTable
                key={`mandatory-${selectedPeriod.id}`}
                category={FEE_CATEGORY.MANDATORY}
                items={mandatoryItems}
                total={totals.mandatory}
              />
              <FeeItemTable
                key={`voluntary-${selectedPeriod.id}`}
                category={FEE_CATEGORY.VOLUNTARY}
                items={voluntaryItems}
                total={totals.voluntary}
              />
            </>
          )}
        </div>
      )}

      {/* Confirmation Modal for Issuing Period */}
      {isConfirmIssueOpen && (
        <IssuePeriodModal
          isOpen={isConfirmIssueOpen}
          period={selectedPeriod}
          reconciliation={reconciliation}
          isIssuing={isIssuing}
          onConfirm={handleIssuePeriod}
          onClose={() => setIsConfirmIssueOpen(false)}
        />
      )}

      {/* Quick Record Payment Modal */}
      {isRecordPaymentOpen && (
        <RecordPaymentModal
          isOpen={isRecordPaymentOpen}
          initialHouseholdId={quickPayHouseholdId}
          initialInvoice={quickPayInvoice}
          households={rawResidenceData.households}
          apartments={rawResidenceData.apartments}
          occupancies={rawResidenceData.occupancies}
          onClose={() => {
            setIsRecordPaymentOpen(false)
            setQuickPayInvoice(null)
            setQuickPayHouseholdId('')
          }}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Printable Electronic Receipt Modal */}
      {isReceiptOpen && quickPayReceipt && (
        <ReceiptModal
          isOpen={isReceiptOpen}
          receipt={quickPayReceipt}
          payment={quickPayPayment}
          onClose={() => {
            setIsReceiptOpen(false)
            setQuickPayReceipt(null)
            setQuickPayPayment(null)
          }}
        />
      )}

      {/* Create Billing Period Modal */}
      {isCreatePeriodOpen && (
        <CreateBillingPeriodModal
          isOpen={isCreatePeriodOpen}
          onClose={() => setIsCreatePeriodOpen(false)}
          onSuccess={(created) => {
            setIsCreatePeriodOpen(false)
            setSearchParams({ ky: created.code })
            setBatchSuccess({
              message: `Đã tạo thành công kỳ thu ${created.code}. Hãy nhấn "Tính phí toàn tòa nhà" để lập bảng kê!`,
              apiDuration: 0,
              totalDuration: 0,
            })
            setVersion((v) => v + 1)
          }}
        />
      )}

      {/* Add Invoice Line Modal */}
      {isAddLineOpen && selectedInvoiceForLine && (
        <AddInvoiceLineModal
          isOpen={isAddLineOpen}
          invoice={selectedInvoiceForLine}
          period={selectedPeriod}
          feeTypes={catalog?.feeTypes || []}
          apartment={selectedInvoiceForLine?.occupancyId ? residenceMaps.apartments[selectedInvoiceForLine.occupancyId] : null}
          onClose={() => {
            setIsAddLineOpen(false)
            setSelectedInvoiceForLine(null)
          }}
          onSuccess={handleAddLineSuccess}
        />
      )}

      {/* Cancel Invoice Modal */}
      {isCancelInvoiceOpen && selectedInvoiceToCancel && (
        <CancelInvoiceModal
          isOpen={isCancelInvoiceOpen}
          invoice={selectedInvoiceToCancel}
          isCancelling={isCancellingInvoice}
          onConfirm={handleConfirmCancelInvoice}
          onClose={() => {
            setIsCancelInvoiceOpen(false)
            setSelectedInvoiceToCancel(null)
          }}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <dialog
          ref={confirmDialogRef}
          className="native-modal-dialog"
          aria-labelledby="billing-confirm-title"
        >
          <div className="modal-dialog">
            <div className="dialog-header">
              <div className={`dialog-icon-circle ${confirmAction === 'issue' ? 'icon-success' : 'icon-danger'}`}>
                {confirmAction === 'issue' ? <CheckCircleIcon size={24} /> : <LockIcon size={24} />}
              </div>
              <h3 id="billing-confirm-title" className="dialog-title">
                {confirmAction === 'issue' ? 'Xác nhận phát hành kỳ thu' : 'Xác nhận khóa kỳ thu'}
              </h3>
              <p className="dialog-desc">
                {confirmAction === 'issue'
                  ? `Bạn có chắc chắn muốn phát hành kỳ thu ${selectedPeriod?.code}? Toàn bộ bảng kê nháp sẽ được công bố chính thức đến cư dân để bắt đầu thu phí.`
                  : `Bạn có chắc chắn muốn khóa kỳ thu ${selectedPeriod?.code}? Sau khi khóa sẽ không thể thay đổi thông tin kỳ thu.`}
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setConfirmAction(null)}
                disabled={Boolean(actionLoading)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className={`btn ${confirmAction === 'issue' ? 'btn-success' : 'btn-danger'}`}
                onClick={confirmAction === 'issue' ? executeIssuePeriod : executeClosePeriod}
                disabled={Boolean(actionLoading)}
              >
                {actionLoading ? 'Đang xử lý…' : (confirmAction === 'issue' ? 'Đồng ý phát hành' : 'Đồng ý khóa')}
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* Create Billing Period Modal */}
      {canWritePeriod && (
        <BillingPeriodCreateModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(created) => {
            setVersion((v) => v + 1)
            if (created?.code) {
              setSearchParams({ ky: created.code })
            }
            setActionSuccess(`Đã tạo kỳ thu ${created?.code || ''} thành công (trạng thái Bản nháp)! Bạn có thể bắt đầu lập bảng kê.`)
          }}
        />
      )}
    </div>
  )
}
