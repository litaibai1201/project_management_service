// ─── Generic API Response Wrapper ────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  code: string
  msg: string
  content: T
}

export interface PaginatedContent<T> {
  total_page: number
  total_count: number
  project_list?: T[]
  data_list?: T[]
  [key: string]: unknown
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginPayload {
  work_no: string
  password: string
  location: string
}

export interface LoginContent {
  access_token: string
  work_no: string
  name: string
  role_code: string | null
  role_name: string | null
  is_supervisor: boolean
  is_admin: boolean
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  work_no: string
  name: string
  department: string
  position?: string
  email?: string
  phone?: string
}

export interface UserIndexContent {
  total_task_num: {
    doing_task:   number
    unstart_task: number
    doing_duty:   number
    unstart_duty: number
  }
  total_progress_record_num: number
  total_awaiting_review_num: {
    project: number
    duty:    number
  }
}

export interface TeamStatistical {
  team_project: { total: number; in_progress: number; completed: number }
  team_task: {
    total: number; in_progress: number; not_started: number
    completed: number; overdue: number; urgent: number
  }
  pending: { review: number; progress_update: number }
  team_size: number
}

export interface UserStatistical {
  total_projects:       number
  total_duties:         number
  completed:            number
  in_progress:          number
  project_total:        number
  project_completed:    number
  project_in_progress:  number
}

// ─── Project ──────────────────────────────────────────────────────────────────

export type ProjectStatus = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
// 1=草稿 2=立案審核 3=規劃中 4=規劃審核 5=執行中 6=完結審核 7=完結 8=擱置 9=刪除

export interface Project {
  id: string
  project_nm: string
  describe?: string
  department: string
  product_pm: string
  project_pm: string
  creator: string
  status: ProjectStatus
  priority: number
  expected_end_date?: string
  end_time?: string
  code_url?: string
  group_id: string
  created_at: string
  updated_at?: string
  progress?: number
}

export interface ProjectListItem {
  id: string
  project_nm: string
  department: string
  status: ProjectStatus
  priority: number
  product_pm: string
  project_pm: string
  progress?: number
  expected_end_date?: string
}

export interface CreateProjectPayload {
  project_nm: string
  describe?: string
  department: string
  product_pm?: string
  project_pm: string
  expected_end_date?: string
  priority: number
  group_id: string
  code_url?: string
  reviewer?: string[]
}

export interface ProjectListQuery {
  page: number
  size?: number
  keyword?: string
  status?: number
  orderby?: string
  project_pm?: string
  group_id?: string
  work_no?: string
  manager_view?: boolean
}

// ─── Function / Task ─────────────────────────────────────────────────────────

export type FunctionStatus = 1 | 2 | 3 | 4 | 8 | 9
// 1=待開始 2=進行中 3=完結審核 4=已完結 8=擱置 9=刪除

export interface ProjectFunction {
  id: string
  function_nm: string
  describe?: string
  project_id: string
  developers?: string
  priority: number
  status: FunctionStatus
  progress: number
  expected_start_date?: string
  expected_end_date?: string
  start_time?: string
  end_time?: string
  group1: string
  group2?: string
}

export interface AddFunctionPayload {
  function_nm: string
  describe?: string
  expected_start_date?: string
  expected_end_date?: string
  developers?: string[]
  priority: number
  group1: string
  group2?: string
  reviewer?: string[]
}

export interface FunctionAllocationPayload {
  expected_start_date?: string
  expected_end_date?: string
  developers: string[]
}

// ─── Progress Record ──────────────────────────────────────────────────────────

export interface ProgressRecord {
  progress_id: string
  progress: number
  progress_record: string
  submitter: string
  created_at: string
  cooperator?: string
  time_consum: number
  files?: FileInfo[]
  images?: FileInfo[]
}

export interface CreateProgressPayload {
  progress: number
  progress_record?: string
  time_consum?: number
  cooperator?: string[]
  start_time?: string
}

export interface FileInfo {
  name: string
  url: string
  size?: number
}

// ─── Temporary Duty ───────────────────────────────────────────────────────────

export type DutyStatus = 0 | 1 | 2 | 3 | 8 | 9
// 0=草稿 1=進行中 2=完結審核 3=已完結 8=擱置 9=刪除

export interface TemporaryDuty {
  id: string
  duty_nm: string
  describe?: string
  creator: string
  responsible?: string
  status: DutyStatus
  priority: number
  progress: number
  expected_start_date?: string
  expected_end_date?: string
  start_time?: string
  end_time?: string
  latest_expected_end_date?: string
  revision_count?: number
}

export interface CreateDutyPayload {
  duty_nm: string
  describe?: string
  expected_start_date?: string
  expected_end_date?: string
  priority: number
  responsible?: string[]
}

export interface DutyListQuery {
  page: number
  size?: number
  keyword?: string
  status?: number
  priority?: number
  responsible?: string
}

// ─── Review / Apply ───────────────────────────────────────────────────────────

export interface ApplyRecord {
  id: string
  project_id?: string
  function_id?: string
  apply_type: string
  submitter: string
  reviewer: string
  status: number // 1=待審 2=通過 3=拒絕
  priority: number
  created_at: string
  project_nm?: string
  function_nm?: string
}

export interface ReviewPayload {
  status: number // 2=通過 3=拒絕
  reject_reason?: string
}

// ─── Group ────────────────────────────────────────────────────────────────────

export interface ProjectGroup {
  id: string
  group_nm: string
}

export interface MemberInfo {
  work_no: string
  name: string
  department: string
  position?: string
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchPayload {
  keyword: string
  page?: number
  size?: number
  type?: 'project' | 'duty'
}

export interface SearchResult {
  id: string
  type: 'project' | 'duty'
  title: string
  status: number
  created_at: string
}

// ─── Dashboard Widget Config ──────────────────────────────────────────────────

export type DashboardViewType = 'personal' | 'manager'

export interface WidgetConfig {
  widget_id:  string
  label:      string
  removable:  boolean
  is_visible: boolean
}
