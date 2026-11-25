import { useEffect, useMemo, useState } from 'react'
import { getAllResidentsApi } from '../api/residents'
import { apiErrorMessage } from '../api/errors'
import FilterBar, { FilterField } from './FilterBar'
import Pagination from './Pagination'
import ResidentTable from './ResidentTable'

const PAGE_SIZE = 15
const normalizeName = (value) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi')
  .trim().replace(/\s+/g, ' ')

export default function ResidentSearch({ field, onViewHistory }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const identity = field === 'identityNo'
  const label = identity ? 'CCCD' : 'Họ và tên'
  const loading = result?.revision !== revision

  useEffect(() => {
    const controller = new AbortController()
    getAllResidentsApi(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setResult({ revision, rows, error: '' })
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setResult({ revision, rows: [], error: apiErrorMessage(cause, 'Không tải được danh sách nhân khẩu. Vui lòng thử lại.') })
      })
    return () => controller.abort()
  }, [revision])

  const matches = useMemo(() => {
    const term = identity ? query.trim() : normalizeName(query)
    if (loading || !term) return []
    return result.rows.filter((resident) => {
      const value = identity ? String(resident.identityNo || '') : normalizeName(resident.fullName)
      return value.includes(term)
    })
  }, [result, loading, identity, query])
  const totalPages = Math.ceil(matches.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(0, totalPages - 1))

  return (
    <div className="flex flex-col gap-6">
      <FilterBar>
        <FilterField id="resident-search-value" label={label}>
          <input id="resident-search-value" type="search" className="form-control block min-h-11 w-full"
            inputMode={identity ? 'numeric' : 'text'} value={query}
            placeholder={identity ? 'Nhập số CCCD cần tìm' : 'Nhập họ tên có dấu hoặc không dấu'}
            onChange={(event) => { setQuery(event.target.value); setPage(0) }} />
        </FilterField>
      </FilterBar>
      {loading && <p role="status">Đang tải nhân khẩu…</p>}
      {!loading && result.error && (
        <div role="alert">
          <p>{result.error}</p>
          <button type="button" className="btn btn-outline" onClick={() => setRevision((value) => value + 1)}>Thử lại</button>
        </div>
      )}
      {!loading && !result.error && (query.trim() ? (
        <>
          <p role="status">Tìm thấy {matches.length} nhân khẩu.</p>
          {matches.length ? <ResidentTable residents={matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)}
            caption={`Kết quả tra cứu theo ${label}`} onViewHistory={onViewHistory} />
            : <p>Không tìm thấy nhân khẩu phù hợp.</p>}
          <Pagination page={currentPage} totalPages={totalPages} totalElements={matches.length}
            unit="nhân khẩu" onPageChange={setPage} />
        </>
      ) : <p role="status">Nhập {identity ? 'số CCCD' : 'họ và tên'} để tra cứu nhân khẩu.</p>)}
    </div>
  )
}
