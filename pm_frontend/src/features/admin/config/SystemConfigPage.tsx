import React, { useEffect, useState } from 'react'
import { Card, Form, Input, Button, Spin, Switch } from 'antd'
import { sysAdminApi, SystemConfig } from '@/api/sys_admin.api'
import { showToast } from '@/utils/toast'

const BOOL_KEYS = ['allow_register']

const SystemConfigPage: React.FC = () => {
  const [configs, setConfigs] = useState<SystemConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    sysAdminApi.getConfigs()
      .then((res) => {
        const list: SystemConfig[] = Array.isArray(res.content) ? res.content : []
        setConfigs(list)
        const init: Record<string, unknown> = {}
        list.forEach((c) => {
          init[c.config_key] = BOOL_KEYS.includes(c.config_key)
            ? c.config_value === 'true'
            : c.config_value
        })
        form.setFieldsValue(init)
      })
      .catch(() => showToast.error('加载配置失败'))
      .finally(() => setLoading(false))
  }, [form])

  const handleSave = async () => {
    const values = await form.validateFields()
    const payload: Record<string, string> = {}
    Object.entries(values).forEach(([k, v]) => {
      payload[k] = BOOL_KEYS.includes(k) ? String(v) : String(v ?? '')
    })
    setSaving(true)
    sysAdminApi.updateConfigs(payload)
      .then(() => showToast.success('配置已保存'))
      .catch(() => showToast.error('保存失败'))
      .finally(() => setSaving(false))
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24, fontWeight: 600 }}>系统配置</h2>
      <Card style={{ maxWidth: 640 }}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          {configs.map((cfg) => (
            <Form.Item
              key={cfg.config_key}
              name={cfg.config_key}
              label={cfg.description || cfg.config_key}
              valuePropName={BOOL_KEYS.includes(cfg.config_key) ? 'checked' : 'value'}
            >
              {BOOL_KEYS.includes(cfg.config_key)
                ? <Switch />
                : <Input />
              }
            </Form.Item>
          ))}

          <Form.Item style={{ marginTop: 8 }}>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default SystemConfigPage
