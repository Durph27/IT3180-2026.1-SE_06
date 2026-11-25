import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, useLocation } from 'react-router'
import {
  getAllPaymentsApi,
  voidPaymentApi,
  getPaymentReceiptApi,
  getReceiptByIdApi,
  downloadReceiptPdfApi,
} from '../api/payments'
import { getAllApartmentsApi } from '../api/apartments'
import { getAllHouseholdsApi, getActiveOccupanciesApi } from '../api/households'
import { apiErrorMessage } from '../api/errors'
import { ROUTES } from '../routes'
import { useAuth } from '../hooks/useAuth'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import ForbiddenView from '../components/ForbiddenView'
import PermissionGate from '../components/PermissionGate'
import PaymentListTable from '../components/PaymentListTable'
import RecordPaymentModal from '../components/RecordPaymentModal'
import VoidPaymentModal from '../components/VoidPaymentModal'
import ReceiptModal from '../components/ReceiptModal'
import {
  CreditCardIcon,
  CheckCircleIcon,
  RefreshIcon,
  PlusIcon,
  AlertTriangleIcon,
} from '../components/Icons'
import { formatMoney, toCents, STAFF_ROLES } from '../utils/billingUtils'
import { saveBlobAs } from '../utils/paymentUtils'

export default function PaymentPage({ onBack }) {
  const { householdIds, hasRole } = useAuth()
  const [selectedHousehold, setSelectedHousehold] = useState('')
  const buildingWide = STAFF_ROLES.some((role) => hasRole(role))
  const householdId = buildingWide ? undefined : householdIds.includes(selectedHousehold) ? selectedHousehold : householdIds[0]
  const denied = <ForbiddenView onBack={onBack} />

  return (
    <PermissionGate permission="payment.read" householdId={householdId} fallback={denied}>
      <PaymentContent
        key={householdId ?? 'building'}
        householdId={householdId}
        householdOptions={buildingWide ? [] : householdIds}
        onSelectHousehold={setSelectedHousehold}
        buildingWide={buildingWide}
      />
    </PermissionGate>
  )
}

function PaymentContent({ householdId, buildingWide = false }) {
  const location = useLocation()
  const { hasPermission } = useAuth()
  const canRecord = hasPermission('payment.record')
  const canVoid = hasPermission('payment.void')
  const canReadApartments = hasPermission('apartment.read')
  const canReadHouseholds = hasPermission('household.read')
  const canReadOccupancies = hasPermission('occupancy.read')

  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [version, setVersion] = useState(0)

  // Modals state
  const [isRecordOpen, setIsRecordOpen] = useState(false)
  const [preselectedHouseholdId, setPreselectedHouseholdId] = useState('')
  const [preselectedInvoice, setPreselectedInvoice] = useState(null)

  const [selectedPaymentToVoid, setSelectedPaymentToVoid] = useState(null)
  const [isVoiding, setIsVoiding] = useState(false)

  const [selectedReceipt, setSelectedReceipt] = useState(null)
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState(null)
  const [isReceiptOpen, setIsReceiptOpen] = useState(false)

  // Residence reference data
  const [apartments, setApartments] = useState([])
  const [households, setHouseholds] = useState([])
  const [occupancies, setOccupancies] = useState([])

  // Auto-open record modal if navigated from invoice "Thu phí"
  useEffect(() => {
    if (location.state?.recordPayment && canRecord) {
      if (location.state.householdId) {
        setPreselectedHouseholdId(location.state.householdId)
      }
      if (location.state.invoice) {
        setPreselectedInvoice(location.state.invoice)
      }
      setIsRecordOpen(true)
      // Clear history state to avoid re-triggering
      window.history.replaceState({}, document.title)
    }
  }, [location.state, canRecord])

  // Load residence reference metadata
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
      if (aptRes.status === 'fulfilled' && Array.isArray(aptRes.value)) setApartments(aptRes.value)
      if (hhRes.status === 'fulfilled' && Array.isArray(hhRes.value)) setHouseholds(hhRes.value)
      if (occRes.status === 'fulfilled' && Array.isArray(occRes.value)) setOccupancies(occRes.value)
    })

    return () => controller.abort()
  }, [buildingWide, canReadApartments, canReadHouseholds, canReadOccupancies])

  // Build maps for quick lookup
  const { apartmentMap, householdMap } = useMemo(() => {
    const aptById = new Map(apartments.map((a) => [a.id, a]))
    const occByHh = new Map()

    for (const occ of occupancies) {
      if (occ.householdId) {
        occByHh.set(occ.householdId, occ)
      }
    }

    const aptMap = {}
    const hhMap = {}

    for (const h of households) {
      const occ = occByHh.get(h.id)
      const apt = occ?.apartmentId ? aptById.get(occ.apartmentId) : null
      hhMap[h.id] = {
        id: h.id,
        code: h.code,
        headName: h.headName,
        apartmentCode: apt?.code || '',
      }
      if (apt) {
        aptMap[h.id] = apt
      }
    }

    return { apartmentMap: aptMap, householdMap: hhMap }
  }, [apartments, households, occupancies])

  // Load payments list
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')

    const params = householdId ? { householdId } : {}
    getAllPaymentsApi(params, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) {
          // Sort newest first
          const sorted = [...rows].sort((a, b) => new Date(b.paidAt || b.createdAt || 0) - new Date(a.paidAt || a.createdAt || 0))
          setPayments(sorted)
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(apiErrorMessage(err, 'Không thể tải nhật ký thu tiền.'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [householdId, version])

  // Summaries
  const stats = useMemo(() => {
    let totalPosted = 0n
    let cashPosted = 0n
    let transferPosted = 0n
    let voidedCount = 0
    let voidedAmount = 0n

    for (const p of payments) {
      const amount = toCents(p.amount)
      if (p.status === 'POSTED') {
        totalPosted += amount
        if (p.channel === 'CASH') {
          cashPosted += amount
        } else if (p.channel === 'BANK_TRANSFER') {
          transferPosted += amount
        }
      } else if (p.status === 'VOIDED') {
        voidedCount += 1
        voidedAmount += amount
      }
    }

    return {
      totalPosted,
      cashPosted,
      transferPosted,
      voidedCount,
      voidedAmount,
    }
  }, [payments])

  const handleRefresh = () => {
    setSuccessMessage('')
    setError('')
    setVersion((v) => v + 1)
  }

  // Open view receipt
  const handleViewReceipt = useCallback(async (payment) => {
    setSelectedPaymentForReceipt(payment)
    try {
      let receiptData = null
      if (payment.receiptId) {
        receiptData = await getReceiptByIdApi(payment.receiptId)
      } else {
        receiptData = await getPaymentReceiptApi(payment.id)
      }
      setSelectedReceipt(receiptData)
    } catch {
      // Fallback: construct receipt snapshot from payment object
      const hh = householdMap[payment.householdId] ?? {}
      const fallbackReceipt = {
        id: payment.receiptId || payment.id,
        receiptNo: payment.receiptNo || `BL-${payment.paymentNo || payment.id.slice(0, 8)}`,
        status: payment.status,
        issuedAt: payment.createdAt || payment.paidAt,
        snapshot: {
          paymentNo: payment.paymentNo,
          receiptNo: payment.receiptNo || `BL-${payment.paymentNo || payment.id.slice(0, 8)}`,
          amount: payment.amount,
          channel: payment.channel,
          paidAt: payment.paidAt,
          householdCode: hh.code,
          apartmentCodes: hh.apartmentCode ? [hh.apartmentCode] : [],
          payerDisplayName: hh.headName || 'Chủ hộ',
          recordedByDisplayName: payment.recordedBy || 'Ban Quản Lý',
          allocations: (payment.allocations || []).map((a) => ({
            description: a.invoiceLineId ? 'Phí dịch vụ / quản lý tòa nhà' : 'Đóng góp tự nguyện',
            amount: a.amount,
            invoiceLineId: a.invoiceLineId,
            contributionId: a.contributionId,
          })),
        },
      }
      setSelectedReceipt(fallbackReceipt)
    } finally {
      setIsReceiptOpen(true)
    }
  }, [householdMap])

  // Download official PDF
  const handleDownloadPdf = useCallback(async (receiptId, receiptNo) => {
    if (!receiptId) return
    try {
      const blob = await downloadReceiptPdfApi(receiptId)
      saveBlobAs(blob, `Bien-lai-${receiptNo || receiptId}.pdf`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể tải file PDF biên lai. Vui lòng thử lại.'))
    }
  }, [])

  // Confirm void payment
  const handleConfirmVoid = async (reason) => {
    if (!selectedPaymentToVoid || isVoiding) return
    setIsVoiding(true)
    setError('')
    try {
      const updated = await voidPaymentApi(selectedPaymentToVoid.id, { reason })
      setPayments((prev) =>
        prev.map((p) => (p.id === selectedPaymentToVoid.id ? { ...p, ...updated, status: 'VOIDED', voidReason: reason } : p))
      )
      setSuccessMessage(`Đã hủy thành công phiếu thu ${selectedPaymentToVoid.paymentNo}.`)
      setSelectedPaymentToVoid(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể hủy phiếu thu. Vui lòng thử lại.'))
    } finally {
      setIsVoiding(false)
    }
  }

  // Handle successful payment creation
  const handlePaymentCreated = (newPayment, newReceipt) => {
    setIsRecordOpen(false)
    setPreselectedHouseholdId('')
    setPreselectedInvoice(null)
    setSuccessMessage(`Đã ghi nhận thành công phiếu thu ${newPayment.paymentNo}.`)
    setPayments((prev) => [newPayment, ...prev])

    // Automatically preview the receipt
    if (newReceipt) {
      setSelectedReceipt(newReceipt)
      setSelectedPaymentForReceipt(newPayment)
      setIsReceiptOpen(true)
    } else {
      handleViewReceipt(newPayment)
    }
  }

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleRefresh}
        disabled={loading}
        title="Làm mới danh sách thu tiền"
      >
        <RefreshIcon size={16} />
        <span>Làm mới</span>
      </button>

      {canRecord && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setPreselectedHouseholdId('')
            setPreselectedInvoice(null)
            setIsRecordOpen(true)
          }}
          title="Lập phiếu thu tiền mới"
        >
          <PlusIcon size={16} />
          <span>Ghi nhận thu tiền</span>
        </button>
      )}
    </div>
  )

  return (
    <div className="user-management-container">
      <PageHeader
        title="Sổ thu tiền"
        description={
          buildingWide
            ? <>Ghi nhận tiền mặt, chuyển khoản và biên lai. Số phải thu theo tháng xem ở <Link to={ROUTES.billing} className="font-semibold underline">Đợt thu</Link>.</>
            : 'Lịch sử nộp phí và biên lai điện tử của hộ gia đình.'
        }
        actions={headerActions}
      />

      {error && (
        <div className="alert alert-error flex items-start justify-between gap-3" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon size={18} className="mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-rose-900 underline hover:no-underline"
            onClick={() => setError('')}
          >
            Đóng
          </button>
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success flex items-start justify-between gap-3" role="status">
          <div className="flex items-start gap-2">
            <CheckCircleIcon size={18} className="mt-0.5 shrink-0 text-emerald-700" />
            <div className="font-semibold text-emerald-950">{successMessage}</div>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-emerald-900 underline hover:no-underline"
            onClick={() => setSuccessMessage('')}
          >
            Đóng
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tổng thực thu"
          value={formatMoney(stats.totalPosted)}
          tone="success"
          icon={CheckCircleIcon}
        />
        <StatCard
          label="Thu tiền mặt"
          value={formatMoney(stats.cashPosted)}
          icon={CreditCardIcon}
        />
        <StatCard
          label="Thu chuyển khoản"
          value={formatMoney(stats.transferPosted)}
          tone="info"
          icon={CreditCardIcon}
        />
        <StatCard
          label="Phiếu đã hủy"
          value={`${stats.voidedCount} phiếu (${formatMoney(stats.voidedAmount)})`}
          tone={stats.voidedCount > 0 ? 'error' : 'neutral'}
        />
      </div>

      {/* Main Payment Journal Table */}
      <PaymentListTable
        payments={payments}
        loading={loading}
        error={error}
        apartmentMap={apartmentMap}
        householdMap={householdMap}
        onRefresh={handleRefresh}
        onViewReceipt={handleViewReceipt}
        onDownloadPdf={handleDownloadPdf}
        onVoidPayment={(p) => setSelectedPaymentToVoid(p)}
        canVoid={canVoid}
      />

      {/* Modal: Record Payment */}
      {isRecordOpen && (
        <RecordPaymentModal
          isOpen={isRecordOpen}
          initialHouseholdId={preselectedHouseholdId}
          initialInvoice={preselectedInvoice}
          households={households}
          apartments={apartments}
          occupancies={occupancies}
          onClose={() => {
            setIsRecordOpen(false)
            setPreselectedHouseholdId('')
            setPreselectedInvoice(null)
          }}
          onSuccess={handlePaymentCreated}
        />
      )}

      {/* Modal: Void Payment */}
      {selectedPaymentToVoid && (
        <VoidPaymentModal
          isOpen={Boolean(selectedPaymentToVoid)}
          payment={selectedPaymentToVoid}
          isVoiding={isVoiding}
          onConfirm={handleConfirmVoid}
          onClose={() => setSelectedPaymentToVoid(null)}
        />
      )}

      {/* Modal: View & Download Printable Receipt */}
      {isReceiptOpen && selectedReceipt && (
        <ReceiptModal
          isOpen={isReceiptOpen}
          receipt={selectedReceipt}
          payment={selectedPaymentForReceipt}
          onClose={() => {
            setIsReceiptOpen(false)
            setSelectedReceipt(null)
            setSelectedPaymentForReceipt(null)
          }}
        />
      )}
    </div>
  )
}
