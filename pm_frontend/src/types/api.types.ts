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

export interface TeamBenefitProject {
  id:       string
  name:     string
  status:   number
  expected: number
  actual:   number | null
}

export interface TeamBenefitGroup {
  unit:     string
  expected: number
  actual:   number
  count:    number
  projects: TeamBenefitProject[]
}

export interface TeamStatistical {
  team_project: { total: number; in_progress: number; completed: number }
  team_task: {
    total: number; in_progress: number; not_started: number
    completed: number; overdue: number; urgent: number
  }
  pending: { review: number; progress_update: number }
  team_size: number
  team_benefit: TeamBenefitGroup[]
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

export type ProjectStatus = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
// 1=草稿 2=立案審核 3=規劃中 4=規劃審核 10=排程安排 11=排程審核 5=執行中 6=完結審核 7=完結 8=擱置 9=刪除

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
  expected_benefit?: string
  benefit_amount?: number | null
  benefit_unit?: string
  actual_benefit_amount?: number | null
  created_at: string
  updated_at?: string
  progress?: number
  can_edit?: boolean
  can_submit_review?: boolean
  can_set_project_pm?: boolean
  can_manage_files?: boolean
  has_approved_change_request?: boolean
  change_request_status?: number | null   // 1=待審 2=通過 3=拒絕 4=退回
  can_submit_change_request?: boolean
}

export interface ProjectFile {
  id:            string
  project_id:    string
  file_nm:       string
  file_size:     number
  file_ext:      string
  file_category: 'requirement' | 'design' | 'progress' | 'other'
  uploader:      string
  created_at:    string
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
  responsible?: string[]
  priority: number
  status: FunctionStatus
  progress: number
  expected_start_date?: string
  expected_end_date?: string
  original_end_date?: string
  reschedule_count?: number
  reschedule_history?: { from: string; to: string; reason: string; date: string; operator: string }[]
  start_time?: string
  end_time?: string
  group1: string
  group2?: string
}

export interface AddFunctionPayload {
  function_nm: string
  describe?: string
  responsible?: string[]
  expected_start_date?: string
  expected_end_date?: string
  priority: number
  group1: string
  group2?: string
  reviewer?: string[]
}

export interface FunctionAllocationPayload {
  expected_start_date?: string
  expected_end_date?: string
  responsible: string[]
}

// ─── Progress Record ──────────────────────────────────────────────────────────

export interface ProgressRecord {
  progress_id: string
  progress: number
  progress_record: string
  submitter: string
  created_at: string
  cooperator?: string[]
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
  group?: string
  project_id?: string
  project_nm?: string
  creator: string
  responsible?: string[]
  status: DutyStatus
  priority: number
  progress: number
  expected_start_date?: string
  expected_end_date?: string
  original_end_date?: string
  start_time?: string
  end_time?: string
  reschedule_count?: number
  reschedule_history?: Array<{ from: string; to: string; reason?: string; date: string; operator: string }>
}

export interface CreateDutyPayload {
  duty_nm: string
  describe?: string
  group?: string
  project_id?: string
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
  duty_id?: string
  apply_type: string
  apply_type_code: string
  submitter: string
  submitter_name?: string
  reviewer: string[] | string
  status: number // 1=待審 2=通過 3=拒絕 4=退回
  priority: number
  description?: string
  created_at: string
  project_nm?: string
  function_nm?: string
  duty_nm?: string
  approval_nodes?: ApprovalNode[]
  is_my_turn?: boolean  // 當前登入用戶是否輪到審核（後端計算）
}

export interface ReviewPayload {
  status: number // 2=通過 3=拒絕
  reject_reason?: string
  countersigns?: { work_no: string; name: string }[]
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
  type?: 'project' | 'function' | 'duty'
}

export interface SearchResult {
  id: string
  type: 'project' | 'function' | 'duty'
  title: string
  status: number
  priority?: number
  responsible?: string
  department?: string
  expected_end_date?: string
  progress?: number
  project_id?: string   // function 类型专用：所属专案 ID
  created_at: string
}

// ─── Dashboard Widget Config ──────────────────────────────────────────────────

export type DashboardViewType = 'personal' | 'manager'

export interface WidgetConfig {
  widget_id:  string
  label:      string
  removable:  boolean
  is_visible: boolean
  layout?:    { x: number; y: number; w: number; h: number } | null
}

// ─── Milestone ────────────────────────────────────────────────────────────────

export interface Milestone {
  id:               string
  project_id:       string
  name:             string
  target_date:      string
  note?:            string
  linked_functions?: string[]
  status:           'pending' | 'achieved' | 'overdue'
  achieved_at?:     string   // actual achievement date (YYYY-MM-DD or datetime)
  created_at?:      string
}

export interface CreateMilestonePayload {
  name:              string
  target_date:       string
  note?:             string
  linked_functions?: string[]
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export interface MemberWorkStat {
  name:              string
  work_no:           string
  department?:       string
  total_hours:       number
  completed_tasks:   number
  overdue_tasks:     number
  overdue_days?:     number
  urgent_tasks:      number
  in_progress_tasks: number
  log_submitted:     boolean
  weekly_hours?:     { week: string; hours: number }[]
}

// ─── Review ───────────────────────────────────────────────────────────────────

export interface ApprovalNode {
  node_id:          string
  order:            number
  approver:         string
  approver_work_no: string
  status:           number  // 0=待審 1=通過 2=拒絕 3=退回
  is_countersign?:  boolean
  approved_at?:     string | null
  comment?:         string | null
}

export interface CountersignPayload {
  approver_name:    string
  approver_work_no: string
}

// ─── Daily Log ────────────────────────────────────────────────────────────────

export type WorkCategory = 'project' | 'cr_ar' | 'training' | 'meeting' | 'duty' | 'other'

export interface DailyLogEntry {
  entry_id:        string
  work_category:   WorkCategory
  /** 條目數據來源：progress=任務進度提交, manual=日誌手動添加, updated=日誌中修改 */
  source?:         'progress' | 'manual' | 'updated'
  description:     string
  hours:           number
  is_overtime:     boolean
  overtime_hours:  number
  project_id?:     string
  project_nm?:     string
  function_id?:    string
  function_nm?:    string
  duty_id?:        string
  duty_nm?:        string
  bu_unit?:        string
  group1?:         string
  group2?:         string
  files?:          { name: string; url: string; size?: number }[]
  /** 來源進度記錄 ID（由 suggest 條目 promote 而來時保留，用於刷新後去重） */
  suggest_id?:          string
  /** 原始進度記錄提交人（合作人視角的 suggest 條目才有值） */
  suggest_submitter?:   string
  /** 提交時間 HH:mm（來自進度記錄 created_at，用於日視圖顯示） */
  record_time?:         string
  /** 任務預計開始日期 YYYY-MM-DD */
  expected_start_date?: string
  /** 任務預計結束日期 YYYY-MM-DD */
  expected_end_date?:   string
  /** 任務完成百分比（來自進度記錄或日誌更新時攜帶） */
  progress?:            number
}

export interface DailyLog {
  log_id?:         string
  work_no?:        string
  log_date:        string
  entries:         DailyLogEntry[]
  total_hours:     number
  overtime_hours:  number
  status:          'draft' | 'submitted' | 'confirmed'
  submitted_at?:   string
  confirmed_at?:   string
}
