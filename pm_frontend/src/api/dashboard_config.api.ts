import { get, put } from './httpClient'
import type { ApiResponse, WidgetConfig, DashboardViewType } from '@/types/api.types'

export interface WidgetSavePayload {
  widget_id:  string
  is_visible: boolean
  layout?:    { x: number; y: number; w: number; h: number } | null
}

export const dashboardConfigApi = {
  /** GET /api/dashboard/config?view_type=personal|manager */
  getConfig: (viewType: DashboardViewType): Promise<ApiResponse<WidgetConfig[]>> =>
    get<WidgetConfig[]>('/dashboard/config', { params: { view_type: viewType } }),

  /** PUT /api/dashboard/config — saves visibility and/or layout positions */
  saveConfig: (viewType: DashboardViewType, widgets: WidgetSavePayload[]) =>
    put('/dashboard/config', { view_type: viewType, widgets }),
}
