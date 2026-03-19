import { get, post, del, postForm } from './httpClient'
import { ApiResponse } from '@/types/api.types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FileBizType =
  | 'project'
  | 'duty'
  | 'progress'
  | 'duty_progress'
  | 'daily_log'

export interface FileRecord {
  id: string
  biz_type: FileBizType
  biz_id: string
  minio_key: string
  file_name: string
  file_type: 'image' | 'file' | 'video'
  file_size: number
  uploader: string
  status: 1 | 0
  created_at: string
  url?: string   // generated presigned URL
}

export interface PresignedUrlResult {
  minio_key: string
  url: string
}

export interface UploadedFileInfo {
  file_id: string
  minio_key: string
  file_name: string
  file_type: string
  file_size: number
  url: string
}

// ─── File API ─────────────────────────────────────────────────────────────────

export const fileApi = {
  /**
   * POST /api/file/presigned_url
   * 批量獲取 MinIO presigned 下載 URL（Redis 緩存 55 min）
   */
  getPresignedUrls: (minoKeys: string[]): Promise<ApiResponse<PresignedUrlResult[]>> =>
    post('/file/presigned_url', { minio_keys: minoKeys }),

  /**
   * POST /api/file/upload  (multipart/form-data)
   * 通用文件上傳：images / files / videos
   */
  upload: (
    bizType: FileBizType,
    bizId: string,
    files: { images?: File[]; files?: File[]; videos?: File[] },
  ): Promise<ApiResponse<UploadedFileInfo[]>> => {
    const fd = new FormData()
    fd.append('biz_type', bizType)
    fd.append('biz_id', bizId)
    files.images?.forEach((f) => fd.append('images', f))
    files.files?.forEach((f) => fd.append('files', f))
    files.videos?.forEach((f) => fd.append('videos', f))
    return postForm('/file/upload', fd)
  },

  /**
   * GET /api/file/list?biz_type=&biz_id=
   * 列出指定業務關聯的所有文件
   */
  list: (bizType: FileBizType, bizId: string): Promise<ApiResponse<FileRecord[]>> =>
    get('/file/list', { params: { biz_type: bizType, biz_id: bizId } }),

  /**
   * DELETE /api/file/:file_id
   * 軟刪除文件記錄並清理 MinIO 對象
   */
  delete: (fileId: string): Promise<ApiResponse<null>> =>
    del(`/file/${fileId}`),
}
