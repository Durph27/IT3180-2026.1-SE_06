import { useEffect, useState } from 'react'
import { getAllApartmentsApi } from '../api/apartments'
import { getActiveOccupanciesApi } from '../api/households'
import { todayInVietnam } from '../residents/validation'
import { householdPlaceLabel } from '../utils/billingUtils'

/**
 * Apartment codes of the given households ({ [householdId]: 'B1-0101' }), so residents see
 * where they live instead of an internal id. Both lists come back scoped to the caller's
 * households; a missing label stays '' and callers fall back to a neutral wording.
 */
export function useHouseholdPlaces(householdIds, enabled = true) {
  const key = enabled ? householdIds.join('|') : ''
  const [result, setResult] = useState({ key: '', labels: {} })

  useEffect(() => {
    if (!key) return undefined
    const controller = new AbortController()
    const { signal } = controller
    const at = todayInVietnam()
    Promise.all([getActiveOccupanciesApi(at, signal), getAllApartmentsApi({ signal })])
      .then(([occupancies, apartments]) => {
        if (signal.aborted) return
        const labels = {}
        for (const id of key.split('|')) labels[id] = householdPlaceLabel(id, { occupancies, apartments, at })
        setResult({ key, labels })
      })
      .catch(() => {
        if (!signal.aborted) setResult({ key, labels: {} })
      })
    return () => controller.abort()
  }, [key])

  return result.key === key ? result.labels : {}
}

/** "Căn B1-0101" for one household, "Hộ 2" style fallback while loading or when unknown. */
export function placeOptionLabel(labels, householdId, index = 0, total = 1) {
  const code = labels[householdId]
  if (code) return `Căn ${code}`
  return total > 1 ? `Hộ ${index + 1}` : 'Hộ của tôi'
}
