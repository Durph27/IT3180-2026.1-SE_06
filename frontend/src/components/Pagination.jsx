export default function Pagination({ page, totalPages, totalElements, unit, disabled = false, onPageChange }) {
  if (totalPages <= 1) return null
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-0 border-t border-solid border-slate-200 px-6 py-4 text-sm text-slate-600" aria-label="Phân trang">
      <span>Trang <strong className="text-slate-900">{page + 1}</strong>/{totalPages} · Tổng cộng {totalElements} {unit}</span>
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || page === 0} onClick={() => onPageChange(Math.max(0, page - 1))}>Trang trước</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>Trang sau</button>
      </div>
    </nav>
  )
}
