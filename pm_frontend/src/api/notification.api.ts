import { get, patch } from './httpClient'
import { ApiResponse } from '@/types/api.types'

export interface NotificationItem {
  id:         string
  title:      string
  desc:       string
  link_type:  'review' | 'project' | 'duty' | ''
  link_id:    string
  is_read:    boolean
  created_at: string
}

export interface NotificationListContent {
  data_list:    NotificationItem[]
  total_count:  number
  unread_count: number
}

export const notificationApi = {
  /** GET /api/notification/list?page=1&size=30 */
  list: (page = 1, size = 30): Promise<ApiResponse<NotificationListContent>> =>
    get(`/notification/list?page=${page}&size=${size}`),

  /** PATCH /api/notification/:id/read */
  markRead: (id: string): Promise<ApiResponse<null>> =>
    patch(`/notification/${id}/read`),

  /** PATCH /api/notification/read_all */
  markAllRead: (): Promise<ApiResponse<null>> =>
    patch('/notification/read_all'),
}
