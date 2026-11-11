import { useState, useEffect, useCallback, useMemo } from 'react'
import { getFeeTypesApi } from '../api/fees'
import { useAuth } from '../hooks/useAuth'
import { BASIS_OPTIONS } from '../utils/feeValidation'
import FeeTypeModal from './FeeTypeModal'
import FeeRateScheduleModal from './FeeRateScheduleModal'
import PageHeader from './PageHeader'
import StatCard from './StatCard'
import FilterBar, { FilterField } from './FilterBar'
import StatusBadge from './StatusBadge'
import Pagination from './Pagination'
import ForbiddenView from './ForbiddenView'
import FeeCategoryBadge from './FeeCategoryBadge'
import { FEE_CATEGORY } from '../utils/billingUtils'
import {
  ReceiptTaxIcon,
  PlusIcon,
  RefreshIcon,
  EditIcon,
  CheckCircleIcon,
  CalendarIcon,
  AlertTriangleIcon,
} from './Icons'

const CONTROL = 'form-control block min-h-11 w-full'
const CODE_TAG = 'rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[13px] font-semibold text-slate-800'

export default function FeeManagement() {
  const { hasPermission } = useAuth()
  const canReadFees = hasPermission('fee-type.read') || hasPermission('fee-rate.read')
  const canWriteFees = hasPermission('fee-type.write')
  const canWriteRates = hasPermission('fee-rate.write')

  const [feeTypes, setFeeTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [page, setPage] = useState(0)
  const [pageSize] = useState(15)
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [revision, setRevision] = useState(0)

  // Filters
  const [searchCode, setSearchCode] = useState('')
  const [basisFilter, setBasisFilter] = useState('ALL')
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [mandatoryFilter, setMandatoryFilter] = useState('ALL')

  // Modals
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false)
  const [editingFeeType, setEditingFeeType] = useState(null)
  const [selectedFeeTypeForRates, setSelectedFeeTypeForRates] = useState(null)

  const refreshFeeTypes = useCallback(() => setRevision((v) => v + 1), [])

  useEffect(() => {
    if (!canReadFees) return
    const controller = new AbortController()
    setLoading(true)
    setError('')

    getFeeTypesApi(
      {
        page,
        size: pageSize,
        code: searchCode.trim() || null,
        basis: basisFilter !== 'ALL' ? basisFilter : null,
        active: activeFilter !== 'ALL' ? activeFilter : null,
        mandatory: mandatoryFilter !== 'ALL' ? mandatoryFilter : null,
        sort: 'code,asc',
      },
      { signal: controller.signal }
    )
      .then((data) => {
        if (controller.signal.aborted) return
        const lastPage = Math.max(0, data.totalPages - 1)
        if (page > lastPage) {
          setPage(lastPage)
          return
        }
        setFeeTypes(data.content || [])
        setTotalElements(data.totalElements ?? 0)
        setTotalPages(data.totalPages ?? 0)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setFeeTypes([])
        setTotalElements(0)
        setTotalPages(0)
        setError(err.response?.data?.message || 'Không thể tải danh mục khoản thu. Vui lòng thử lại.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [canReadFees, page, pageSize, searchCode, basisFilter, activeFilter, mandatoryFilter, revision])

  useEffect(() => {
    if (!successMsg) return
    const timer = setTimeout(() => setSuccessMsg(''), 4500)
    return () => clearTimeout(timer)
  }, [successMsg])

  // Stats calculation
  const stats = useMemo(() => {
    let activeCount = 0
    let mandatoryCount = 0
    let vehicleCount = 0
    feeTypes.forEach((f) => {
      if (f.active) activeCount += 1
      if (f.mandatory) mandatoryCount += 1
      if (f.basis === 'PER_VEHICLE') vehicleCount += 1
    })
    return {
      total: totalElements,
      active: activeCount,
      mandatory: mandatoryCount,
      vehicle: vehicleCount,
    }
  }, [feeTypes, totalElements])

  const handleOpenCreateType = () => {
    setEditingFeeType(null)
    setIsTypeModalOpen(true)
  }

  const handleOpenEditType = (fee) => {
    setEditingFeeType(fee)
    setIsTypeModalOpen(true)
  }

  const handleOpenRates = (fee) => {
    setSelectedFeeTypeForRates(fee)
  }

  if (!canReadFees) {
    return <ForbiddenView />
  }

  const filtered = Boolean(searchCode || basisFilter !== 'ALL' || activeFilter !== 'ALL' || mandatoryFilter !== 'ALL')
  const filterSelect = (id, label, value, onChange, options) => (
    <FilterField id={id} label={label}>
      <select
        id={id}
        className={CONTROL}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setPage(0)
        }}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </FilterField>
  )

  return (
    <div className="user-management-container">
      <PageHeader
        title="Khoản thu và biểu phí"
        description="Cấu hình các loại phí chung cư, đơn giá định mức và khoảng thời gian áp dụng"
        actions={(
          <>
            <button type="button" className="btn btn-secondary" onClick={refreshFeeTypes} title="Làm mới danh sách">
              <RefreshIcon size={16} />
              <span>Làm mới</span>
            </button>
            {canWriteFees && (
              <button type="button" className="btn btn-primary" onClick={handleOpenCreateType}>
                <PlusIcon size={16} />
                <span>Thêm loại phí mới</span>
              </button>
            )}
          </>
        )}
      />

      {successMsg && (
        <div className="alert alert-success" role="status">
          <CheckCircleIcon size={18} className="shrink-0" />
          <div>{successMsg}</div>
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangleIcon size={18} className="shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Khớp bộ lọc" value={stats.total} icon={ReceiptTaxIcon} />
          <StatCard label="Đang áp dụng · trang này" value={stats.active} tone="success" />
          <StatCard label="Bắt buộc · trang này" value={stats.mandatory} />
          <StatCard label="Theo phương tiện · trang này" value={stats.vehicle} tone="warning" />
        </div>
      )}

      <FilterBar>
        <FilterField id="search-fee-code" label="Mã khoản thu">
          <input
            type="search"
            id="search-fee-code"
            className={CONTROL}
            placeholder="Mã chính xác"
            value={searchCode}
            onChange={(e) => {
              setSearchCode(e.target.value)
              setPage(0)
            }}
          />
        </FilterField>
        {filterSelect('filter-fee-basis', 'Cơ sở tính phí', basisFilter, setBasisFilter, [{ value: 'ALL', label: 'Tất cả cơ sở tính' }, ...BASIS_OPTIONS])}
        {filterSelect('filter-fee-active', 'Trạng thái', activeFilter, setActiveFilter, [{ value: 'ALL', label: 'Tất cả trạng thái' }, { value: 'true', label: 'Đang áp dụng' }, { value: 'false', label: 'Tạm dừng' }])}
        {filterSelect('filter-fee-mandatory', 'Tính chất', mandatoryFilter, setMandatoryFilter, [{ value: 'ALL', label: 'Tất cả tính chất' }, { value: 'true', label: 'Bắt buộc' }, { value: 'false', label: 'Tự nguyện' }])}
      </FilterBar>

      <div className="table-card">
        <div tabIndex={0} role="region" aria-labelledby="fee-table-caption" className="table-wrapper">
          <table className="modern-table">
            <caption id="fee-table-caption" className="sr-only">Danh sách các loại khoản thu và cơ sở biểu phí</caption>
            <thead>
              <tr>
                <th scope="col">Mã khoản thu</th>
                <th scope="col">Tên khoản thu</th>
                <th scope="col">Cơ sở tính phí</th>
                <th scope="col">Tính chất</th>
                <th scope="col">Trạng thái</th>
                <th scope="col" className="text-right!">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="empty-table-cell">
                    <div className="table-loading-box">
                      <div className="loading-spinner-ring" />
                      <p>Đang tải danh mục khoản thu…</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="empty-table-cell">
                    <div className="empty-state-box">
                      <p>Chưa tải được danh mục khoản thu. Vui lòng thử lại.</p>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={refreshFeeTypes}>Thử lại</button>
                    </div>
                  </td>
                </tr>
              ) : feeTypes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-table-cell">
                    <div className="empty-state-box">
                      <ReceiptTaxIcon size={32} className="text-slate-400" />
                      <p className="font-semibold text-slate-900">Chưa có loại khoản thu phù hợp</p>
                      <p>{filtered ? 'Không tìm thấy loại phí nào khớp với điều kiện lọc hiện tại.' : 'Bắt đầu bằng cách thêm loại phí đầu tiên.'}</p>
                      {canWriteFees && !filtered && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenCreateType}>
                          <PlusIcon size={15} />
                          <span>Thêm loại phí mới</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                feeTypes.map((fee) => {
                  const basisMeta = BASIS_OPTIONS.find((b) => b.value === fee.basis)
                  return (
                    <tr key={fee.id}>
                      <th scope="row" className="row-header-th">
                        <span className={CODE_TAG}>{fee.code}</span>
                      </th>
                      <td data-label="Tên khoản thu" className="font-semibold">{fee.name}</td>
                      <td data-label="Cơ sở tính phí">
                        <span className="block">{basisMeta?.label || fee.basis}</span>
                        {basisMeta?.unit && <span className="block text-xs text-slate-500">Đơn vị: {basisMeta.unit}</span>}
                      </td>
                      <td data-label="Tính chất">
                        <FeeCategoryBadge category={fee.mandatory ? FEE_CATEGORY.MANDATORY : FEE_CATEGORY.VOLUNTARY} className="" />
                      </td>
                      <td data-label="Trạng thái">
                        {fee.active ? <StatusBadge tone="success">Đang áp dụng</StatusBadge> : <StatusBadge tone="warning">Tạm dừng</StatusBadge>}
                      </td>
                      <td data-label="Thao tác" className="text-right!">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenRates(fee)}
                            aria-label={`Xem và cấu hình biểu phí cho ${fee.name}`}
                          >
                            <CalendarIcon size={14} />
                            <span>Biểu phí</span>
                          </button>
                          {canWriteFees && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleOpenEditType(fee)}
                              aria-label={`Chỉnh sửa ${fee.name}`}
                            >
                              <EditIcon size={14} />
                              <span>Sửa</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} totalElements={totalElements} unit="loại khoản thu" disabled={loading} onPageChange={setPage} />
      </div>

      {isTypeModalOpen && (
        <FeeTypeModal
          key={editingFeeType?.id || 'new-fee-type'}
          isOpen={isTypeModalOpen}
          onClose={() => {
            setIsTypeModalOpen(false)
            setEditingFeeType(null)
          }}
          onSuccess={(msg) => {
            setSuccessMsg(msg)
            refreshFeeTypes()
          }}
          feeType={editingFeeType}
        />
      )}

      {selectedFeeTypeForRates && (
        <FeeRateScheduleModal
          key={`rates-${selectedFeeTypeForRates.id}`}
          isOpen={Boolean(selectedFeeTypeForRates)}
          onClose={() => setSelectedFeeTypeForRates(null)}
          feeType={selectedFeeTypeForRates}
          canWriteRates={canWriteRates}
        />
      )}
    </div>
  )
}
