import { post } from './httpClient'
import { ApiResponse, SearchPayload, SearchResult, PaginatedContent } from '@/types/api.types'

const IS_DEV = import.meta.env.DEV

export const searchApi = {
  /** POST /api/search */
  search: async (payload: SearchPayload): Promise<ApiResponse<PaginatedContent<SearchResult>>> => {
    if (IS_DEV) {
      const { MOCK_SEARCH_DATA, paginate, delay } = await import('@/mocks/mockData')
      await delay(300)
      const kw = (payload.keyword ?? '').toLowerCase()
      let results = MOCK_SEARCH_DATA
      if (kw) results = results.filter((r) => r.title.toLowerCase().includes(kw))
      if (payload.type) results = results.filter((r) => r.type === payload.type)
      return paginate(results, payload.page ?? 1, payload.size ?? 20)
    }
    return post('/search', payload)
  },

  /** POST /api/_paths */
  paths: (payload: { ids: string[] }) =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: {} })
      : post('/_paths', payload),
}
