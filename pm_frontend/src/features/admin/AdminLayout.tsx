import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, Avatar, Dropdown, theme } from 'antd'
import {
  DashboardOutlined,
  UserOutlined,
  SettingOutlined,
  FileTextOutlined,
  TeamOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DesktopOutlined,
} from '@ant-design/icons'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { logout } from '@/features/auth/authSlice'
import { showToast } from '@/utils/toast'

const { Sider, Header, Content } = Layout

const MENU_ITEMS = [
  { key: '/admin',          icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/admin/users',    icon: <UserOutlined />,      label: '用户管理' },
  { key: '/admin/systems',  icon: <DesktopOutlined />,   label: '系统资料' },
  { key: '/admin/config',   icon: <SettingOutlined />,   label: '系统配置' },
  { key: '/admin/logs',     icon: <FileTextOutlined />,  label: '操作日志' },
  { key: '/admin/admins',   icon: <TeamOutlined />,      label: '管理员账号' },
]

const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate  = useNavigate()
  const location  = useLocation()
  const dispatch  = useAppDispatch()
  const { name }  = useAppSelector((s) => s.auth)
  const { token: colorToken } = theme.useToken()

  const selectedKey = MENU_ITEMS.find((m) => m.key === location.pathname)?.key ?? '/admin'

  const handleLogout = () => {
    dispatch(logout())
    showToast.success('已登出')
    navigate('/login', { replace: true })
  }

  const userMenu = {
    items: [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '登出',
        danger: true,
        onClick: handleLogout,
      },
    ],
  }

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={220}
        style={{ background: '#001529', overflow: 'auto', height: '100vh', position: 'fixed', left: 0, top: 0, bottom: 0 }}
      >
        {/* Logo */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 20px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <SettingOutlined style={{ color: '#1677ff', fontSize: 22 }} />
          {!collapsed && (
            <span style={{ color: '#fff', fontWeight: 700, marginLeft: 10, fontSize: 15, whiteSpace: 'nowrap' }}>
              后台管理系统
            </span>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ marginTop: 8 }}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s', display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Header
          style={{
            background: colorToken.colorBgContainer,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            flexShrink: 0,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 18 }}
          />

          <Dropdown menu={userMenu} placement="bottomRight">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ background: '#1677ff' }} />
              <span style={{ fontSize: 14 }}>{name ?? '管理员'}</span>
            </div>
          </Dropdown>
        </Header>

        <Content style={{ margin: 24, overflowY: 'auto', flex: 1 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default AdminLayout
