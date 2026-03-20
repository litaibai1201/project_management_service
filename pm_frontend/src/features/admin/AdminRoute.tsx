import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'

const AdminRoute: React.FC = () => {
  const { token, isAdmin } = useAppSelector((s) => s.auth)

  if (!token) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />

  return <Outlet />
}

export default AdminRoute
