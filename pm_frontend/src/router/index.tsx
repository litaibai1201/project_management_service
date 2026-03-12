import React, { Suspense, lazy } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { Spin } from 'antd'

// ─── Layout / Guards ──────────────────────────────────────────────────────────
import AppLayout   from '@/components/common/AppLayout'
import PrivateRoute from '@/features/auth/PrivateRoute'

// ─── Lazy Page Imports ────────────────────────────────────────────────────────
const LoginPage        = lazy(() => import('@/features/auth/LoginPage'))
const DashboardPage    = lazy(() => import('@/features/auth/DashboardPage'))
const ProjectListPage  = lazy(() => import('@/features/project/ProjectListPage'))
const ProjectDetailPage= lazy(() => import('@/features/project/ProjectDetailPage'))
const ReviewListPage   = lazy(() => import('@/features/project/ReviewListPage'))
const DutyListPage     = lazy(() => import('@/features/duty/DutyListPage'))
const DutyDetailPage   = lazy(() => import('@/features/duty/DutyDetailPage'))
const UserMgmtPage     = lazy(() => import('@/features/user/UserManagementPage'))
const GroupMembersPage = lazy(() => import('@/features/group/GroupMembersPage'))
const SearchPage       = lazy(() => import('@/features/search/SearchPage'))
const StatisticsPage   = lazy(() => import('@/features/statistics/StatisticsPage'))
const DailyLogPage     = lazy(() => import('@/features/dailylog/DailyLogPage'))
const AnomalyPage      = lazy(() => import('@/features/anomaly/AnomalyPage'))
const WbsOverviewPage  = lazy(() => import('@/features/wbs/WbsOverviewPage'))

// ─── Loading Fallback ─────────────────────────────────────────────────────────
const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center h-64">
    <Spin size="large" />
  </div>
)

// ─── Router Config ────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  // Public route
  {
    path:    '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    ),
  },

  // Protected routes
  {
    element: <PrivateRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true,              element: <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense> },
          { path: 'projects',         element: <Suspense fallback={<PageLoader />}><ProjectListPage /></Suspense> },
          { path: 'projects/:id',     element: <Suspense fallback={<PageLoader />}><ProjectDetailPage /></Suspense> },
          { path: 'review',           element: <Suspense fallback={<PageLoader />}><ReviewListPage /></Suspense> },
          { path: 'duties',           element: <Suspense fallback={<PageLoader />}><DutyListPage /></Suspense> },
          { path: 'duties/:id',       element: <Suspense fallback={<PageLoader />}><DutyDetailPage /></Suspense> },
          { path: 'users',            element: <Suspense fallback={<PageLoader />}><UserMgmtPage /></Suspense> },
          { path: 'members',          element: <Suspense fallback={<PageLoader />}><GroupMembersPage /></Suspense> },
          { path: 'search',           element: <Suspense fallback={<PageLoader />}><SearchPage /></Suspense> },
          { path: 'statistics',       element: <Suspense fallback={<PageLoader />}><StatisticsPage /></Suspense> },
          { path: 'daily-log',        element: <Suspense fallback={<PageLoader />}><DailyLogPage /></Suspense> },
          { path: 'anomaly',          element: <Suspense fallback={<PageLoader />}><AnomalyPage /></Suspense> },
          { path: 'wbs',              element: <Suspense fallback={<PageLoader />}><WbsOverviewPage /></Suspense> },
        ],
      },
    ],
  },

  // Fallback
  { path: '*', element: <Navigate to="/" replace /> },
])

const AppRouter: React.FC = () => <RouterProvider router={router} />

export default AppRouter
