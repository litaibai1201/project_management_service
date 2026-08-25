import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Spin, Result, Button } from 'antd'
import { useAppDispatch } from '@/hooks/redux'
import { ssoLoginDirect } from './authSlice'
import { showToast } from '@/utils/toast'

const SsoCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [error, setError] = useState<string | null>(null)
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const errorMsg = searchParams.get('error')
    if (errorMsg) {
      setError(errorMsg)
      return
    }

    const token = searchParams.get('token') || ''
    const userJson = searchParams.get('user') || ''
    const targetUrl = searchParams.get('target_url') || '/'

    if (!token) {
      setError('缺少登入令牌')
      return
    }

    try {
      const userInfo = userJson ? JSON.parse(userJson) : {}
      dispatch(ssoLoginDirect({
        access_token: token,
        work_no: userInfo.work_no || '',
        name: userInfo.name || '',
        department: userInfo.department || '',
        role_code: userInfo.role_code || null,
        role_name: userInfo.role_name || null,
        is_admin: userInfo.is_admin ?? false,
        is_supervisor: userInfo.is_supervisor ?? false,
      }))
      showToast.success('SSO 登入成功')
      navigate(targetUrl, { replace: true })
    } catch {
      setError('登入資訊解析失敗')
    }
  }, [searchParams, dispatch, navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
        <Result
          status="error"
          title="SSO 登入失敗"
          subTitle={error}
          extra={<Button type="primary" onClick={() => navigate('/login', { replace: true })}>返回登入頁</Button>}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="text-center">
        <Spin size="large" />
        <p className="mt-4 text-slate-500">正在驗證 SSO 登入...</p>
      </div>
    </div>
  )
}

export default SsoCallbackPage
