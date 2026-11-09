import { useAuth } from '../hooks/useAuth'
import { hasRole } from '../auth/rbac'
import ForbiddenView from './ForbiddenView'

// Roles are additive. An omitted/empty allowlist never grants access.
export default function RoleGuard({ roles, children, fallback = <ForbiddenView />, pending = null }) {
  const auth = useAuth()
  if (auth.isLoading) return pending
  const allowed = auth.user && auth.isAuthenticated !== false
    && Array.isArray(roles) && roles.some((role) => hasRole(auth.roles, role))
  return allowed ? children : fallback
}
