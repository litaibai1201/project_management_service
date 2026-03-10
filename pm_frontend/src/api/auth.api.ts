import { get, post } from './httpClient'
import { ApiResponse, LoginContent, LoginPayload, UserIndexContent, UserStatistical } from '@/types/api.types'

// ─── Dev Mock ─────────────────────────────────────────────────────────────────
// 在 import.meta.env.DEV 模式下（npm run dev），登录请求直接返回假数据，
// 无需访问真实 HR 接口，输入任意工号/密码均可登录成功。

const IS_DEV = import.meta.env.DEV

const mockLogin = (payload: LoginPayload): Promise<ApiResponse<LoginContent>> =>
  new Promise((resolve) =>
    setTimeout(() => {
      resolve({
        code: '0',
        msg: 'ok (mock)',
        content: {
          access_token: 'mock-dev-token-' + Date.now(),
          work_no: payload.work_no || 'DEV001',
          name: `測試用戶(${payload.work_no || 'DEV001'})`,
        },
      })
    }, 300),
  )

const mockIndex = (): Promise<ApiResponse<UserIndexContent>> =>
  Promise.resolve({
    code: '0',
    msg: 'ok (mock)',
    content: { project_count: 8, duty_count: 8, pending_review: 3, in_progress: 5 },
  })

export const authApi = {
  /** POST /api/user/login — DEV 模式下跳過真實接口，任意憑據均可登錄 */
  login: (payload: LoginPayload): Promise<ApiResponse<LoginContent>> =>
    IS_DEV ? mockLogin(payload) : post<LoginContent>('/user/login', payload),

  /** GET /api/user/index — DEV 模式下返回假統計數據 */
  getIndex: (): Promise<ApiResponse<UserIndexContent>> =>
    IS_DEV ? mockIndex() : get<UserIndexContent>('/user/index'),

  /** GET /api/user/statistical */
  getStatistical: (): Promise<ApiResponse<UserStatistical>> =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { total_projects: 8, total_duties: 8, completed: 3, in_progress: 5 } })
      : get<UserStatistical>('/user/statistical'),

  /** GET /api/user/latest_news */
  getLatestNews: (params?: { page?: number; size?: number }) =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { data_list: [], total_count: 0 } })
      : get('/user/latest_news', { params }),
}
