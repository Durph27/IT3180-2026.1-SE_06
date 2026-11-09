import { useEffect, useState } from 'react'
import { getFeeTypesApi, getOpenInvoicesApi } from '../api/billing'
import { hasUnpaidMandatoryInvoice, STAFF_ROLES } from '../utils/billingUtils'
import { useAuth } from './useAuth'

export function useHasUnpaidBills() {
  const { householdIds, hasPermission, hasRole } = useAuth()
  const [result, setResult] = useState({ key: '', unpaid: false })
  const isResident = hasRole('RESIDENT') && !STAFF_ROLES.some((role) => hasRole(role))
  const readable = isResident ? householdIds.filter((householdId) => hasPermission('invoice.read', { householdId })) : []
  const key = readable.join('|')
  const canReadFeeTypes = readable.length > 0 && hasPermission('fee-type.read', { householdId: readable[0] })

  useEffect(() => {
    if (!key) return undefined
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([
      Promise.all(key.split('|').map((householdId) => getOpenInvoicesApi({ householdId }, signal))),
      canReadFeeTypes ? getFeeTypesApi(signal) : [],
    ]).then(([invoicesByHousehold, feeTypes]) => {
      if (!signal.aborted) setResult({ key, unpaid: hasUnpaidMandatoryInvoice({ invoices: invoicesByHousehold.flat(), feeTypes }) })
    }).catch(() => {
      // The emphasis is only a hint: the billing page reports real loading errors.
    })
    return () => controller.abort()
  }, [key, canReadFeeTypes])

  return Boolean(key) && result.key === key && result.unpaid
}
