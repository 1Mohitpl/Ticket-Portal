import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { UserRole } from '../../types'
import { useAuth } from '../../hooks/useAuth'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />

  return <Outlet />
}

export function RoleRoute({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (!profile || !roles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
