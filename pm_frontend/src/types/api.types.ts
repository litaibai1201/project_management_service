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
  project_count: number
  duty_count: number
  pending_review: number
  in_progress: number
}

export interface UserStatistical {
  total_projects: number
  total_duties: number
  completed: number
  in_progress: number
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
  expected_benefit?: string
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
  expected_benefit?: string
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
  /** 任務分組（用戶自定義，如 "環境部署"、"線上問題"） */
  group?: string
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
  group?: string
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

/** 審批鏈中的單個節點 */
export interface ApprovalNode {
  node_id: string
  approver: string        // 審批人姓名
  approver_work_no: string
  order: number           // 審批順序（從1開始）
  status: 0 | 1 | 2 | 3  // 0=待審 1=已通過 2=已拒絕 3=已退回
  comment?: string
  approved_at?: string
  is_countersign?: boolean // 是否為加簽節點
}

/** 申請類型代碼（用於分 Tab 過濾） */
export type ApplyTypeCode =
  | 'initiate'           // 立案申請
  | 'plan'               // 規劃審核
  | 'function_complete'  // 功能完結
  | 'project_complete'   // 專案完結
  | 'duty_complete'      // 臨時任務完結

export interface ApplyRecord {
  id: string
  project_id?: string
  function_id?: string
  duty_id?: string
  apply_type: string           // 顯示用中文名
  apply_type_code: ApplyTypeCode
  submitter: string
  submitter_name?: string
  reviewer: string
  status: number               // 1=待審 2=通過 3=拒絕 4=退回
  priority: number
  created_at: string
  project_nm?: string
  function_nm?: string
  duty_nm?: string
  description?: string         // 申請說明
  approval_nodes?: ApprovalNode[]
}

export interface ReviewPayload {
  status: number // 2=通過 3=拒絕 4=退回
  reject_reason?: string
}

export interface CountersignPayload {
  approver_work_no: string
  approver_name: string
}

// ─── Milestone ────────────────────────────────────────────────────────────────

export type MilestoneStatus = 'pending' | 'achieved' | 'overdue'

export interface Milestone {
  id: string
  project_id: string
  name: string
  target_date: string
  status: MilestoneStatus
  note?: string
  linked_functions?: string[] // function ids
  achieved_at?: string
}

export interface CreateMilestonePayload {
  name: string
  target_date: string
  note?: string
  linked_functions?: string[]
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export interface MemberWorkStat {
  work_no: string
  name: string
  total_hours: number
  completed_tasks: number
  overdue_tasks: number
  /** 累計超期天數（所有超時任務的超期天數加總） */
  overdue_days: number
  in_progress_tasks: number
  weekly_hours: { week: string; hours: number }[]
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

// ─── Daily Log ───────────────────────────────────────────────────────────────

export type WorkCategory = 'project' | 'cr_ar' | 'training' | 'meeting' | 'duty' | 'other'

export interface DailyLogEntry {
  entry_id: string
  work_category: WorkCategory
  project_id?: string
  project_nm?: string
  function_id?: string
  function_nm?: string
  duty_id?: string
  duty_nm?: string
  bu_unit?: string
  description: string
  hours: number
  is_overtime: boolean
  overtime_hours?: number
  files?: FileInfo[]
}

export interface DailyLog {
  log_id: string
  work_no: string
  log_date: string
  entries: DailyLogEntry[]
  total_hours: number
  overtime_hours: number
  status: 'draft' | 'submitted' | 'confirmed'
  submitted_at?: string
  confirmed_by?: string
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
  // enriched display fields
  department?: string
  priority?: number
  progress?: number
  parent_nm?: string   // for duty: parent project name
  responsible?: string // duty 負責人 / project PM
  expected_end_date?: string
}
