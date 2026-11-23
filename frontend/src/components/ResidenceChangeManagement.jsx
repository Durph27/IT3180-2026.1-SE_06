import { useEffect, useState } from 'react'
import {
  approveResidenceChangeApi,
  cancelResidenceChangeApi,
  getResidenceChangesApi,
  residenceChangeError,
} from '../api/residenceChanges.js'
import { getOpenHouseholdsApi, getResidentApi } from '../api/households.js'
import { useAuth } from '../hooks/useAuth.js'
import PageHeader from './PageHeader.jsx'
import StatCard from './StatCard.jsx'
import FilterBar, { FilterField } from './FilterBar.jsx'
import StatusBadge from './StatusBadge.jsx'
import Pagination from './Pagination.jsx'
import ForbiddenView from './ForbiddenView.jsx'
import TemporaryResidenceModal from './TemporaryResidenceModal.jsx'
import TemporaryAbsenceModal from './TemporaryAbsenceModal.jsx'
import RejectResidenceChangeModal from './RejectResidenceChangeModal.jsx'
import {
  RESIDENCE_CHANGE_STATUS,
  RESIDENCE_CHANGE_TYPES,
} from '../utils/residenceValidation.js'
import { CalendarIcon, PlusIcon, UsersIcon } from './Icons.jsx'

export default function ResidenceChangeManagement({ onBack }) {
  const auth = useAuth()
  const buildingWide = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'AUTHORITY'].some(auth.hasRole)
  const allowed = buildingWide
    ? auth.hasPermission('residence-change.read')
    : auth.householdIds.some((householdId) => auth.hasPermission('residence-change.read', { householdId }))

  if (!allowed) return <ForbiddenView onBack={onBack} />

  const scopeKey = JSON.stringify([auth.user?.id, auth.permissions, auth.roles, auth.householdIds])
  return <ResidenceChangeList key={scopeKey} buildingWide={buildingWide} />
}

function ResidenceChangeList({ buildingWide }) {
  const { user, householdIds, hasPermission } = useAuth()

  const [households, setHouseholds] = useState([])
  const [selectedHousehold, setSelectedHousehold] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')

  const [page, setPage] = useState(0)
  const [pageSize] = useState(10)
  const [data, setData] = useState({ content: [], totalPages: 0, totalElements: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Resident name cache
  const [residentNames, setResidentNames] = useState({})

  // Modals state
  const [isResidenceModalOpen, setIsResidenceModalOpen] = useState(false)
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false)
  const [rejectingChange, setRejectingChange] = useState(null)
  const [actionLoadingId, setActionLoadingId] = useState(null)

  const canWrite = buildingWide
    ? hasPermission('residence-change.write')
    : householdIds.some((id) => hasPermission('residence-change.write', { householdId: id }))

  const canApprove = hasPermission('residence-change.approve')

  // Load households for filter
  useEffect(() => {
    let ignore = false
    if (buildingWide) {
      getOpenHouseholdsApi()
        .then((rows) => {
          if (!ignore) setHouseholds(rows)
        })
        .catch(() => {
          if (!ignore) setHouseholds([])
        })
    } else {
      setHouseholds(householdIds.map((id) => ({ id, code: id })))
    }
    return () => {
      ignore = true
    }
  }, [buildingWide, householdIds])

  // Load residence changes
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')

    const params = {
      page,
      size: pageSize,
      sort: 'effectiveFrom,desc',
    }

    if (selectedHousehold) params.householdId = selectedHousehold
    else if (!buildingWide && householdIds.length > 0) params.householdId = householdIds[0]

    if (selectedType) params.changeType = selectedType
    if (selectedStatus) params.status = selectedStatus

    getResidenceChangesApi(params, controller.signal)
      .then(async (res) => {
        if (!controller.signal.aborted) {
          setData(res)
          setLoading(false)

          // Fetch names for residents
          const newlyFetched = {}
          const pendingFetch = []
          for (const item of res.content || []) {
            if (item.residentId && !residentNames[item.residentId] && !newlyFetched[item.residentId]) {
              pendingFetch.push(
                getResidentApi(item.residentId)
                  .then((r) => {
                    newlyFetched[item.residentId] = r.fullName
                  })
                  .catch(() => {
                    newlyFetched[item.residentId] = 'Nhân khẩu ' + item.residentId.slice(0, 8)
                  })
              )
            }
          }
          if (pendingFetch.length > 0) {
            await Promise.all(pendingFetch)
            if (!controller.signal.aborted) {
              setResidentNames((prev) => ({ ...prev, ...newlyFetched }))
            }
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setLoading(false)
          setError(residenceChangeError(err))
        }
      })

    return () => controller.abort()
  }, [page, pageSize, selectedHousehold, selectedType, selectedStatus, buildingWide, householdIds, refreshKey, residentNames])

  const handleApprove = async (item) => {
    setActionLoadingId(item.id)
    setError('')
    try {
      await approveResidenceChangeApi(item.id)
      setNotice('Đã duyệt yêu cầu biến động cư trú thành công.')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(residenceChangeError(err))
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleCancel = async (item) => {
    setActionLoadingId(item.id)
    setError('')
    try {
      await cancelResidenceChangeApi(item.id)
      setNotice('Đã hủy yêu cầu biến động cư trú.')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(residenceChangeError(err))
    } finally {
      setActionLoadingId(null)
    }
  }

  // Calculate quick stats from current page content
  const totalCount = data.totalElements || 0
  const pendingCount = (data.content || []).filter((item) => item.status === 'PENDING').length
  const approvedCount = (data.content || []).filter((item) => item.status === 'APPROVED').length
  const tempResidenceCount = (data.content || []).filter((item) => item.changeType === 'TEMPORARY_RESIDENCE').length

  const householdCode = (id) => households.find((h) => h.id === id)?.code || id.slice(0, 8)

  return (
    <div className="user-management-container">
      <PageHeader
        title="Quản lý tạm trú, tạm vắng"
        description="Đăng ký và theo dõi danh sách biến động tạm trú, tạm vắng của cư dân."
        actions={
          canWrite && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary min-h-11"
                onClick={() => {
                  setNotice('')
                  setIsResidenceModalOpen(true)
                }}
              >
                <PlusIcon size={16} />
                <span>Đăng ký tạm trú</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary min-h-11"
                onClick={() => {
                  setNotice('')
                  setIsAbsenceModalOpen(true)
                }}
              >
                <CalendarIcon size={16} />
                <span>Khai báo tạm vắng</span>
              </button>
            </div>
          )
        }
      />

      {notice && (
        <p className="alert alert-success" role="status">
          <span>{notice}</span>
        </p>
      )}

      {error && (
        <p className="alert alert-error" role="alert">
          <span>{error}</span>
        </p>
      )}

      {/* Row of StatCards */}
      <section aria-label="Thống kê biến động cư trú" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng số yêu cầu" value={totalCount} tone="default" icon={CalendarIcon} />
        <StatCard label="Chờ xét duyệt" value={pendingCount} tone="warning" icon={CalendarIcon} />
        <StatCard label="Đã phê duyệt" value={approvedCount} tone="success" icon={CalendarIcon} />
        <StatCard label="Đăng ký tạm trú" value={tempResidenceCount} tone="default" icon={UsersIcon} />
      </section>

      {/* FilterBar */}
      <FilterBar>
        {buildingWide && (
          <FilterField id="filter-household" label="Hộ gia đình">
            <select
              id="filter-household"
              className="form-control min-h-11 w-full"
              value={selectedHousehold}
              onChange={(e) => {
                setSelectedHousehold(e.target.value)
                setPage(0)
              }}
            >
              <option value="">Tất cả hộ gia đình</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  Hộ {h.code}
                </option>
              ))}
            </select>
          </FilterField>
        )}

        <FilterField id="filter-type" label="Loại biến động">
          <select
            id="filter-type"
            className="form-control min-h-11 w-full"
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Tất cả loại biến động</option>
            <option value="TEMPORARY_RESIDENCE">Tạm trú</option>
            <option value="TEMPORARY_ABSENCE">Tạm vắng</option>
          </select>
        </FilterField>

        <FilterField id="filter-status" label="Trạng thái">
          <select
            id="filter-status"
            className="form-control min-h-11 w-full"
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="PENDING">Chờ duyệt</option>
            <option value="APPROVED">Đã duyệt</option>
            <option value="REJECTED">Từ chối</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </FilterField>
      </FilterBar>

      {/* Table Card */}
      <section className="table-card" aria-labelledby="table-heading">
        <h2 id="table-heading" className="sr-only">
          Danh sách biến động cư trú
        </h2>

        <div className="table-wrapper" tabIndex={0} role="region" aria-label="Bảng danh sách biến động cư trú">
          <table className="modern-table">
            <caption className="sr-only">Danh sách yêu cầu tạm trú và tạm vắng</caption>
            <thead>
              <tr>
                <th scope="col">Loại biến động</th>
                <th scope="col">Nhân khẩu</th>
                <th scope="col">Hộ gia đình</th>
                <th scope="col">Thời gian hiệu lực</th>
                <th scope="col">Chi tiết</th>
                <th scope="col">Trạng thái</th>
                <th scope="col" className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    Đang tải danh sách biến động…
                  </td>
                </tr>
              ) : data.content?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Chưa có yêu cầu tạm trú hoặc tạm vắng nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                data.content?.map((item) => {
                  const statusInfo = RESIDENCE_CHANGE_STATUS[item.status] || {
                    label: item.status,
                    tone: 'neutral',
                  }
                  const typeInfo = RESIDENCE_CHANGE_TYPES[item.changeType] || {
                    shortLabel: item.changeType,
                  }
                  const residentDisplay = residentNames[item.residentId] || item.residentId?.slice(0, 8) || '—'
                  const isPending = item.status === 'PENDING'
                  const canCancel = isPending && (item.requestedBy === user?.id || !buildingWide)
                  const canActApprove = isPending && canApprove && item.requestedBy !== user?.id
                  const isBusy = actionLoadingId === item.id

                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="font-semibold text-slate-900">{typeInfo.shortLabel}</span>
                      </td>
                      <td>
                        <span className="font-medium text-slate-900">{residentDisplay}</span>
                      </td>
                      <td>
                        <span className="text-slate-700">Hộ {householdCode(item.householdId)}</span>
                      </td>
                      <td>
                        <span className="text-slate-600">
                          {item.effectiveFrom} &rarr; {item.effectiveTo || 'Không thời hạn'}
                        </span>
                      </td>
                      <td>
                        <span className="text-slate-600">
                          {item.details?.relationship ? `Quan hệ: ${item.details.relationship}` : ''}
                          {item.details?.decisionReason ? `Lý do: ${item.details.decisionReason}` : ''}
                          {!item.details?.relationship && !item.details?.decisionReason ? '—' : ''}
                        </span>
                      </td>
                      <td>
                        <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          {canActApprove && (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary min-h-9"
                                disabled={isBusy}
                                onClick={() => handleApprove(item)}
                              >
                                {isBusy ? '…' : 'Duyệt'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger min-h-9"
                                disabled={isBusy}
                                onClick={() => setRejectingChange(item)}
                              >
                                Từ chối
                              </button>
                            </>
                          )}
                          {canCancel && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline min-h-9"
                              disabled={isBusy}
                              onClick={() => handleCancel(item)}
                            >
                              {isBusy ? '…' : 'Hủy'}
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

        <Pagination
          page={page}
          totalPages={data.totalPages || 0}
          totalElements={data.totalElements || 0}
          unit="yêu cầu"
          disabled={loading}
          onPageChange={(nextPage) => setPage(nextPage)}
        />
      </section>

      {/* Temporary Residence Modal */}
      {isResidenceModalOpen && (
        <TemporaryResidenceModal
          isOpen={isResidenceModalOpen}
          initialHouseholdId={selectedHousehold || (householdIds.length > 0 ? householdIds[0] : (households[0]?.id || ''))}
          households={households}
          canSelectHousehold={buildingWide}
          onClose={() => setIsResidenceModalOpen(false)}
          onSuccess={(msg) => {
            setNotice(msg)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}

      {/* Temporary Absence Modal */}
      {isAbsenceModalOpen && (
        <TemporaryAbsenceModal
          isOpen={isAbsenceModalOpen}
          initialHouseholdId={selectedHousehold || (householdIds.length > 0 ? householdIds[0] : (households[0]?.id || ''))}
          households={households}
          canSelectHousehold={buildingWide}
          onClose={() => setIsAbsenceModalOpen(false)}
          onSuccess={(msg) => {
            setNotice(msg)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}

      {/* Reject Modal */}
      {rejectingChange && (
        <RejectResidenceChangeModal
          isOpen={Boolean(rejectingChange)}
          change={rejectingChange}
          onClose={() => setRejectingChange(null)}
          onSuccess={(msg) => {
            setNotice(msg)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
