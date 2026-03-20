import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Select } from 'antd'
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
  { value: '鵬鼎園區', label: '鵬鼎園區' },
  { value: '禮鼎園區', label: '禮鼎園區' },
  { value: '大園園區', label: '大園園區' },
  { value: '先豐園區', label: '先豐園區' },
  { value: '印度園區', label: '印度園區' },
  { value: '鹏鼎园区', label: '鹏鼎园区' },
  { value: '礼鼎园区', label: '礼鼎园区' },
  { value: '大园园区', label: '大园园区' },
  { value: '先丰园区', label: '先丰园区' },
  { value: '印度园区', label: '印度园区' },
]

const LoginPage: React.FC = () => {
  const dispatch  = useAppDispatch()
  const navigate  = useNavigate()
  const isLoading = useAppSelector((s) => s.auth.isLoading)
  const [form] = Form.useForm<LoginFormValues>()

  const handleSubmit = async (values: LoginFormValues) => {
    try {
      const result = await dispatch(loginThunk(values)).unwrap()
      showToast.success('登入成功')
      if (result.is_admin) {
        navigate('/admin', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch (err: unknown) {
      showToast.error((err as string) || '登入失敗，請確認帳號密碼')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-10">

        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">專案管理系統</h1>
          <p className="text-gray-500 mt-1 text-sm">請使用工號登入</p>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ location: '鵬鼎園區' }}
        >
          <Form.Item
            name="work_no"
            label="工號"
            rules={[{ required: true, message: '請輸入工號' }]}
          >
            <Input
              prefix={<UserIcon className="w-4 h-4 text-gray-400" />}
              placeholder="請輸入工號"
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
              placeholder="請輸入密碼"
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
              登入
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}

export default LoginPage
