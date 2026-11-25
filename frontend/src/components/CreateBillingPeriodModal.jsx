import { useState, useId } from 'react'
import { createBillingPeriodApi } from '../api/billing'
import { apiErrorMessage } from '../api/errors'
import { XIcon, AlertTriangleIcon, CalendarIcon } from './Icons'

function getDefaultPeriodDates(yearMonthStr) {
  const [yearStr, monthStr] = yearMonthStr.split('-')
  const y = Number.parseInt(yearStr, 10)
  const m = Number.parseInt(monthStr, 10) - 1 // 0-indexed

  const start = new Date(Date.UTC(y, m, 1))
  const end = new Date(Date.UTC(y, m + 1, 0)) // last day of month
  const snapshot = new Date(Date.UTC(y, m, Math.min(25, end.getUTCDate())))
  const due = new Date(Date.UTC(y, m + 1, 5)) // 5th of next month

  const format = (d) => d.toISOString().slice(0, 10)

  return {
    code: yearMonthStr,
    startDate: format(start),
    endDate: format(end),
    snapshotDate: format(snapshot),
    dueDate: format(due),
  }
}

export default function CreateBillingPeriodModal({
  isOpen,
  onClose,
  onSuccess,
}) {
  const codeId = useId()
  const monthPresetId = useId()
  const startDateId = useId()
  const endDateId = useId()
  const snapshotDateId = useId()
  const dueDateId = useId()

  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [form, setForm] = useState(() => getDefaultPeriodDates(new Date().toISOString().slice(0, 7)))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleMonthPresetChange = (e) => {
    const val = e.target.value
    setSelectedMonth(val)
    if (val) {
      setForm(getDefaultPeriodDates(val))
    }
  }

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (error) setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const code = form.code.trim()
    if (!code) {
      setError('Mã kỳ thu không được để trống.')
      return
    }
    if (code.length > 20) {
      setError('Mã kỳ thu không được vượt quá 20 ký tự.')
      return
    }

    if (form.endDate < form.startDate) {
      setError('Ngày kết thúc kỳ thu không được trước ngày bắt đầu.')
      return
    }

    if (form.snapshotDate < form.startDate || form.snapshotDate > form.endDate) {
      setError('Ngày chốt số liệu phải nằm trong khoảng thời gian của kỳ thu.')
      return
    }

    if (form.dueDate < form.endDate) {
      setError('Hạn nộp thanh toán phải từ ngày kết thúc kỳ thu trở về sau.')
      return
    }

    setIsSubmitting(true)
    try {
      const created = await createBillingPeriodApi({
        code,
        startDate: form.startDate,
        endDate: form.endDate,
        snapshotDate: form.snapshotDate,
        dueDate: form.dueDate,
      })
      onSuccess?.(created)
    } catch (err) {
      setError(apiErrorMessage(err, 'Không thể tạo kỳ thu mới. Vui lòng kiểm tra lại.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-period-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-solid border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-0 border-b border-solid border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 font-bold text-sm">
              <CalendarIcon size={18} />
            </span>
            <h3 id="create-period-modal-title" className="text-lg font-bold text-slate-900">
              Tạo kỳ thu phí mới
            </h3>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Đóng"
          >
            <XIcon size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-6 py-5 text-sm">
            {error && (
              <div className="alert alert-error flex items-start gap-2" role="alert">
                <AlertTriangleIcon size={18} className="shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}

            {/* Quick Month Preset Picker */}
            <div className="rounded-lg border border-solid border-blue-200 bg-blue-50/50 p-3.5">
              <label htmlFor={monthPresetId} className="block text-xs font-bold text-blue-900 mb-1">
                Chọn nhanh theo tháng
              </label>
              <input
                type="month"
                id={monthPresetId}
                className="form-control block w-full text-xs min-h-9"
                value={selectedMonth}
                onChange={handleMonthPresetChange}
                disabled={isSubmitting}
              />
              <p className="text-[11px] text-blue-700 mt-1">
                Hệ thống tự động điền các mốc ngày chuẩn theo tháng được chọn.
              </p>
            </div>

            {/* Period Code */}
            <div>
              <label htmlFor={codeId} className="block text-xs font-bold text-slate-700 mb-1">
                Mã kỳ thu <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                id={codeId}
                className="form-control block w-full text-xs min-h-10 font-mono"
                placeholder="VD: 2026-11 hoặc KY-11-2026"
                maxLength={20}
                value={form.code}
                onChange={(e) => handleChange('code', e.target.value)}
                disabled={isSubmitting}
                required
              />
              <p className="text-[11px] text-slate-500 mt-0.5">Tối đa 20 ký tự, là duy nhất trong hệ thống.</p>
            </div>

            {/* Start Date & End Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={startDateId} className="block text-xs font-bold text-slate-700 mb-1">
                  Ngày bắt đầu <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  id={startDateId}
                  className="form-control block w-full text-xs min-h-10"
                  value={form.startDate}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div>
                <label htmlFor={endDateId} className="block text-xs font-bold text-slate-700 mb-1">
                  Ngày kết thúc <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  id={endDateId}
                  className="form-control block w-full text-xs min-h-10"
                  value={form.endDate}
                  onChange={(e) => handleChange('endDate', e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            {/* Snapshot Date & Due Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={snapshotDateId} className="block text-xs font-bold text-slate-700 mb-1">
                  Ngày chốt số liệu <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  id={snapshotDateId}
                  className="form-control block w-full text-xs min-h-10"
                  value={form.snapshotDate}
                  onChange={(e) => handleChange('snapshotDate', e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <p className="text-[10px] text-slate-500 mt-0.5">Thời điểm chốt cư trú & biểu phí.</p>
              </div>
              <div>
                <label htmlFor={dueDateId} className="block text-xs font-bold text-slate-700 mb-1">
                  Hạn nộp thanh toán <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  id={dueDateId}
                  className="form-control block w-full text-xs min-h-10"
                  value={form.dueDate}
                  onChange={(e) => handleChange('dueDate', e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <p className="text-[10px] text-slate-500 mt-0.5">Ngày hết hạn nộp tiền.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-0 border-t border-solid border-slate-200 bg-slate-50 px-6 py-4 rounded-b-xl">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="btn btn-primary min-w-28"
              disabled={isSubmitting || !form.code.trim()}
            >
              {isSubmitting ? (
                <>
                  <span className="loading-spinner-ring" aria-hidden="true" />
                  <span>Đang tạo…</span>
                </>
              ) : (
                <span>Tạo kỳ thu</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
