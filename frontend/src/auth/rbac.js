// UI policy for US21. Server permissions remain mandatory, including for ADMIN.
const residenceRead = [
  'building.read', 'apartment.read', 'household.read', 'occupancy.read',
  'resident.read', 'resident.identity.read', 'residence-change.read',
]
const residenceWrite = [
  'building.write', 'apartment.write', 'household.write', 'occupancy.write',
  'resident.write', 'residence-change.write', 'residence-change.approve',
]
const finance = [
  'fee-type.read', 'fee-type.write', 'fee-rate.read', 'fee-rate.write',
  'billing-period.read', 'billing-period.write', 'billing-period.issue',
  'billing-period.close', 'invoice.read', 'invoice.write', 'invoice.generate',
  'invoice.cancel', 'payment.read', 'payment.record', 'payment.void',
  'receipt.read', 'report.revenue', 'report.debts', 'report.contributions',
  'report.collections', 'report.export', 'maintenance-fund.read', 'maintenance-fund.write',
  'maintenance-round.read', 'maintenance-round.write',
  'maintenance-expense.read', 'maintenance-expense.record',
]
const resident = [
  'building.read', 'apartment.read', 'household.read', 'occupancy.read',
  'resident.read', 'residence-change.read', 'residence-change.write',
  'invoice.read', 'payment.read', 'receipt.read', 'payment-intent.read',
  'payment-intent.create', 'ticket.read', 'ticket.write', 'ticket.update',
]
const management = [
  ...residenceRead, ...residenceWrite, ...finance, ...resident,
  'user.read', 'user.write', 'user.manage',
]

// Four business groups; ADMIN and MANAGER share the management UI policy.
export const ROLE_PERMISSIONS = Object.freeze({
  ADMIN: Object.freeze([...new Set(management), 'role.read', 'rbac.manage']),
  MANAGER: Object.freeze([...new Set(management)]),
  ACCOUNTANT: Object.freeze([...residenceRead, ...finance]),
  AUTHORITY: Object.freeze([...residenceRead]),
  RESIDENT: Object.freeze([...resident]),
})

export function hasRole(roles, roleCode) {
  if (!Object.hasOwn(ROLE_PERMISSIONS, roleCode) || !Array.isArray(roles)) return false
  return roles.some((role) => (typeof role === 'string' ? role : role?.code) === roleCode)
}

/**
 * Deny by default. Non-resident roles use building-wide scope; resident grants
 * require an explicit household belonging to the authenticated profile.
 * Multiple roles are additive, matching the backend Actor scope model.
 */
export function canAccess(profile, permission, { householdId } = {}) {
  if (!profile?.user || profile.isLoading || profile.isAuthenticated === false) return false
  if (!Array.isArray(profile.permissions) || !profile.permissions.includes(permission)) return false

  return Object.entries(ROLE_PERMISSIONS).some(([role, allowed]) => {
    if (!hasRole(profile.roles, role) || !allowed.includes(permission)) return false
    if (role !== 'RESIDENT') return true
    return typeof householdId === 'string' && householdId.length > 0
      && Array.isArray(profile.householdIds) && profile.householdIds.includes(householdId)
  })
}
