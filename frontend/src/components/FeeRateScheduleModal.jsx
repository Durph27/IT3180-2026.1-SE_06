import { useState, useEffect, useCallback, useId, useRef, useMemo } from 'react'
import { getFeeRatesApi, updateFeeRateApi } from '../api/fees'
import { BASIS_OPTIONS, VEHICLE_TYPE_OPTIONS } from '../utils/feeValidation'
import FeeRateCreateModal from './FeeRateCreateModal'
import {
  ReceiptTaxIcon,
  XIcon,
  PlusIcon,
  RefreshIcon,
  CheckCircleIcon,
  CalendarIcon,
} from './Icons'

function formatVnd(amountStr) {
  if (!amountStr) return '0 đ'
  const num = Number(amountStr)
  if (Number.isNaN(num)) return `${amountStr} đ`
  return `${new Intl.NumberFormat('vi-VN').format(num)} đ`
}

function getRateStatus(effectiveFrom, effectiveTo) {
  const today = new Date().toISOString().slice(0, 10)
  if (effectiveFrom > today) {
    return { label: 'Sắp áp dụng', className: 'badge-inactive' }
  }
  if (effectiveTo && effectiveTo <= today) {
    return { label: 'Đã hết hạn', className: 'badge-inactive' }
  }
  return { label: 'Đang áp dụng', className: 'badge-occupied' }
}

export default function FeeRateScheduleModal({
  isOpen,
  onClose,
  feeType,
  canWriteRates,
}) {
  const dialogRef = useRef(null)
  const pressedOutsideRef = useRef(false)
  const titleId = useId()

  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Create rate modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // End rate date modal state
  const [endingRate, setEndingRate] = useState(null)
  const [endDateVal, setEndDateVal] = useState('')
  const [endRateError, setEndRateError] = useState('')
  const [endRateLoading, setEndRateLoading] = useState(false)

  const basisMeta = BASIS_OPTIONS.find((b) => b.value === feeType?.basis)
  const isVehicle = feeType?.basis === 'PER_VEHICLE'
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const loadRates = useCallback(() => {
    if (!feeType?.id) return
    setLoading(true)
    setError('')
    getFeeRatesApi(feeType.id, { size: 100, sort: 'effectiveFrom,desc' })
      .then((data) => {
        const list = data.content || data.items || data || []
        setRates(Array.isArray(list) ? list : [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Không thể tải danh sách biểu phí.')
        setLoading(false)
      })
  }, [feeType])

  useEffect(() => {
    if (isOpen && feeType?.id) {
      loadRates()
    }
  }, [isOpen, feeType?.id, loadRates])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [isOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const isOutside = (e) => {
      const rect = dialog.getBoundingClientRect()
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
    }

    const handlePointerDown = (e) => {
      pressedOutsideRef.current = isOutside(e)
    }

    const handlePointerUp = (e) => {
      if (pressedOutsideRef.current && isOutside(e)) {
        if (!isCreateOpen && !endingRate) onClose()
      }
      pressedOutsideRef.current = false
    }

    const handleCancel = (e) => {
      e.preventDefault()
      if (!isCreateOpen && !endingRate) onClose()
    }

    dialog.addEventListener('pointerdown', handlePointerDown)
    dialog.addEventListener('pointerup', handlePointerUp)
    dialog.addEventListener('cancel', handleCancel)

    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown)
      dialog.removeEventListener('pointerup', handlePointerUp)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [onClose, isCreateOpen, endingRate])

  const handleOpenEndRate = (rate) => {
    const today = new Date().toISOString().slice(0, 10)
    setEndingRate(rate)
    setEndDateVal(rate.effectiveTo || today)
    setEndRateError('')
  }

  const handleSaveEndRate = async (e) => {
    e.preventDefault()
    if (!endDateVal) {
      setEndRateError('Vui lòng chọn ngày kết thúc hiệu lực.')
      return
    }
    if (endDateVal <= endingRate.effectiveFrom) {
      setEndRateError('Ngày kết thúc hiệu lực phải sau ngày bắt đầu hiệu lực.')
      return
    }

    try {
      setEndRateLoading(true)
      setEndRateError('')
      await updateFeeRateApi(endingRate.id, { effectiveTo: endDateVal })
      setSuccessMsg('Đã cập nhật ngày kết thúc hiệu lực biểu phí.')
      setEndingRate(null)
      loadRates()
    } catch (err) {
      setEndRateError(err.response?.data?.message || 'Không thể kết thúc biểu phí. Có thể biểu phí đã được chốt bảng kê.')
    } finally {
      setEndRateLoading(false)
    }
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        className="modern-dialog"
        style={{ maxWidth: '820px' }}
        aria-labelledby={titleId}
      >
        <div className="dialog-header">
          <div className="dialog-header-title">
            <div className="dialog-icon-badge">
              <ReceiptTaxIcon size={20} />
            </div>
            <div>
              <h2 id={titleId} className="dialog-title">
                Lịch sử Biểu phí: {feeType?.name}
              </h2>
              <p className="dialog-subtitle">
                Mã: <strong>{feeType?.code}</strong> · Cơ sở: {basisMeta?.label} ({basisMeta?.unit})
              </p>
            </div>
          </div>
          <button
            type="button"
            className="dialog-close-btn"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="dialog-body">
          {successMsg && (
            <div className="alert-banner alert-success" role="status">
              <CheckCircleIcon size={18} />
              <span>{successMsg}</span>
            </div>
          )}

          {error && (
            <div className="alert-banner alert-danger" role="alert">
              <span className="alert-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Sub-toolbar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <div>
              <span style={{ fontSize: '0.875rem', color: 'var(--slate-muted)' }}>
                Tổng cộng {rates.length} mốc đơn giá
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadRates}
                disabled={loading}
                title="Tải lại danh sách mốc đơn giá"
              >
                <RefreshIcon size={14} />
                <span>Làm mới</span>
              </button>
              {canWriteRates && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <PlusIcon size={14} />
                  <span>Thiết lập đơn giá mới</span>
                </button>
              )}
            </div>
          </div>

          {/* Rates Table */}
          <div className="table-surface-card" style={{ boxShadow: 'none', border: '1px solid var(--border-hairline)' }}>
            <div className="table-scroll-region">
              <table className="data-table">
                <thead>
                  <tr>
                    {isVehicle && <th scope="col">Loại xe</th>}
                    <th scope="col" className="col-num">Đơn giá</th>
                    <th scope="col">Hiệu lực từ</th>
                    <th scope="col">Hiệu lực đến</th>
                    <th scope="col">Trạng thái</th>
                    {canWriteRates && <th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={isVehicle ? 6 : 5} style={{ textAlign: 'center', padding: '28px' }}>
                        <span style={{ color: 'var(--slate-muted)' }}>Đang tải lịch sử biểu phí…</span>
                      </td>
                    </tr>
                  ) : rates.length === 0 ? (
                    <tr>
                      <td colSpan={isVehicle ? 6 : 5} style={{ textAlign: 'center', padding: '32px' }}>
                        <div style={{ color: 'var(--slate-muted)', marginBottom: '8px' }}>
                          Chưa có biểu phí nào được thiết lập cho khoản thu này.
                        </div>
                        {canWriteRates && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setIsCreateOpen(true)}
                          >
                            <PlusIcon size={14} />
                            <span>Thiết lập đơn giá đầu tiên</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    rates.map((rate) => {
                      const status = getRateStatus(rate.effectiveFrom, rate.effectiveTo)
                      const isExpired = Boolean(rate.effectiveTo && rate.effectiveTo <= todayStr)
                      const vOption = VEHICLE_TYPE_OPTIONS.find((v) => v.value === rate.vehicleType)

                      return (
                        <tr key={rate.id}>
                          {isVehicle && (
                            <td data-label="Loại xe">
                              <span style={{ fontWeight: 600 }}>{vOption?.label || rate.vehicleType || '—'}</span>
                            </td>
                          )}
                          <td data-label="Đơn giá" className="col-num">
                            <strong style={{ color: 'var(--cobalt-action)', fontSize: '0.95rem' }}>
                              {formatVnd(rate.unitPrice)}
                            </strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--slate-muted)', marginLeft: '4px' }}>
                              / {basisMeta?.unit}
                            </span>
                          </td>
                          <td data-label="Hiệu lực từ">
                            <span style={{ fontFamily: 'var(--font-mono)' }}>{rate.effectiveFrom}</span>
                          </td>
                          <td data-label="Hiệu lực đến">
                            <span style={{ fontFamily: 'var(--font-mono)' }}>
                              {rate.effectiveTo || <span style={{ color: 'var(--slate-muted)' }}>Vô thời hạn</span>}
                            </span>
                          </td>
                          <td data-label="Trạng thái">
                            <span className={`badge-pill ${status.className}`}>
                              ● {status.label}
                            </span>
                          </td>
                          {canWriteRates && (
                            <td data-label="Thao tác" style={{ textAlign: 'right' }}>
                              {!isExpired && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => handleOpenEndRate(rate)}
                                  title="Đặt ngày kết thúc hiệu lực cho đơn giá này"
                                >
                                  <CalendarIcon size={12} />
                                  <span>Đóng hiệu lực</span>
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dialog-footer" style={{ marginTop: '20px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Đóng
            </button>
          </div>
        </div>
      </dialog>

      {/* Nested Create Rate Modal */}
      {isCreateOpen && (
        <FeeRateCreateModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={(msg) => {
            setSuccessMsg(msg)
            loadRates()
          }}
          feeType={feeType}
        />
      )}

      {/* End Rate Mini Modal */}
      {endingRate && (
        <dialog
          open
          className="modern-dialog"
          style={{ maxWidth: '420px', zIndex: 1050 }}
        >
          <div className="dialog-header">
            <h3 className="dialog-title" style={{ fontSize: '1rem' }}>
              Kết thúc hiệu lực đơn giá
            </h3>
            <button
              type="button"
              className="dialog-close-btn"
              onClick={() => setEndingRate(null)}
              disabled={endRateLoading}
            >
              <XIcon size={16} />
            </button>
          </div>
          <div className="dialog-body">
            {endRateError && (
              <div className="alert-banner alert-danger" role="alert" style={{ marginBottom: '12px' }}>
                <span className="alert-icon">⚠️</span>
                <span>{endRateError}</span>
              </div>
            )}
            <p style={{ fontSize: '0.85rem', color: 'var(--slate-subhead)', marginBottom: '12px' }}>
              Đơn giá hiện hành: <strong>{formatVnd(endingRate.unitPrice)}</strong> (áp dụng từ {endingRate.effectiveFrom}).
            </p>
            <form onSubmit={handleSaveEndRate}>
              <div className="form-group">
                <label htmlFor="end-date-input" className="form-label">
                  Ngày kết thúc hiệu lực <span className="req-star">*</span>
                </label>
                <input
                  type="date"
                  id="end-date-input"
                  value={endDateVal}
                  onChange={(e) => setEndDateVal(e.target.value)}
                  min={endingRate.effectiveFrom}
                  className="form-input"
                  disabled={endRateLoading}
                  required
                />
              </div>
              <div className="dialog-footer" style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEndingRate(null)}
                  disabled={endRateLoading}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={endRateLoading}
                >
                  {endRateLoading ? 'Đang lưu…' : 'Xác nhận đóng'}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}
    </>
  )
}
