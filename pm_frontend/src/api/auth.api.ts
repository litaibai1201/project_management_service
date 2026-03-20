import { get, post } from './httpClient'
import { ApiResponse, LoginContent, LoginPayload, UserIndexContent, UserStatistical } from '@/types/api.types'

export const authApi = {
  /** POST /api/user/login */
  login: (payload: LoginPayload): Promise<ApiResponse<LoginContent>> =>
    post<LoginContent>('/user/login', payload),

  /** GET /api/user/index */
  getIndex: (): Promise<ApiResponse<UserIndexContent>> =>
    get<UserIndexContent>('/user/index'),

  /** GET /api/user/statistical */
  getStatistical: (): Promise<ApiResponse<UserStatistical>> =>
    get<UserStatistical>('/user/statistical'),

  /** GET /api/user/latest_news */
  getLatestNews: (params?: { page?: number; size?: number }) =>
    get('/user/latest_news', { params }),
}
