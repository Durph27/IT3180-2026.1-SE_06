import { useAuth } from '../hooks/useAuth'
import { canAccess } from '../auth/rbac'

// Wrap the component that fetches data, rather than only hiding its markup.
export default function PermissionGate({ permission, householdId, children, fallback = null, pending = null }) {
  const auth = useAuth()
  if (auth.isLoading) return pending
  return canAccess(auth, permission, { householdId }) ? children : fallback
}
