import { get, post } from './httpClient'

const IS_DEV = import.meta.env.DEV

export const groupApi = {
  /** GET /api/group/member */
  members: async (params?: { page?: number; size?: number; keyword?: string }) => {
    if (IS_DEV) {
      const { MOCK_GROUP_MEMBERS, paginate, delay } = await import('@/mocks/mockData')
      await delay(200)
      const kw = (params?.keyword ?? '').toLowerCase()
      const filtered = kw
        ? MOCK_GROUP_MEMBERS.filter((m) => m.name.includes(kw) || m.work_no.toLowerCase().includes(kw))
        : MOCK_GROUP_MEMBERS
      return paginate(filtered, params?.page ?? 1, params?.size ?? 20)
    }
    return get('/group/member', { params })
  },

  /** GET /api/group/member/:work_no/project_list */
  memberProjects: async (workNo: string, params?: { page?: number; size?: number }) => {
    if (IS_DEV) {
      const { MOCK_PROJECT_LIST, MOCK_FUNCTIONS, paginate, delay, ok } = await import('@/mocks/mockData')
      await delay(150)
      // find projects where the member appears in any function's developers field
      const allFuncs = Object.values(MOCK_FUNCTIONS).flat()
      const relatedPids = [...new Set(
        allFuncs.filter((f) => (f.developers ?? '').split(';').some((d) => d.trim() === workNo))
          .map((f) => f.project_id)
      )]
      const projects = relatedPids.length
        ? MOCK_PROJECT_LIST.filter((p) => relatedPids.includes(p.id))
        : MOCK_PROJECT_LIST.slice(0, 3)
      if (params?.page) return paginate(projects, params.page, params.size ?? 10)
      return ok({ data_list: projects, total_count: projects.length })
    }
    return get(`/group/member/${workNo}/project_list`, { params })
  },

  /** GET /api/group/member/:work_no/temporary_duty_list */
  memberDuties: async (workNo: string, params?: { page?: number; size?: number }) => {
    if (IS_DEV) {
      const { MOCK_DUTIES, paginate, delay } = await import('@/mocks/mockData')
      await delay(150)
      const duties = MOCK_DUTIES.filter((d) =>
        (d.responsible ?? '').split(';').some((r) => r.trim() === workNo)
      )
      return paginate(duties.length ? duties : MOCK_DUTIES.slice(0, 2), params?.page ?? 1, params?.size ?? 10)
    }
    return get(`/group/member/${workNo}/temporary_duty_list`, { params })
  },

  /** GET /api/group/member/:work_no/produce_report */
  produceReport: (workNo: string, params?: { start_date?: string; end_date?: string }) =>
    get(`/group/member/${workNo}/produce_report`, { params }),

  /** POST /api/group/member/:work_no/send_report */
  sendReport: (workNo: string, payload: { start_date: string; end_date: string; email?: string }) =>
    post(`/group/member/${workNo}/send_report`, payload),

  /** POST /api/group/member/:work_no/statistical_data */
  statisticalData: (workNo: string, payload: { start_date: string; end_date: string }) =>
    post(`/group/member/${workNo}/statistical_data`, payload),

  /** POST /api/group/member/:work_no/overview */
  overview: async (workNo: string, payload: { start_date: string; end_date: string }) => {
    if (IS_DEV) {
      const { getMemberOverview, delay, ok } = await import('@/mocks/mockData')
      await delay(200)
      return ok(getMemberOverview(workNo))
    }
    return post(`/group/member/${workNo}/overview`, payload)
  },

  /** GET /api/group/member/:work_no/schedule */
  schedule: (workNo: string, params?: { start_date?: string; end_date?: string }) =>
    get(`/group/member/${workNo}/schedule`, { params }),
}
