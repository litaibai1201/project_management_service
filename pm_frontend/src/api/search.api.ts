import { post } from './httpClient'
import { ApiResponse, SearchPayload, SearchResult, PaginatedContent } from '@/types/api.types'

export const searchApi = {
  /** POST /api/search */
  search: (payload: SearchPayload): Promise<ApiResponse<PaginatedContent<SearchResult>>> =>
    post('/search', payload),

  /** POST /api/_paths */
  paths: (payload: { ids: string[] }) =>
    post('/_paths', payload),
}
