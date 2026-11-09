import { useState, useEffect, useCallback, useMemo } from 'react'
import { getFeeTypesApi } from '../api/fees'
import { useAuth } from '../hooks/useAuth'
import { BASIS_OPTIONS } from '../utils/feeValidation'
import FeeTypeModal from './FeeTypeModal'
import FeeRateScheduleModal from './FeeRateScheduleModal'
import {
  ReceiptTaxIcon,
  PlusIcon,
  SearchIcon,
  RefreshIcon,
  EditIcon,
  CheckCircleIcon,
  CalendarIcon,
} from './Icons'

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
    return (
      <div className="apartment-page">
        <div className="alert-banner alert-danger" role="alert">
          <span className="alert-icon">⚠️</span>
          <span>Tài khoản của bạn không có quyền xem biểu phí và danh mục khoản thu (yêu cầu quyền fee-type.read).</span>
        </div>
      </div>
    )
  }

  return (
    <div className="apartment-page">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <div className="page-icon-wrapper">
            <ReceiptTaxIcon size={24} />
          </div>
          <div>
            <h1 className="page-title">Khoản thu và biểu phí</h1>
            <p className="page-description">
              Cấu hình các loại phí chung cư, đơn giá định mức và khoảng thời gian áp dụng
            </p>
          </div>
        </div>

        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={refreshFeeTypes}
            title="Làm mới danh sách"
          >
            <RefreshIcon size={16} />
            <span>Làm mới</span>
          </button>
          {canWriteFees && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenCreateType}
            >
              <PlusIcon size={18} />
              <span>Thêm loại phí mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
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

      {/* Metrics strip */}
      {!loading && !error && <div className="stats-strip" aria-label="Thống kê danh mục khoản thu">
        <div className="stats-item">
          <span className="stats-label">Khớp bộ lọc</span>
          <div className="stats-value-row">
            <span className="stats-number stats-highlight-cobalt">{stats.total}</span>
            <span className="stats-subtext">Danh mục hiện có</span>
          </div>
        </div>

        <div className="stats-item">
          <span className="stats-label">Đang áp dụng · trang này</span>
          <div className="stats-value-row">
            <span className="stats-number stats-highlight-teal">{stats.active}</span>
            <span className="stats-subtext">Hoạt động bình thường</span>
          </div>
        </div>

        <div className="stats-item">
          <span className="stats-label">Bắt buộc · trang này</span>
          <div className="stats-value-row">
            <span className="stats-number">{stats.mandatory}</span>
            <span className="stats-subtext">Khoản thu theo quy chế</span>
          </div>
        </div>

        <div className="stats-item">
          <span className="stats-label">Theo phương tiện · trang này</span>
          <div className="stats-value-row">
            <span className="stats-number stats-highlight-amber">{stats.vehicle}</span>
            <span className="stats-subtext">Phí gửi xe định ngạch</span>
          </div>
        </div>
      </div>}

      {/* Filter toolbar */}
      <div className="filter-toolbar">
        <div className="filter-group-left">
          <div className="search-input-box">
            <SearchIcon size={15} className="search-icon-inside" />
            <input
              type="search"
              id="search-fee-code"
              placeholder="Mã khoản thu chính xác…"
              aria-label="Mã khoản thu chính xác"
              value={searchCode}
              onChange={(e) => {
                setSearchCode(e.target.value)
                setPage(0)
              }}
              className="form-input-search"
            />
          </div>

          <select
            id="filter-fee-basis"
            value={basisFilter}
            onChange={(e) => {
              setBasisFilter(e.target.value)
              setPage(0)
            }}
            className="filter-select"
            aria-label="Lọc theo cơ sở tính phí"
          >
            <option value="ALL">Tất cả cơ sở tính</option>
            {BASIS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            id="filter-fee-active"
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value)
              setPage(0)
            }}
            className="filter-select"
            aria-label="Lọc theo trạng thái áp dụng"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="true">Đang áp dụng</option>
            <option value="false">Tạm dừng</option>
          </select>

          <select
            id="filter-fee-mandatory"
            value={mandatoryFilter}
            onChange={(e) => {
              setMandatoryFilter(e.target.value)
              setPage(0)
            }}
            className="filter-select"
            aria-label="Lọc theo tính chất bắt buộc"
          >
            <option value="ALL">Tất cả tính chất</option>
            <option value="true">Bắt buộc</option>
            <option value="false">Tự nguyện</option>
          </select>
        </div>
      </div>

      {/* Table view */}
      <div className="table-surface-card">
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="fee-table-caption"
          className="table-scroll-region"
        >
          <table className="data-table">
            <caption id="fee-table-caption" className="visually-hidden">
              Danh sách các loại khoản thu và cơ sở biểu phí
            </caption>
            <thead>
              <tr>
                <th scope="col">Mã khoản thu</th>
                <th scope="col">Tên khoản thu</th>
                <th scope="col">Cơ sở tính phí</th>
                <th scope="col">Tính chất</th>
                <th scope="col">Trạng thái</th>
                <th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px' }}>
                    <span style={{ color: 'var(--slate-muted)' }}>Đang tải danh mục khoản thu…</span>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-table-state">
                      <p className="empty-table-desc">Chưa tải được danh mục khoản thu. Vui lòng thử lại.</p>
                      <button type="button" className="btn btn-secondary" onClick={refreshFeeTypes}>Thử lại</button>
                    </div>
                  </td>
                </tr>
              ) : feeTypes.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-table-state">
                      <div className="empty-table-icon">
                        <ReceiptTaxIcon size={36} />
                      </div>
                      <div className="empty-table-title">Chưa có loại khoản thu phù hợp</div>
                      <p className="empty-table-desc">
                        {searchCode || basisFilter !== 'ALL' || activeFilter !== 'ALL' || mandatoryFilter !== 'ALL'
                          ? 'Không tìm thấy loại phí nào khớp với điều kiện lọc hiện tại.'
                          : 'Bắt đầu khởi tạo các loại phí chung cư bằng cách thêm loại phí đầu tiên.'}
                      </p>
                      {canWriteFees && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleOpenCreateType}
                        >
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
                      <th scope="row" data-label="Mã khoản thu">
                        <span className="code-tag">{fee.code}</span>
                      </th>
                      <td data-label="Tên khoản thu">
                        <span style={{ fontWeight: 600 }}>{fee.name}</span>
                      </td>
                      <td data-label="Cơ sở tính phí">
                        <span className="floor-tag">
                          {basisMeta?.label || fee.basis}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-muted)', marginTop: '2px' }}>
                          Đơn vị: {basisMeta?.unit}
                        </div>
                      </td>
                      <td data-label="Tính chất">
                        {fee.mandatory ? (
                          <span className="badge-pill badge-occupied" style={{ background: 'var(--cobalt-light)', color: 'var(--cobalt-action)', borderColor: 'var(--cobalt-border)' }}>
                            ● Bắt buộc
                          </span>
                        ) : (
                          <span className="badge-pill" style={{ background: '#F3F4F6', color: '#4B5563' }}>
                            ○ Tự nguyện
                          </span>
                        )}
                      </td>
                      <td data-label="Trạng thái">
                        {fee.active ? (
                          <span className="badge-pill badge-vacant">
                            ● Đang áp dụng
                          </span>
                        ) : (
                          <span className="badge-pill badge-inactive">
                            ● Tạm dừng
                          </span>
                        )}
                      </td>
                      <td data-label="Thao tác" style={{ textAlign: 'right' }}>
                        <div className="table-row-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => handleOpenRates(fee)}
                            title={`Xem và cấu hình các mốc biểu phí cho ${fee.name}`}
                          >
                            <CalendarIcon size={13} />
                            <span>Biểu phí</span>
                          </button>
                          {canWriteFees && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => handleOpenEditType(fee)}
                              title={`Chỉnh sửa thông tin ${fee.name}`}
                            >
                              <EditIcon size={13} />
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

        {/* Pagination Strip */}
        {totalPages > 1 && (
          <div className="pagination-strip">
            <div>
              Trang <strong>{page + 1}</strong> trên <strong>{totalPages}</strong>{' '}
              (Tổng cộng {totalElements} loại khoản thu)
            </div>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Trang trước
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages - 1 || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Trang sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Fee Type Modal */}
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

      {/* Rate Schedule Drawer/Modal */}
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
