import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getApartmentsApi, getAllBuildingsApi } from '../api/apartments'
import { useAuth } from '../hooks/useAuth'
import ApartmentFormModal from './ApartmentFormModal'
import {
  ApartmentIcon,
  PlusIcon,
  SearchIcon,
  RefreshIcon,
  EditIcon,
  CheckCircleIcon,
} from './Icons'

export default function ApartmentManagement() {
  const { hasPermission } = useAuth()
  const canRead = hasPermission('apartment.read')
  const canWrite = hasPermission('apartment.write')
  const canReadBuildings = hasPermission('building.read')
  const [buildingLoading, setBuildingLoading] = useState(false)
  const [buildingError, setBuildingError] = useState('')
  const [buildingRevision, setBuildingRevision] = useState(0)
  const [revision, setRevision] = useState(0)
  const createdBuildings = useRef(new Map())

  // Data states
  const [apartments, setApartments] = useState([])
  const [buildings, setBuildings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Pagination states (Spring Boot 0-indexed)
  const [page, setPage] = useState(0)
  const [pageSize] = useState(15)
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Filters
  const [searchCode, setSearchCode] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingApartment, setEditingApartment] = useState(null)

  const refreshApartments = useCallback(() => setRevision((value) => value + 1), [])
  const refreshBuildings = useCallback(() => setBuildingRevision((value) => value + 1), [])

  useEffect(() => {
    if (!canRead || !canReadBuildings) return
    const controller = new AbortController()
    setBuildingLoading(true)
    setBuildingError('')
    getAllBuildingsApi({ signal: controller.signal })
      .then((list) => {
        if (controller.signal.aborted) return
        const merged = new Map(list.map((building) => [building.id, building]))
        createdBuildings.current.forEach((building, id) => {
          if (!merged.has(id)) merged.set(id, building)
        })
        setBuildings([...merged.values()])
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setBuildingError(err.response?.data?.message || 'Không thể tải danh sách tòa nhà. Vui lòng thử lại.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBuildingLoading(false)
      })
    return () => controller.abort()
  }, [canRead, canReadBuildings, buildingRevision])

  useEffect(() => {
    if (!canRead) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    getApartmentsApi({
      page,
      size: pageSize,
      buildingId: canReadBuildings && buildingFilter !== 'ALL' ? buildingFilter : null,
      status: statusFilter !== 'ALL' ? statusFilter : null,
      code: searchCode.trim() || null,
      sort: 'code,asc',
    }, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        const lastPage = Math.max(0, data.totalPages - 1)
        if (page > lastPage) {
          setPage(lastPage)
          return
        }
        setApartments(data.content)
        setTotalElements(data.totalElements)
        setTotalPages(data.totalPages)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setApartments([])
        setTotalElements(0)
        setTotalPages(0)
        setError(err.response?.data?.message || 'Không thể tải danh sách căn hộ. Vui lòng thử lại.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [canRead, canReadBuildings, page, pageSize, buildingFilter, statusFilter, searchCode, revision])

  // Building mapping lookup dictionary
  const buildingMap = useMemo(() => {
    const map = {}
    buildings.forEach((b) => {
      map[b.id] = b
    })
    return map
  }, [buildings])

  // Auto-dismiss success notification
  useEffect(() => {
    if (!successMsg) return
    const timer = setTimeout(() => {
      setSuccessMsg('')
    }, 4500)
    return () => clearTimeout(timer)
  }, [successMsg])

  // Quick stats calculation
  const stats = useMemo(() => {
    let vacant = 0
    let occupied = 0
    let inactive = 0
    apartments.forEach((apt) => {
      if (apt.status === 'VACANT') vacant += 1
      else if (apt.status === 'OCCUPIED') occupied += 1
      else if (apt.status === 'INACTIVE') inactive += 1
    })
    return {
      total: totalElements,
      pageVacant: vacant,
      pageOccupied: occupied,
      pageInactive: inactive,
    }
  }, [apartments, totalElements])

  // Handlers for modal
  const handleOpenCreate = () => {
    setEditingApartment(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (apt) => {
    setEditingApartment(apt)
    setIsModalOpen(true)
  }

  const handleModalSuccess = (msg) => {
    setSuccessMsg(msg)
    refreshApartments()
    refreshBuildings()
  }

  const handleBuildingCreated = (newBuilding) => {
    if (!newBuilding?.id) return
    createdBuildings.current.set(newBuilding.id, newBuilding)
    setBuildings((prev) => {
      if (prev.some((b) => b.id === newBuilding.id)) return prev
      return [...prev, newBuilding]
    })
  }

  if (!canRead) {
    return (
      <div className="apartment-page">
        <div className="alert-banner alert-danger" role="alert">
          <span className="alert-icon">⚠️</span>
          <span>Tài khoản của bạn không có quyền truy cập hồ sơ căn hộ (yêu cầu quyền apartment.read).</span>
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
            <ApartmentIcon size={24} />
          </div>
          <div>
            <h1 className="page-title">Hồ sơ Căn hộ</h1>
            <p className="page-description">
              Tạo mới và quản lý danh sách căn hộ, diện tích, tầng và tòa nhà trực thuộc
            </p>
          </div>
        </div>

        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={refreshApartments}
            title="Làm mới danh sách"
          >
            <RefreshIcon size={16} />
            <span>Làm mới</span>
          </button>
          {canWrite && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenCreate}
            >
              <PlusIcon size={18} />
              <span>Thêm căn hộ mới</span>
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

      {buildingError && (
        <div className="alert-banner alert-danger" role="alert">
          <span className="alert-icon">⚠️</span>
          <span>{buildingError}</span>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={refreshBuildings}
            style={{ marginLeft: 'auto' }}
          >
            Thử lại tòa nhà
          </button>
        </div>
      )}

      {/* Sleek Metric Strip */}
      <div className="stats-strip" aria-label="Thống kê căn hộ">
        <div className="stats-item">
          <span className="stats-label">TỔNG KHỚP BỘ LỌC</span>
          <div className="stats-value-row">
            <span className="stats-number stats-highlight-cobalt">{stats.total}</span>
            <span className="stats-subtext">Hồ sơ phù hợp</span>
          </div>
        </div>

        <div className="stats-item">
          <span className="stats-label">ĐANG Ở (TRANG NÀY)</span>
          <div className="stats-value-row">
            <span className="stats-number stats-highlight-teal">{stats.pageOccupied}</span>
            <span className="stats-subtext">Cư trú thực tế</span>
          </div>
        </div>

        <div className="stats-item">
          <span className="stats-label">CĂN TRỐNG (TRANG NÀY)</span>
          <div className="stats-value-row">
            <span className="stats-number">{stats.pageVacant}</span>
            <span className="stats-subtext">Sẵn sàng bàn giao</span>
          </div>
        </div>

        <div className="stats-item">
          <span className="stats-label">TẠM NGƯNG (TRANG NÀY)</span>
          <div className="stats-value-row">
            <span className="stats-number stats-highlight-amber">{stats.pageInactive}</span>
            <span className="stats-subtext">Chưa khả dụng</span>
          </div>
        </div>
      </div>

      {/* Integrated Filter Toolbar */}
      <div className="filter-toolbar">
        <div className="filter-group-left">
          <div className="search-input-box">
            <SearchIcon size={15} className="search-icon-inside" />
            <input
              type="search"
              id="search-apt-code"
              placeholder="Tìm theo mã phòng chính xác (VD: P1001)…"
              value={searchCode}
              onChange={(e) => {
                setSearchCode(e.target.value)
                setPage(0)
              }}
              className="form-input-search"
              title="Tìm chính xác theo mã căn hộ"
            />
          </div>

          <select
            id="filter-building"
            value={buildingFilter}
            onChange={(e) => {
              setBuildingFilter(e.target.value)
              setPage(0)
            }}
            className="filter-select"
            aria-label="Lọc theo tòa nhà"
            disabled={!canReadBuildings || buildingLoading}
          >
            {!canReadBuildings ? (
              <option value="ALL">Không có quyền xem tòa nhà</option>
            ) : (
              <>
                <option value="ALL">
                  {buildingLoading ? 'Đang tải danh sách tòa nhà…' : 'Tất cả tòa nhà'}
                </option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </>
            )}
          </select>

          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(0)
            }}
            className="filter-select"
            aria-label="Lọc theo trạng thái"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="VACANT">Căn trống (VACANT)</option>
            <option value="OCCUPIED">Đang có người ở (OCCUPIED)</option>
            <option value="INACTIVE">Tạm ngưng (INACTIVE)</option>
          </select>
        </div>
      </div>

      {/* Responsive Table Card per Modern Web Guidance */}
      <div className="table-surface-card">
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="apt-table-caption"
          className="table-scroll-region"
        >
          <table className="data-table">
            <caption id="apt-table-caption" className="visually-hidden">
              Danh sách căn hộ khu đô thị BlueMoon
            </caption>
            <thead>
              <tr>
                <th scope="col">Mã căn hộ</th>
                <th scope="col">Tòa nhà</th>
                <th scope="col">Tầng</th>
                <th scope="col" className="col-num">Diện tích (m²)</th>
                <th scope="col">Trạng thái</th>
                {canWrite && <th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} style={{ textAlign: 'center', padding: '36px' }}>
                    <span style={{ color: 'var(--slate-muted)' }}>Đang tải danh sách hồ sơ căn hộ…</span>
                  </td>
                </tr>
              ) : apartments.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 6 : 5}>
                    <div className="empty-table-state">
                      <div className="empty-table-icon">
                        <ApartmentIcon size={36} />
                      </div>
                      <div className="empty-table-title">Chưa có hồ sơ căn hộ phù hợp</div>
                      <p className="empty-table-desc">
                        {searchCode || buildingFilter !== 'ALL' || statusFilter !== 'ALL'
                          ? 'Không tìm thấy căn hộ khớp với điều kiện lọc hiện tại.'
                          : 'Bắt đầu khởi tạo dữ liệu bằng cách thêm căn hộ đầu tiên vào hệ thống.'}
                      </p>
                      {canWrite && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleOpenCreate}
                        >
                          <PlusIcon size={15} />
                          <span>Thêm căn hộ mới</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                apartments.map((apt) => {
                  const b = buildingMap[apt.buildingId]
                  const bName = b ? `${b.name} (${b.code})` : '—'

                  return (
                    <tr key={apt.id}>
                      <th scope="row" data-label="Mã căn hộ">
                        <span className="code-tag">{apt.code}</span>
                      </th>
                      <td data-label="Tòa nhà">
                        <span style={{ fontWeight: 500 }}>{bName}</span>
                      </td>
                      <td data-label="Tầng">
                        <span className="floor-tag">Tầng {apt.floorNo}</span>
                      </td>
                      <td data-label="Diện tích" className="col-num">
                        <strong>{apt.areaM2}</strong> m²
                      </td>
                      <td data-label="Trạng thái">
                        {apt.status === 'VACANT' && (
                          <span className="badge-pill badge-vacant">
                            ● Trống
                          </span>
                        )}
                        {apt.status === 'OCCUPIED' && (
                          <span className="badge-pill badge-occupied">
                            ● Đang ở
                          </span>
                        )}
                        {apt.status === 'INACTIVE' && (
                          <span className="badge-pill badge-inactive">
                            ● Tạm ngưng
                          </span>
                        )}
                        {!['VACANT', 'OCCUPIED', 'INACTIVE'].includes(apt.status) && (
                          <span className="badge-pill">
                            {apt.status}
                          </span>
                        )}
                      </td>
                      {canWrite && (
                        <td data-label="Thao tác" style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => handleOpenEdit(apt)}
                            title={`Chỉnh sửa thông tin căn hộ ${apt.code}`}
                          >
                            <EditIcon size={13} />
                            <span>Sửa</span>
                          </button>
                        </td>
                      )}
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
              (Tổng cộng {totalElements} căn hộ)
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

      {/* Create / Edit Form Modal */}
      {isModalOpen && (
        <ApartmentFormModal
          key={editingApartment?.id || 'new'}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setEditingApartment(null)
          }}
          onSuccess={handleModalSuccess}
          apartment={editingApartment}
          buildings={buildings}
          onBuildingCreated={handleBuildingCreated}
        />
      )}
    </div>
  )
}
