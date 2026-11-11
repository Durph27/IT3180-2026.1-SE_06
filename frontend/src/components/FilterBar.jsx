export default function FilterBar({ children }) {
  return <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-solid border-slate-200 bg-white p-4 shadow-xs">{children}</div>
}

export function FilterField({ id, label, children }) {
  return (
    <div className="min-w-0 flex-[1_1_220px]">
      <label htmlFor={id} className="mb-1.5 block font-semibold">{label}</label>
      {children}
    </div>
  )
}
