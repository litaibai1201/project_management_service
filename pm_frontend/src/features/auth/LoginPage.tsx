import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Select, Alert } from 'antd'
import { LockClosedIcon, UserIcon } from '@heroicons/react/24/outline'
import { loginThunk } from './authSlice'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { showToast } from '@/utils/toast'

interface LoginFormValues {
  work_no:  string
  password: string
  location: string
}

const LOCATION_OPTIONS = [
  { value: 'TW', label: '台灣' },
  { value: 'CN', label: '中國大陸' },
  { value: 'OTHER', label: '其他' },
]

// 是否处于 Vite 开发模式（npm run dev）
const IS_DEV = import.meta.env.DEV

const LoginPage: React.FC = () => {
  const dispatch  = useAppDispatch()
  const navigate  = useNavigate()
  const isLoading = useAppSelector((s) => s.auth.isLoading)
  const [form] = Form.useForm<LoginFormValues>()

  const handleSubmit = async (values: LoginFormValues) => {
    try {
      await dispatch(loginThunk(values)).unwrap()
      showToast.success('登入成功')
      navigate('/', { replace: true })
    } catch (err: unknown) {
      showToast.error((err as string) || '登入失敗，請確認帳號密碼')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-10">

        {/* Dev Mode Banner */}
        {IS_DEV && (
          <Alert
            type="warning"
            showIcon
            className="mb-6 rounded-lg"
            message="開發模式 — Mock 登入已啟用"
            description="輸入任意工號和密碼即可登入，不會請求真實 HR 接口。"
          />
        )}

        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">專案管理系統</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {IS_DEV ? '開發環境 · 任意輸入即可登入' : '請使用工號登入'}
          </p>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ location: 'TW', work_no: IS_DEV ? 'DEV001' : '' }}
        >
          <Form.Item
            name="work_no"
            label="工號"
            rules={[{ required: true, message: '請輸入工號' }]}
          >
            <Input
              prefix={<UserIcon className="w-4 h-4 text-gray-400" />}
              placeholder={IS_DEV ? '任意工號（開發模式）' : '請輸入工號'}
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密碼"
            rules={[{ required: true, message: '請輸入密碼' }]}
          >
            <Input.Password
              prefix={<LockClosedIcon className="w-4 h-4 text-gray-400" />}
              placeholder={IS_DEV ? '任意密碼（開發模式）' : '請輸入密碼'}
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="location"
            label="登入地點"
            rules={[{ required: true, message: '請選擇登入地點' }]}
          >
            <Select
              size="large"
              options={LOCATION_OPTIONS}
            />
          </Form.Item>

          <Form.Item className="mb-0 mt-4">
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={isLoading}
              className="bg-blue-600 hover:bg-blue-700 h-11 text-base font-medium"
            >
              {IS_DEV ? '模擬登入' : '登入'}
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}

export default LoginPage
