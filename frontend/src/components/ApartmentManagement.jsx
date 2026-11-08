import { useState, useEffect, useCallback, useMemo } from 'react'
import { getApartmentsApi, getBuildingsApi } from '../api/apartments'
import { useAuth } from '../hooks/useAuth'
import ApartmentFormModal from './ApartmentFormModal'
import {
  ApartmentIcon,
  BuildingIcon,
  PlusIcon,
  SearchIcon,
  RefreshIcon,
  EditIcon,
  CheckCircleIcon,
} from './Icons'

export default function ApartmentManagement() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('apartment.write')

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

  // Load Buildings once for lookup and dropdowns
  const refreshBuildings = useCallback(() => {
    getBuildingsApi(0, 100)
      .then((data) => {
        const list = data.content || data.items || data || []
        setBuildings(Array.isArray(list) ? list : [])
      })
      .catch(() => {})
  }, [])

  // Load Apartments based on filters and pagination
  const refreshApartments = useCallback(() => {
    setLoading(true)
    setError('')
    getApartmentsApi({
      page,
      size: pageSize,
      buildingId: buildingFilter !== 'ALL' ? buildingFilter : null,
      status: statusFilter !== 'ALL' ? statusFilter : null,
      code: searchCode.trim() || null,
      sort: 'code,asc',
    })
      .then((data) => {
        const list = data.content || data.items || []
        setApartments(list)
        setTotalElements(data.totalElements ?? list.length)
        setTotalPages(data.totalPages ?? (list.length > 0 ? 1 : 0))
        setLoading(false)
      })
      .catch((err) => {
        setError(
          err.response?.data?.message ||
            'Không thể tải danh sách căn hộ. Vui lòng kiểm tra kết nối API.'
        )
        setLoading(false)
      })
  }, [page, pageSize, buildingFilter, statusFilter, searchCode])

  // Initial load with ignore flag
  useEffect(() => {
    let ignore = false
    getBuildingsApi(0, 100)
      .then((data) => {
        if (!ignore) {
          const list = data.content || data.items || data || []
          setBuildings(Array.isArray(list) ? list : [])
        }
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    getApartmentsApi({
      page,
      size: pageSize,
      buildingId: buildingFilter !== 'ALL' ? buildingFilter : null,
      status: statusFilter !== 'ALL' ? statusFilter : null,
      code: searchCode.trim() || null,
      sort: 'code,asc',
    })
      .then((data) => {
        if (!ignore) {
          const list = data.content || data.items || []
          setApartments(list)
          setTotalElements(data.totalElements ?? list.length)
          setTotalPages(data.totalPages ?? (list.length > 0 ? 1 : 0))
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(
            err.response?.data?.message ||
              'Không thể tải danh sách căn hộ. Vui lòng kiểm tra kết nối API.'
          )
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [page, pageSize, buildingFilter, statusFilter, searchCode])

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
    setBuildings((prev) => [...prev, newBuilding])
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

      {/* Metric Stat Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-title">Tổng số Căn hộ</span>
            <div className="metric-icon-box metric-blue">
              <ApartmentIcon size={18} />
            </div>
          </div>
          <div className="metric-value">{stats.total}</div>
          <div className="metric-footer text-muted">Bản ghi hệ thống</div>
        </div>

        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-title">Đang có người ở</span>
            <div className="metric-icon-box metric-indigo">
              <BuildingIcon size={18} />
            </div>
          </div>
          <div className="metric-value">{stats.pageOccupied}</div>
          <div className="metric-footer text-success">Đã bàn giao & cư trú</div>
        </div>

        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-title">Căn còn trống</span>
            <div className="metric-icon-box metric-emerald">
              <CheckCircleIcon size={18} />
            </div>
          </div>
          <div className="metric-value">{stats.pageVacant}</div>
          <div className="metric-footer text-muted">Sẵn sàng bàn giao</div>
        </div>

        <div className="metric-card">
          <div className="metric-card-header">
            <span className="metric-title">Tạm ngưng / Bảo trì</span>
            <div className="metric-icon-box metric-amber">
              <ApartmentIcon size={18} />
            </div>
          </div>
          <div className="metric-value">{stats.pageInactive}</div>
          <div className="metric-footer text-muted">Chưa khả dụng</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-card">
        <div className="filter-grid">
          {/* Search by room code */}
          <div className="filter-item search-filter-item">
            <label htmlFor="search-apt-code" className="filter-label">
              Mã căn hộ:
            </label>
            <div className="search-input-wrapper">
              <SearchIcon size={16} className="search-icon" />
              <input
                type="search"
                id="search-apt-code"
                placeholder="Tìm mã phòng (VD: P1001)…"
                value={searchCode}
                onChange={(e) => {
                  setSearchCode(e.target.value)
                  setPage(0)
                }}
                className="form-input search-input"
              />
            </div>
          </div>

          {/* Filter by Building */}
          <div className="filter-item">
            <label htmlFor="filter-building" className="filter-label">
              Tòa nhà:
            </label>
            <select
              id="filter-building"
              value={buildingFilter}
              onChange={(e) => {
                setBuildingFilter(e.target.value)
                setPage(0)
              }}
              className="form-input form-select"
            >
              <option value="ALL">Tất cả tòa nhà</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Status */}
          <div className="filter-item">
            <label htmlFor="filter-status" className="filter-label">
              Trạng thái:
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(0)
              }}
              className="form-input form-select"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="VACANT">Căn trống (VACANT)</option>
              <option value="OCCUPIED">Đang có người ở (OCCUPIED)</option>
              <option value="INACTIVE">Tạm ngưng (INACTIVE)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Responsive Table Wrapper per Modern Web Guidance */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="apt-table-caption"
        className="table-container-wrapper"
      >
        <table className="modern-table apartment-table">
          <caption id="apt-table-caption" className="visually-hidden">
            Danh sách căn hộ trong khu đô thị BlueMoon
          </caption>
          <thead>
            <tr>
              <th scope="col" className="col-code">Mã căn hộ</th>
              <th scope="col" className="col-building">Tòa nhà</th>
              <th scope="col" className="col-floor">Tầng</th>
              <th scope="col" className="col-area">Diện tích (m²)</th>
              <th scope="col" className="col-status">Trạng thái</th>
              {canWrite && <th scope="col" className="col-actions">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canWrite ? 6 : 5} className="table-loading-cell">
                  <div className="table-spinner">
                    <span className="spinner-dot" />
                    <span>Đang tải dữ liệu hồ sơ căn hộ…</span>
                  </div>
                </td>
              </tr>
            ) : apartments.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 6 : 5} className="table-empty-cell">
                  <div className="empty-state">
                    <div className="empty-icon-box">
                      <ApartmentIcon size={36} />
                    </div>
                    <h3>Chưa có hồ sơ căn hộ nào phù hợp</h3>
                    <p className="text-muted">
                      {searchCode || buildingFilter !== 'ALL' || statusFilter !== 'ALL'
                        ? 'Không tìm thấy căn hộ thỏa mãn bộ lọc hiện tại. Hãy thử thay đổi từ khóa.'
                        : 'Bắt đầu khởi tạo dữ liệu bằng cách thêm căn hộ đầu tiên vào hệ thống.'}
                    </p>
                    {canWrite && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm mt-3"
                        onClick={handleOpenCreate}
                      >
                        <PlusIcon size={16} />
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
                    <th scope="row" className="cell-code" data-label="Mã căn hộ">
                      <div className="apt-code-badge">
                        <ApartmentIcon size={15} className="apt-badge-icon" />
                        <span className="code-text">{apt.code}</span>
                      </div>
                    </th>
                    <td data-label="Tòa nhà" className="cell-building">
                      <span className="building-text">{bName}</span>
                    </td>
                    <td data-label="Tầng" className="cell-floor">
                      <span className="floor-badge">Tầng {apt.floorNo}</span>
                    </td>
                    <td data-label="Diện tích" className="cell-area">
                      <strong>{apt.areaM2}</strong> m²
                    </td>
                    <td data-label="Trạng thái" className="cell-status">
                      {apt.status === 'VACANT' && (
                        <span className="status-badge status-vacant">
                          ● Trống
                        </span>
                      )}
                      {apt.status === 'OCCUPIED' && (
                        <span className="status-badge status-occupied">
                          ● Đang ở
                        </span>
                      )}
                      {apt.status === 'INACTIVE' && (
                        <span className="status-badge status-inactive">
                          ● Tạm ngưng
                        </span>
                      )}
                      {!['VACANT', 'OCCUPIED', 'INACTIVE'].includes(apt.status) && (
                        <span className="status-badge status-other">
                          {apt.status}
                        </span>
                      )}
                    </td>
                    {canWrite && (
                      <td data-label="Thao tác" className="cell-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs btn-action-edit"
                          onClick={() => handleOpenEdit(apt)}
                          title={`Chỉnh sửa căn hộ ${apt.code}`}
                        >
                          <EditIcon size={14} />
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

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="pagination-bar">
          <div className="pagination-info">
            Trang <strong>{page + 1}</strong> trên <strong>{totalPages}</strong>{' '}
            (Tổng cộng {totalElements} căn hộ)
          </div>
          <div className="pagination-buttons">
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
