import { useState, useEffect, useCallback, useId, useRef } from 'react'
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
  AlertTriangleIcon,
} from './Icons'

function formatVnd(amountStr) {
  if (!amountStr) return '0 đ'
  const num = Number(amountStr)
  if (Number.isNaN(num)) return `${amountStr} đ`
  return `${new Intl.NumberFormat('vi-VN').format(num)} đ`
}

function getRateStatus(effectiveFrom, effectiveTo, today) {
  if (effectiveFrom > today) {
    return { label: 'Sắp áp dụng', className: 'badge-upcoming' }
  }
  if (effectiveTo && effectiveTo <= today) {
    return { label: 'Đã hết hạn', className: 'badge-expired' }
  }
  return { label: 'Đang áp dụng', className: 'badge-current' }
}

function EndRateModal({
  isOpen,
  onClose,
  rate,
  basisUnit,
  onSuccess,
}) {
  const dialogRef = useRef(null)
  const pressedOutsideRef = useRef(false)
  const titleId = useId()
  const helpId = useId()
  const errorId = useId()

  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10))
  const [endDateVal, setEndDateVal] = useState(() => rate?.effectiveTo || todayStr)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [prevRateId, setPrevRateId] = useState(rate?.id)

  if (rate && rate.id !== prevRateId) {
    setPrevRateId(rate.id)
    setEndDateVal(rate.effectiveTo || todayStr)
    setError('')
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal()
      }
    } else {
      if (dialog.open) {
        dialog.close()
      }
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
        if (!loading) onClose()
      }
      pressedOutsideRef.current = false
    }

    const handleCancel = (e) => {
      e.preventDefault()
      if (!loading) onClose()
    }

    dialog.addEventListener('pointerdown', handlePointerDown)
    dialog.addEventListener('pointerup', handlePointerUp)
    dialog.addEventListener('cancel', handleCancel)

    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown)
      dialog.removeEventListener('pointerup', handlePointerUp)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [onClose, loading])

  if (!rate) return null

  const handleSave = async (e) => {
    e.preventDefault()
    if (!endDateVal) {
      setError('Vui lòng chọn ngày kết thúc hiệu lực.')
      return
    }
    if (endDateVal <= rate.effectiveFrom) {
      setError('Ngày kết thúc hiệu lực phải sau ngày bắt đầu hiệu lực.')
      return
    }

    try {
      setLoading(true)
      setError('')
      await updateFeeRateApi(rate.id, { effectiveTo: endDateVal })
      onSuccess('Đã cập nhật ngày kết thúc hiệu lực biểu phí.')
      onClose()
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Không thể kết thúc biểu phí. Có thể biểu phí đã được chốt bảng kê.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modern-dialog fee-rate-dialog"
      style={{ maxWidth: '440px', zIndex: 1050 }}
      aria-labelledby={titleId}
    >
      <div className="dialog-header">
        <h3 id={titleId} className="dialog-title" style={{ fontSize: '1rem' }}>
          Kết thúc hiệu lực đơn giá
        </h3>
        <button
          type="button"
          className="dialog-close-btn"
          onClick={onClose}
          disabled={loading}
          aria-label="Đóng cửa sổ"
        >
          <XIcon size={16} />
        </button>
      </div>
      <div className="dialog-body">
        {error && (
          <div
            id={errorId}
            className="alert-banner alert-danger"
            role="alert"
            style={{ marginBottom: '12px' }}
          >
            <span className="alert-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}
        <div className="rate-context" style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
          Đơn giá hiện hành:{' '}
          <strong style={{ color: 'var(--cobalt-action)' }}>
            {formatVnd(rate.unitPrice)}
          </strong>{' '}
          {basisUnit && <span className="rate-unit">/ {basisUnit}</span>} (áp dụng từ{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>{rate.effectiveFrom}</span>).
        </div>
        <form onSubmit={handleSave} noValidate>
          <div className="form-group">
            <label htmlFor="end-date-input" className="form-label">
              Ngày kết thúc hiệu lực <span className="req-star">*</span>
            </label>
            <span id={helpId} className="field-hint">
              Không áp dụng từ ngày này.
            </span>
            <input
              type="date"
              id="end-date-input"
              value={endDateVal}
              onChange={(e) => {
                setEndDateVal(e.target.value)
                if (error) setError('')
              }}
              min={rate.effectiveFrom}
              className={`form-input ${error ? 'input-error' : ''}`}
              aria-describedby={error ? `${helpId} ${errorId}` : helpId}
              aria-invalid={Boolean(error)}
              disabled={loading}
              required
            />
          </div>
          <div className="dialog-footer dialog-form-footer" style={{ marginTop: '16px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              disabled={loading}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-dot" />
                  <span>Đang lưu…</span>
                </>
              ) : (
                'Xác nhận đóng'
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}

export default function FeeRateScheduleModal({
  isOpen,
  onClose,
  feeType,
  canWriteRates,
}) {
  const dialogRef = useRef(null)
  const pressedOutsideRef = useRef(false)
  const openerRef = useRef(null)
  const titleId = useId()

  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Create rate modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // End rate date modal state
  const [endingRate, setEndingRate] = useState(null)

  const basisMeta = BASIS_OPTIONS.find((b) => b.value === feeType?.basis)
  const isVehicle = feeType?.basis === 'PER_VEHICLE'
  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10))

  const loadRates = useCallback(() => {
    if (!feeType?.id) return
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

  const handleRefresh = useCallback(() => {
    setLoading(true)
    setError('')
    loadRates()
  }, [loadRates])

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

  const handleOpenEndRate = (rate, event) => {
    openerRef.current = event?.currentTarget || null
    setEndingRate(rate)
  }

  const handleCloseEndRate = () => {
    setEndingRate(null)
    const el = openerRef.current
    if (el && typeof el.focus === 'function') {
      requestAnimationFrame(() => {
        el.focus()
      })
    }
  }

  const colSpan = 4 + Number(isVehicle) + Number(canWriteRates)

  return (
    <>
      <dialog
        ref={dialogRef}
        className="modern-dialog fee-rate-dialog"
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
                Lịch sử biểu phí: {feeType?.name}
              </h2>
              <div className="dialog-subtitle rate-context">
                Mã: <strong>{feeType?.code}</strong> · Cơ sở: {basisMeta?.label} (
                <span className="rate-unit">{basisMeta?.unit}</span>)
              </div>
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
              <AlertTriangleIcon size={18} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {!canWriteRates && (
            <div className="alert-banner alert-info" role="note" style={{ marginBottom: '16px' }}>
              <span>Chế độ chỉ xem: Bạn không có quyền thêm hoặc điều chỉnh biểu phí.</span>
            </div>
          )}

          {/* Sub-toolbar */}
          <div
            className="dialog-toolbar"
          >
            <div>
              <span style={{ fontSize: '0.875rem', color: 'var(--slate-muted)' }}>
                {loading ? 'Đang tải mốc đơn giá…' : error ? 'Chưa tải được mốc đơn giá' : `Hiển thị ${rates.length} mốc gần nhất (tối đa 100)`}
              </span>
            </div>
            <div className="dialog-toolbar-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleRefresh}
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
            <div
              className="table-scroll-region"
              role="region"
              aria-label="Danh sách mốc biểu phí"
              tabIndex={0}
            >
              <table className="data-table rate-table">
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
                      <td colSpan={colSpan} style={{ textAlign: 'center', padding: '28px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--slate-muted)' }}>
                          <span className="spinner-dot" />
                          <span>Đang tải lịch sử biểu phí…</span>
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={colSpan} style={{ textAlign: 'center', padding: '28px' }}>
                        <div style={{ color: 'var(--crimson-text, #b91c1c)', marginBottom: '10px' }}>
                          ⚠️ {error}
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={handleRefresh}
                        >
                          <RefreshIcon size={14} />
                          <span>Thử lại</span>
                        </button>
                      </td>
                    </tr>
                  ) : rates.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan} style={{ textAlign: 'center', padding: '32px' }}>
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
                      const status = getRateStatus(rate.effectiveFrom, rate.effectiveTo, todayStr)
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
                            <span className="rate-unit rate-unit-inline">
                              / {basisMeta?.unit}
                            </span>
                          </td>
                          <td data-label="Hiệu lực từ">
                            <span className="tabular-nums">{rate.effectiveFrom}</span>
                          </td>
                          <td data-label="Hiệu lực đến">
                            <span className="tabular-nums">
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
                                  onClick={(e) => handleOpenEndRate(rate, e)}
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

          <div className="dialog-footer dialog-form-footer" style={{ marginTop: '20px' }}>
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
            handleRefresh()
          }}
          feeType={feeType}
        />
      )}

      {/* Native End Rate Sub-Dialog Modal */}
      <EndRateModal
        isOpen={Boolean(endingRate)}
        onClose={handleCloseEndRate}
        rate={endingRate}
        basisUnit={basisMeta?.unit}
        onSuccess={(msg) => {
          setSuccessMsg(msg)
          handleRefresh()
        }}
      />
    </>
  )
}
