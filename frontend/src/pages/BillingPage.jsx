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
  closeBillingPeriodApi,
} from '../api/billing'
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
import {
  AlertTriangleIcon,
  BuildingIcon,
  CheckCircleIcon,
  LockIcon,
  PlusIcon,
  ReceiptIcon,
  RefreshIcon,
} from '../components/Icons'
import OutstandingPeriods from '../components/OutstandingPeriods'
import { classifyFeeItems, collectDueAlerts, defaultPeriod, FEE_CATEGORY, formatMoney, STAFF_ROLES, summarizeOutstandingPeriods, summarizeTotals } from '../utils/billingUtils'

export default function BillingPage({ onBack }) {
  const { householdIds, hasRole } = useAuth()
  const [selectedHousehold, setSelectedHousehold] = useState('')
  const buildingWide = STAFF_ROLES.some((role) => hasRole(role))
  const householdId = buildingWide ? undefined : householdIds.includes(selectedHousehold) ? selectedHousehold : householdIds[0]
  const denied = <ForbiddenView onBack={onBack} />
  return (
    <PermissionGate permission="invoice.read" householdId={householdId} fallback={denied}>
      <PermissionGate permission="billing-period.read" householdId={householdId} fallback={denied}>
        <BillingContent key={householdId ?? 'building'} householdId={householdId} householdOptions={buildingWide ? [] : householdIds} onSelectHousehold={setSelectedHousehold} />
      </PermissionGate>
    </PermissionGate>
  )
}

function BillingContent({ householdId, householdOptions, onSelectHousehold }) {
  const { hasPermission } = useAuth()
  const scope = householdId ? { householdId } : undefined
  const canReadFeeTypes = hasPermission('fee-type.read', scope)
  const canReadCampaigns = hasPermission('campaign.read', scope)
  const canWritePeriod = hasPermission('billing-period.write')
  const canGenerate = hasPermission('invoice.generate')
  const canIssue = hasPermission('billing-period.issue')
  const canClose = hasPermission('billing-period.close')
  const isStaff = !householdId && (canWritePeriod || canGenerate || canIssue || canClose)

  const [catalog, setCatalog] = useState(null)
  const [loaded, setLoaded] = useState({ key: null, invoices: [] })
  const [openInvoices, setOpenInvoices] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedCode = searchParams.get('ky')
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

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
  // Households load their full history so an older unpaid bill still raises the banner.
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

  const outstanding = useMemo(() => (catalog && openInvoices ? summarizeOutstandingPeriods({ invoices: openInvoices, feeTypes: catalog.feeTypes, periods: catalog.periods }) : null), [catalog, openInvoices])
  const invoices = useMemo(() => (loaded.key === invoiceKey ? loaded.invoices : []), [loaded, invoiceKey])
  const items = useMemo(() => (catalog && selectedPeriod ? classifyFeeItems({ invoices, feeTypes: catalog.feeTypes, campaigns: catalog.campaigns, period: selectedPeriod }) : []), [catalog, invoices, selectedPeriod])
  const alerts = useMemo(() => (catalog ? collectDueAlerts({ invoices, feeTypes: catalog.feeTypes, periods: catalog.periods }) : []), [catalog, invoices])
  const totals = summarizeTotals(items)
  const mandatoryItems = items.filter((item) => item.category === FEE_CATEGORY.MANDATORY)
  const voluntaryItems = items.filter((item) => item.category === FEE_CATEGORY.VOLUNTARY)
  const loading = !error && (catalog === null || (canLoadInvoices && loaded.key !== invoiceKey))

  const selectPeriod = (periodId) => {
    setSearchParams({ ky: catalog.periods.find((period) => period.id === periodId).code })
  }

  const retry = () => {
    setError('')
    setVersion((value) => value + 1)
  }

  const handleGenerateInvoices = async () => {
    if (!selectedPeriod) return
    setActionLoading('generating')
    setActionError('')
    setActionSuccess('')
    try {
      const res = await generateInvoicesApi(selectedPeriod.id)
      const { createdCount = 0, existingCount = 0 } = res.data ?? {}
      setActionSuccess(`Lập bảng kê nháp thành công! Đã tạo mới ${createdCount} bảng kê, ${existingCount} bảng kê đã tồn tại.`)
      setVersion((v) => v + 1)
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Không thể lập bảng kê nháp. Vui lòng kiểm tra lại biểu phí.'))
    } finally {
      setActionLoading('')
    }
  }

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

  const headerActions = canWritePeriod ? (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => setShowCreateModal(true)}
    >
      <PlusIcon size={16} />
      <span>Tạo kỳ thu mới</span>
    </button>
  ) : undefined

  return (
    <div className="user-management-container">
      <DueDateAlertBanner alerts={alerts} />
      <PageHeader
        title="Khoản thu"
        description={householdId ? 'Các khoản thu của hộ gia đình theo từng kỳ.' : 'Các khoản thu toàn chung cư theo từng kỳ.'}
        actions={headerActions}
      />

      {error && <div className="alert alert-error" role="alert"><div>{error} <button type="button" className="btn btn-outline" onClick={retry}>Thử lại</button></div></div>}

      {actionSuccess && (
        <div className="alert alert-success" role="status">
          <div className="flex flex-1 items-center justify-between gap-4">
            <span>{actionSuccess}</span>
            <button type="button" className="btn btn-outline btn-xs" onClick={() => setActionSuccess('')}>Đóng</button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="alert alert-error" role="alert">
          <div className="flex flex-1 items-center justify-between gap-4">
            <span>{actionError}</span>
            <button type="button" className="btn btn-outline btn-xs" onClick={() => setActionError('')}>Đóng</button>
          </div>
        </div>
      )}

      {outstanding && <OutstandingPeriods summary={outstanding} selectedId={selectedPeriod?.id} onSelect={selectPeriod} showInvoiceCount={!householdId} />}

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
              {selectedPeriod.status === 'DRAFT' && canGenerate && (
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

              {selectedPeriod.status === 'DRAFT' && canIssue && (
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

              {selectedPeriod.status === 'ISSUED' && canClose && (
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
      {catalog?.periods.length === 0 && <p className="alert alert-info">Chưa có kỳ thu nào.</p>}

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
