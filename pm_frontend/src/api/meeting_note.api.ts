import { get, post, put, del } from './httpClient'
import type { ApiResponse } from '@/types/api.types'

export interface MeetingNote {
  id:        string
  projectId: string
  taskId?:   string | null
  taskName?: string | null
  type:      '決策' | '行動項' | '風險' | '待確認'
  content:   string
  author:    string
  status:    'pending' | 'resolved'
  createdAt: string
}

export const meetingNoteApi = {
  /** GET /api/project/:projectId/meeting_notes */
  list: (projectId: string): Promise<ApiResponse<MeetingNote[]>> =>
    get(`/project/${projectId}/meeting_notes`),

  /** POST /api/project/:projectId/meeting_notes */
  create: (projectId: string, payload: {
    note_type: string
    content:   string
    task_id?:  string | null
    task_name?: string | null
  }): Promise<ApiResponse<MeetingNote>> =>
    post(`/project/${projectId}/meeting_notes`, payload),

  /** PUT /api/meeting_notes/:noteId/status */
  updateStatus: (noteId: string, status: 'pending' | 'resolved'): Promise<ApiResponse<MeetingNote>> =>
    put(`/meeting_notes/${noteId}/status`, { status }),

  /** DELETE /api/meeting_notes/:noteId */
  delete: (noteId: string): Promise<ApiResponse<null>> =>
    del(`/meeting_notes/${noteId}`),
}
