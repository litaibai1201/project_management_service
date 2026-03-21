import React, { useState } from 'react'
import {
  Layout, Menu, Avatar, Dropdown, Button, Typography, Badge,
  Popover, List, Empty, Input,
} from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  HomeIcon, FolderIcon, ClipboardDocumentListIcon, UsersIcon,
  ClipboardDocumentCheckIcon, MagnifyingGlassIcon,
  BellIcon, ArrowRightStartOnRectangleIcon, Bars3Icon,
  ChevronDoubleLeftIcon, ChartBarIcon, PencilSquareIcon,
  ExclamationTriangleIcon, TableCellsIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { logout } from '@/features/auth/authSlice'
import { useSocketConnection } from '@/hooks/useSocket'

const { Header, Sider, Content } = Layout
const { Text } = Typography

interface NavItem { key: string; icon: React.ReactNode; label: string; path: string; badge?: number }
interface Notification { id: string; title: string; desc: string; time: string; read: boolean }

const NAV_ITEMS: NavItem[] = [
  { key: '/',            icon: <HomeIcon className="w-[18px] h-[18px]" />,                   label: '首頁',     path: '/'            },
  { key: '/projects',    icon: <FolderIcon className="w-[18px] h-[18px]" />,                 label: '專案管理', path: '/projects'    },
  { key: '/daily-log',   icon: <PencilSquareIcon className="w-[18px] h-[18px]" />,           label: '工作日誌', path: '/daily-log'   },
  { key: '/duties',      icon: <ClipboardDocumentListIcon className="w-[18px] h-[18px]" />,  label: '臨時任務', path: '/duties'      },
  { key: '/review',      icon: <ClipboardDocumentCheckIcon className="w-[18px] h-[18px]" />, label: '審核管理', path: '/review'      },
  { key: '/wbs',          icon: <TableCellsIcon className="w-[18px] h-[18px]" />,             label: '專案進度總覽', path: '/wbs'       },
  { key: '/statistics',  icon: <ChartBarIcon className="w-[18px] h-[18px]" />,               label: '統計與成員', path: '/statistics' },
  { key: '/anomaly',     icon: <ExclamationTriangleIcon className="w-[18px] h-[18px]" />,    label: '異常管理', path: '/anomaly'     },
  { key: '/users',       icon: <UsersIcon className="w-[18px] h-[18px]" />,                  label: '用戶管理', path: '/users'       },
]

const INIT_NOTIFS: Notification[] = [
  { id: '1', title: '專案「ERP系統改版」需要審核',  desc: '提交人：王小明',             time: '5 分鐘前', read: false },
  { id: '2', title: '任務「API整合」進度已更新',    desc: '負責人更新進度至 80%',        time: '1 小時前', read: false },
  { id: '3', title: '您的申請已通過審核',           desc: '「行動端改版」立案審核通過',  time: '昨天',     read: true  },
]

const AppLayout: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { name, workNo, indexData, isSupervisor, isManagerView } = useAppSelector((s) => s.auth)

  const [collapsed,     setCollapsed]     = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchVal,     setSearchVal]     = useState('')
  const [notifications, setNotifications] = useState<Notification[]>(INIT_NOTIFS)

  useSocketConnection()

  const pendingReview = (indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0)
  const unreadCount   = notifications.filter((n) => !n.read).length

  const navItems = NAV_ITEMS
    .filter((item) => {
      if (item.key === '/wbs' || item.key === '/anomaly') return isSupervisor
      if (item.key === '/daily-log') return !isManagerView
      return true
    })
    .map((item) => item.key === '/review' ? { ...item, badge: pendingReview } : item)

  const markAllRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))

  const handleLogout = () => { dispatch(logout()); navigate('/login', { replace: true }) }

  const handleSearch = (v: string) => {
    if (v.trim()) {
      navigate(`/search?q=${encodeURIComponent(v.trim())}`)
      setSearchVal('')
      setSearchVisible(false)
    }
  }

  const currentKey = navItems.find((item) =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
  )?.key ?? '/'

  const notifContent = (
    <div style={{ width: 320 }}>
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-100">
        <span className="font-semibold text-slate-700 text-sm">通知</span>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={markAllRead} className="text-xs p-0">全部標為已讀</Button>
        )}
      </div>
      {notifications.length === 0 ? (
        <Empty description="暫無通知" className="py-6" />
      ) : (
        <List
          dataSource={notifications}
          renderItem={(n) => (
            <List.Item
              style={{ padding: '8px 6px', cursor: 'pointer', borderBottom: 'none' }}
              className={`rounded-lg hover:bg-slate-50 transition-colors ${!n.read ? 'bg-blue-50/60' : ''}`}
            >
              <div className="flex gap-2.5 w-full">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.read ? 'bg-slate-200' : 'bg-blue-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm leading-snug ${!n.read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{n.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{n.desc}</div>
                  <div className="text-xs text-slate-300 mt-0.5">{n.time}</div>
                </div>
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  )

  const userMenu = {
    items: [
      {
        key: 'profile', disabled: true,
        label: (
          <div className="py-1">
            <div className="font-semibold text-slate-800 text-sm">{name}</div>
            <div className="text-xs text-slate-400 mt-0.5">{workNo}</div>
          </div>
        ),
      },
      { type: 'divider' as const },
      { key: 'logout', label: '退出登入', icon: <ArrowRightStartOnRectangleIcon className="w-4 h-4" />, danger: true, onClick: handleLogout },
    ],
  }

  return (
    <Layout className="min-h-screen">
      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <Sider
        collapsed={collapsed}
        trigger={null}
        theme="dark"
        width={220}
        collapsedWidth={64}
        style={{
          position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 100,
          overflow: 'hidden', background: '#0f172a',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          transition: 'width 0.2s',
        }}
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <FolderIcon className="w-4 h-4 text-white" />
          </div>
          {!collapsed && <span className="ml-2.5 text-white font-bold text-sm truncate">專案管理系統</span>}
        </div>

        {/* Nav Menu */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[currentKey]}
          style={{ background: 'transparent', border: 'none', marginTop: 8 }}
          items={navItems.map((item) => ({
            key:   item.key,
            icon:  item.icon,
            label: (
              <div className="flex items-center justify-between">
                <span>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <Badge count={item.badge} size="small" style={{ backgroundColor: '#ef4444', fontSize: 10, boxShadow: 'none' }} />
                )}
              </div>
            ),
            onClick: () => navigate(item.path),
          }))}
        />

        {/* Collapse toggle */}
        <div
          onClick={() => setCollapsed((v) => !v)}
          className="absolute bottom-0 left-0 right-0 border-t flex items-center justify-center py-3 cursor-pointer hover:bg-white/5 transition-colors"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <ChevronDoubleLeftIcon
            className="w-4 h-4 text-slate-400 transition-transform duration-200"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0)' }}
          />
          {!collapsed && <span className="ml-1.5 text-slate-400 text-xs">收合</span>}
        </div>
      </Sider>

      {/* ─── Main ─────────────────────────────────────────────────────────── */}
      <Layout style={{ marginLeft: collapsed ? 64 : 220, transition: 'margin-left 0.2s', minHeight: '100vh' }}>
        {/* Header */}
        <Header style={{
          background: '#fff', borderBottom: '1px solid #e2e8f0',
          height: 56, lineHeight: '56px', padding: '0 20px',
          position: 'sticky', top: 0, zIndex: 99,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Left */}
          <div className="flex items-center gap-2">
            <Button type="text" size="small" icon={<Bars3Icon className="w-5 h-5 text-slate-500" />} onClick={() => setCollapsed((v) => !v)} />
            <span className="text-slate-500 text-sm font-medium hidden md:block">
              {navItems.find((n) => n.key === currentKey)?.label ?? '首頁'}
            </span>
          </div>

          {/* Right */}
          <div className="flex items-center gap-1">
            {searchVisible ? (
              <Input
                autoFocus size="small" style={{ width: 220, borderRadius: 8 }}
                placeholder="搜索專案、任務..."
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                onPressEnter={() => handleSearch(searchVal)}
                onBlur={() => { if (!searchVal) setSearchVisible(false) }}
                prefix={<MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400" />}
              />
            ) : (
              <Button type="text" size="small" onClick={() => setSearchVisible(true)}
                icon={<MagnifyingGlassIcon className="w-[18px] h-[18px] text-slate-500" />} />
            )}

            <Popover content={notifContent} trigger="click" placement="bottomRight" arrow={false}
              overlayInnerStyle={{ borderRadius: 12, padding: '12px 12px 8px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
              <Button type="text" size="small" style={{ display: 'flex', alignItems: 'center' }}>
                <Badge count={unreadCount} size="small" offset={[-2, 2]}>
                  <BellIcon className="w-[18px] h-[18px] text-slate-500" />
                </Badge>
              </Button>
            </Popover>

            <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']} arrow={false}>
              <div className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1 ml-1 transition-colors">
                <Avatar size={28} style={{ background: '#2563eb', fontSize: 12, fontWeight: 700 }}>
                  {name?.[0]?.toUpperCase()}
                </Avatar>
                <Text className="text-sm font-medium text-slate-700 hidden sm:block">{name}</Text>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ background: '#f1f5f9', minHeight: 'calc(100vh - 56px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
