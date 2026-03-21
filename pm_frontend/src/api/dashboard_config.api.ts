import { get, put } from './httpClient'
import type { ApiResponse, WidgetConfig, DashboardViewType } from '@/types/api.types'

export const dashboardConfigApi = {
  /** GET /api/dashboard/config?view_type=personal|manager */
  getConfig: (viewType: DashboardViewType): Promise<ApiResponse<WidgetConfig[]>> =>
    get<WidgetConfig[]>('/dashboard/config', { params: { view_type: viewType } }),

  /** PUT /api/dashboard/config */
  saveConfig: (viewType: DashboardViewType, widgets: Pick<WidgetConfig, 'widget_id' | 'is_visible'>[]) =>
    put('/dashboard/config', { view_type: viewType, widgets }),
}
