import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Layout, Menu, Avatar, Dropdown, Button, Typography, Badge,
  Popover, List, Empty, Input, Spin,
} from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  HomeIcon, FolderIcon, ClipboardDocumentListIcon, UsersIcon,
  ClipboardDocumentCheckIcon, MagnifyingGlassIcon,
  BellIcon, ArrowRightStartOnRectangleIcon, Bars3Icon,
  ChevronDoubleLeftIcon, ChartBarIcon, PencilSquareIcon,
  ExclamationTriangleIcon, TableCellsIcon, RectangleStackIcon,
  DocumentChartBarIcon, Squares2X2Icon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { logout } from '@/features/auth/authSlice'
import { useSocketConnection } from '@/hooks/useSocket'
import { notificationApi, type NotificationItem } from '@/api/notification.api'

const { Header, Sider, Content } = Layout
const { Text } = Typography

interface NavLeaf  { key: string; icon?: React.ReactNode; label: string; path: string; badge?: number }
interface NavGroup { key: string; icon: React.ReactNode; label: string; children: NavLeaf[] }
type NavItem = NavLeaf | NavGroup

// NotificationItem is imported from notification.api

const isGroup = (item: NavItem): item is NavGroup => 'children' in item

const NAV_ITEMS: NavItem[] = [
  { key: '/',           icon: <HomeIcon className="w-[18px] h-[18px]" />,                   label: '首頁',      path: '/'           },
  {
    key: '/project-mgmt',
    icon: <FolderIcon className="w-[18px] h-[18px]" />,
    label: '項目管理',
    children: [
      { key: '/projects',       icon: <RectangleStackIcon className="w-[16px] h-[16px]" />,       label: '專案列表', path: '/projects'       },
      { key: '/duties',         icon: <ClipboardDocumentListIcon className="w-[16px] h-[16px]" />, label: '任務列表', path: '/duties'         },
      { key: '/project-report',   icon: <DocumentChartBarIcon className="w-[16px] h-[16px]" />,  label: '項目報表',   path: '/project-report'   },
      // { key: '/dept-tasks', icon: <Squares2X2Icon className="w-[16px] h-[16px]" />, label: '部門任務', path: '/dept-tasks' }, // TODO: 功能開發中，暫時隱藏
    ],
  },
  { key: '/daily-log',  icon: <PencilSquareIcon className="w-[18px] h-[18px]" />,           label: '工作日誌',  path: '/daily-log'  },
  {
    key: '/review-mgmt',
    icon: <ClipboardDocumentCheckIcon className="w-[18px] h-[18px]" />,
    label: '審核管理',
    children: [
      { key: '/review',           icon: <ClipboardDocumentCheckIcon className="w-[16px] h-[16px]" />, label: '待我審核', path: '/review'           },
      { key: '/review/reviewed',  icon: <ClipboardDocumentListIcon  className="w-[16px] h-[16px]" />, label: '我的審核', path: '/review/reviewed'  },
      { key: '/review/submitted', icon: <ClipboardDocumentListIcon  className="w-[16px] h-[16px]" />, label: '我的提交', path: '/review/submitted' },
    ],
  },
  { key: '/wbs',         icon: <TableCellsIcon className="w-[18px] h-[18px]" />,             label: '專案進度總覽', path: '/wbs'     },
  { key: '/statistics', icon: <ChartBarIcon className="w-[18px] h-[18px]" />,               label: '統計與成員', path: '/statistics' },
  { key: '/anomaly',    icon: <ExclamationTriangleIcon className="w-[18px] h-[18px]" />,    label: '異常管理',  path: '/anomaly'    },
  { key: '/users',      icon: <UsersIcon className="w-[18px] h-[18px]" />,                  label: '用戶管理',  path: '/users'      },
]

// Relative time helper
const relativeTime = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)   return '剛剛'
  if (mins < 60)  return `${mins} 分鐘前`
  if (hours < 24) return `${hours} 小時前`
  if (days < 7)   return `${days} 天前`
  return dateStr.slice(0, 10)
}

const AppLayout: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { name, workNo, indexData, isSupervisor, isManagerView } = useAppSelector((s) => s.auth)

  const [collapsed,     setCollapsed]     = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchVal,     setSearchVal]     = useState('')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [notifLoading,  setNotifLoading]  = useState(false)
  const [notifOpen,     setNotifOpen]     = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  useSocketConnection()

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true)
    try {
      const res = await notificationApi.list()
      const c = res.content as { data_list: NotificationItem[]; unread_count: number }
      setNotifications(c.data_list ?? [])
      setUnreadCount(c.unread_count ?? 0)
    } catch { /* ignore */ }
    finally { setNotifLoading(false) }
  }, [])

  // Initial load + poll unread count every 2 min
  useEffect(() => {
    loadNotifications()
    pollRef.current = setInterval(loadNotifications, 120_000)
    return () => clearInterval(pollRef.current)
  }, [loadNotifications])

  const pendingReview = (indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0)

  const navItems = useMemo(() => {
    return NAV_ITEMS.map((item) => {
      if (!isGroup(item)) return item
      if (item.key !== '/project-mgmt') return item
      return {
        ...item,
        children: item.children.filter((c) => {
          if (c.key === '/dept-tasks') return isSupervisor
          return true
        }),
      }
    }).filter((item) => {
      if (item.key === '/wbs' || item.key === '/anomaly') return isSupervisor
      if (item.key === '/daily-log') return !isManagerView
      return true
    })
  }, [isSupervisor, isManagerView])

  // Find the currently active leaf key by checking paths
  const currentKey = useMemo(() => {
    for (const item of navItems) {
      if (isGroup(item)) {
        // Sort by path length desc so longer paths match first (e.g. /review/submitted before /review)
        const sorted = [...item.children].sort((a, b) => b.path.length - a.path.length)
        const child = sorted.find((c) =>
          c.path === '/' ? location.pathname === '/' : location.pathname.startsWith(c.path),
        )
        if (child) return child.key
      } else {
        if (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path))
          return item.key
      }
    }
    return '/'
  }, [navItems, location.pathname])

  // Default open group keys so sub-menu stays expanded
  const defaultOpenKeys = useMemo(
    () => navItems.filter(isGroup).map((g) => g.key),
    [],
  )

  // Label shown in header breadcrumb
  const currentLabel = useMemo(() => {
    for (const item of navItems) {
      if (isGroup(item)) {
        const child = item.children.find((c) => c.key === currentKey)
        if (child) return `${item.label} / ${child.label}`
      } else if (item.key === currentKey) {
        return item.label
      }
    }
    return '首頁'
  }, [navItems, currentKey])

  // Build Ant Design Menu items from NavItem[]
  const buildMenuItems = (items: NavItem[]): import('antd').MenuProps['items'] =>
    items.map((item) => {
      if (isGroup(item)) {
        return {
          key: item.key,
          icon: item.icon,
          label: item.label,
          children: item.children.map((c) => {
            const childBadge = c.key === '/review' ? pendingReview : undefined
            return {
              key: c.key,
              icon: c.icon,
              label: childBadge != null && childBadge > 0 ? (
                <div className="flex items-center justify-between">
                  <span>{c.label}</span>
                  <Badge count={childBadge} size="small" style={{ backgroundColor: '#ef4444', fontSize: 10, boxShadow: 'none' }} />
                </div>
              ) : c.label,
              onClick: () => navigate(c.path),
            }
          }),
        }
      }
      const leaf = item as NavLeaf
      return {
        key: leaf.key,
        icon: leaf.icon,
        label: leaf.label,
        onClick: () => navigate(leaf.path),
      }
    })

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch { /* ignore */ }
  }

  const handleNotifClick = async (n: NotificationItem) => {
    // Mark as read
    if (!n.is_read) {
      notificationApi.markRead(n.id).catch(() => {})
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x))
      setUnreadCount((c) => Math.max(0, c - 1))
    }
    setNotifOpen(false)
    // Navigate to linked resource
    if (n.link_type === 'review')   navigate('/review')
    else if (n.link_type === 'project' && n.link_id) navigate(`/projects/${n.link_id}`)
    else if (n.link_type === 'duty' && n.link_id) navigate(`/duties?dutyId=${n.link_id}&tab=duty`)
    else if (n.link_type === 'duty') navigate('/duties?tab=duty')
  }

  const handleLogout = () => { dispatch(logout()); navigate('/login', { replace: true }) }

  const handleSearch = (v: string) => {
    if (v.trim()) {
      navigate(`/search?q=${encodeURIComponent(v.trim())}`)
      setSearchVal('')
      setSearchVisible(false)
    }
  }

  const notifContent = (
    <div style={{ width: 340 }}>
      <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-100">
        <span className="font-semibold text-slate-700 text-sm">
          通知
          {unreadCount > 0 && (
            <span className="ml-1.5 text-xs font-normal text-blue-500">{unreadCount} 條未讀</span>
          )}
        </span>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={handleMarkAllRead} className="text-xs p-0">全部標為已讀</Button>
        )}
      </div>
      {notifLoading && notifications.length === 0 ? (
        <div className="flex justify-center py-8"><Spin size="small" /></div>
      ) : notifications.length === 0 ? (
        <Empty description="暫無通知" className="py-6" />
      ) : (
        <List
          dataSource={notifications}
          style={{ maxHeight: 400, overflowY: 'auto' }}
          renderItem={(n) => (
            <List.Item
              onClick={() => handleNotifClick(n)}
              style={{ padding: '8px 6px', cursor: n.link_type ? 'pointer' : 'default', borderBottom: 'none' }}
              className={`rounded-lg hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-blue-50/60' : ''}`}
            >
              <div className="flex gap-2.5 w-full">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.is_read ? 'bg-slate-200' : 'bg-blue-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{n.title}</div>
                  {n.desc && <div className="text-xs text-slate-400 mt-0.5 truncate">{n.desc}</div>}
                  <div className="text-xs text-slate-300 mt-0.5">{relativeTime(n.created_at)}</div>
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
          defaultOpenKeys={defaultOpenKeys}
          style={{ background: 'transparent', border: 'none', marginTop: 8 }}
          items={buildMenuItems(navItems)}
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
              {currentLabel}
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

            <Popover
              content={notifContent}
              trigger="click"
              placement="bottomRight"
              arrow={false}
              open={notifOpen}
              onOpenChange={(open) => {
                setNotifOpen(open)
                if (open) loadNotifications()
              }}
              overlayInnerStyle={{ borderRadius: 12, padding: '12px 12px 8px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
            >
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
