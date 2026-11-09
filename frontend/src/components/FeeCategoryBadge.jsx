import { FEE_CATEGORY } from '../utils/billingUtils'

export default function FeeCategoryBadge({ category }) {
  const mandatory = category === FEE_CATEGORY.MANDATORY
  const tone = mandatory ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return <span className={`ml-2 inline-block rounded-full border px-2.5 py-0.5 align-middle text-xs font-semibold ${tone}`}>{mandatory ? 'Bắt buộc' : 'Tự nguyện'}</span>
}
