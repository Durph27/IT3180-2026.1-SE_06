import { formatMoney } from '../../utils/billingUtils'
import { formatDateTimeVietnam } from '../../utils/maintenanceUtils'

const MONEY = 'text-right! tabular-nums whitespace-nowrap'

/** Money spent from the fund, newest first. */
export default function ExpenseList({ expenses, emptyAction }) {
  if (expenses.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-600">
        <p className="m-0 mb-3">Chưa có khoản chi nào.</p>
        {emptyAction}
      </div>
    )
  }
  const newestFirst = [...expenses].sort((a, b) => String(b.spentAt).localeCompare(String(a.spentAt)))
  return (
    <div className="table-wrapper">
      <table className="modern-table">
        <caption className="sr-only">Các khoản chi của quỹ</caption>
        <thead>
          <tr>
            <th scope="col">Ngày</th>
            <th scope="col">Nội dung</th>
            <th scope="col" className={MONEY}>Số tiền</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((expense) => (
            <tr key={expense.id}>
              <th scope="row" className="row-header-th whitespace-nowrap font-normal text-slate-600">{formatDateTimeVietnam(expense.spentAt)}</th>
              <td data-label="Nội dung">
                {expense.description}
                {expense.recordedByLabel && <span className="block text-xs text-slate-500">Ghi bởi {expense.recordedByLabel}</span>}
              </td>
              <td data-label="Số tiền" className={`${MONEY} font-semibold text-amber-800`}>{formatMoney(expense.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
