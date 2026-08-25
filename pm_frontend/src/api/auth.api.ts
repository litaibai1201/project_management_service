import { get, post } from './httpClient'
import { ApiResponse, LoginContent, LoginPayload, UserIndexContent, UserStatistical, TeamStatistical } from '@/types/api.types'

export interface AlertTask {
  id: string; name: string; type: 'function' | 'duty'; project_id?: string | null; project_nm?: string | null
  responsible: string; expected_end_date: string; days_diff: number
}

export interface WeeklyActivityItem {
  day: string; date: string; project: number; duty: number
}

export interface NewsItem {
  id: string; action: string; subject: string
  type: 'progress' | 'duty_progress' | 'review'
  status?: string; created_at: string
}

export const authApi = {
  /** POST /api/user/login */
  login: (payload: LoginPayload): Promise<ApiResponse<LoginContent>> =>
    post<LoginContent>('/user/login', payload),

  /** POST /api/user/sso/login — IDaaS JWT SSO */
  ssoLogin: (token: string): Promise<ApiResponse<LoginContent>> =>
    post<LoginContent>('/user/sso/login', { token }),

  /** GET /api/user/index */
  getIndex: (): Promise<ApiResponse<UserIndexContent>> =>
    get<UserIndexContent>('/user/index'),

  /** GET /api/user/statistical */
  getStatistical: (): Promise<ApiResponse<UserStatistical>> =>
    get<UserStatistical>('/user/statistical'),

  /** GET /api/user/team_statistical */
  getTeamStatistical: (): Promise<ApiResponse<TeamStatistical>> =>
    get<TeamStatistical>('/user/team_statistical'),

  /** GET /api/user/weekly_activity */
  getWeeklyActivity: (): Promise<ApiResponse<WeeklyActivityItem[]>> =>
    get<WeeklyActivityItem[]>('/user/weekly_activity'),

  /** GET /api/user/alert_tasks */
  getAlertTasks: (): Promise<ApiResponse<AlertTask[]>> =>
    get<AlertTask[]>('/user/alert_tasks'),

  /** GET /api/user/latest_news */
  getLatestNews: (params?: { page?: number; size?: number }) =>
    get<{ total_count: number; data_list: NewsItem[] }>('/user/latest_news', { params }),
}
