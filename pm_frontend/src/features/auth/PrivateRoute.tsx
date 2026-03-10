import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'

const PrivateRoute: React.FC = () => {
  const token = useAppSelector((s) => s.auth.token)
  return token ? <Outlet /> : <Navigate to="/login" replace />
}

export default PrivateRoute
