/**
 * 開發模式虛擬數據 (DEV only)
 * 所有頁面在 import.meta.env.DEV === true 時使用這裡的數據，跳過真實 API 請求
 */

import {
  Project, ProjectListItem, ProjectFunction, ProgressRecord,
  TemporaryDuty, ApplyRecord, ProjectGroup,
  UserIndexContent, ApiResponse, PaginatedContent,
} from '@/types/api.types'

// ─── Helper: wrap in ApiResponse ─────────────────────────────────────────────

export function ok<T>(content: T): ApiResponse<T> {
  return { code: '200', msg: 'success', content }
}

export function delay(ms = 250): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Project Groups ───────────────────────────────────────────────────────────

export const MOCK_GROUPS: ProjectGroup[] = [
  { id: 'g001', group_nm: '技術部' },
  { id: 'g002', group_nm: '産品部' },
  { id: 'g003', group_nm: '運營部' },
  { id: 'g004', group_nm: '設計部' },
]

// ─── Projects (list items) ────────────────────────────────────────────────────

export const MOCK_PROJECT_LIST: ProjectListItem[] = [
  { id: 'p001', project_nm: 'ERP 核心系統改版',    department: '技術部', status: 5, priority: 3, product_pm: '陳建國', project_pm: '王小明', progress: 72, expected_end_date: '2026-03-20' },
  { id: 'p002', project_nm: '行動端 APP 2.0',      department: '産品部', status: 3, priority: 4, product_pm: '林小芸', project_pm: '李大華', progress: 28, expected_end_date: '2026-03-13' },
  { id: 'p003', project_nm: '報表系統優化',         department: '技術部', status: 5, priority: 2, product_pm: '張美玲', project_pm: '王小明', progress: 88, expected_end_date: '2026-04-01' },
  { id: 'p004', project_nm: '客服平台升級',         department: '運營部', status: 2, priority: 1, product_pm: '陳建國', project_pm: '趙四海', progress: 10, expected_end_date: '2026-05-15' },
  { id: 'p005', project_nm: '數據中台建設',         department: '技術部', status: 5, priority: 3, product_pm: '王小明', project_pm: '劉思遠', progress: 55, expected_end_date: '2026-03-08' },
  { id: 'p006', project_nm: 'SSO 單點登入改造',    department: '技術部', status: 4, priority: 2, product_pm: '李大華', project_pm: '王小明', progress: 40, expected_end_date: '2026-04-20' },
  { id: 'p007', project_nm: '設計系統 DS 2.0',     department: '設計部', status: 3, priority: 2, product_pm: '林小芸', project_pm: '方曉雯', progress: 35, expected_end_date: '2026-06-30' },
  { id: 'p008', project_nm: 'BI 報表平台',          department: '運營部', status: 7, priority: 1, product_pm: '趙四海', project_pm: '陳建國', progress: 100, expected_end_date: '2026-02-28' },
]

// ─── Project Detail ───────────────────────────────────────────────────────────

export const MOCK_PROJECT_MAP: Record<string, Project> = {
  p001: {
    id: 'p001', project_nm: 'ERP 核心系統改版', department: '技術部',
    describe: '對現有 ERP 系統進行全面改版，提升系統性能與用戶體驗，優化業務流程，支持移動端操作。預計涵蓋採購、倉庫、財務三大模塊重構。',
    product_pm: '陳建國', project_pm: '王小明', creator: '管理員',
    status: 5, priority: 3, progress: 72,
    expected_end_date: '2026-03-20', created_at: '2025-11-15 09:30:00',
    updated_at: '2026-03-08 14:22:00', group_id: 'g001',
    code_url: 'https://github.com/example/erp-v2',
  },
  p002: {
    id: 'p002', project_nm: '行動端 APP 2.0', department: '産品部',
    describe: '全新設計的行動端應用，支持 iOS / Android 雙平台，引入消息推送、離線操作、掃碼功能，大幅提升外勤人員工作效率。',
    product_pm: '林小芸', project_pm: '李大華', creator: '林小芸',
    status: 3, priority: 4, progress: 28,
    expected_end_date: '2026-03-13', created_at: '2026-01-05 10:00:00',
    updated_at: '2026-03-07 09:15:00', group_id: 'g002',
  },
  p003: {
    id: 'p003', project_nm: '報表系統優化', department: '技術部',
    describe: '現有報表系統存在查詢慢、導出失敗等問題，本次優化引入列式存儲和緩存層，預計將查詢速度提升 5 倍以上。',
    product_pm: '張美玲', project_pm: '王小明', creator: '張美玲',
    status: 5, priority: 2, progress: 88,
    expected_end_date: '2026-04-01', created_at: '2025-12-20 11:00:00',
    group_id: 'g001',
  },
  p004: {
    id: 'p004', project_nm: '客服平台升級', department: '運營部',
    describe: '升級客服工單系統，新增智能分類、SLA 追蹤、滿意度評分功能，與現有 CRM 打通數據。',
    product_pm: '陳建國', project_pm: '趙四海', creator: '陳建國',
    status: 2, priority: 1, progress: 10,
    expected_end_date: '2026-05-15', created_at: '2026-02-18 15:00:00',
    group_id: 'g003',
  },
}

// For unknown project IDs in detail view, fall back to p001
export function getMockProject(id: string): Project {
  return MOCK_PROJECT_MAP[id] ?? { ...MOCK_PROJECT_MAP['p001'], id, project_nm: `虛擬專案 ${id}` }
}

// ─── Functions ────────────────────────────────────────────────────────────────

export const MOCK_FUNCTIONS: Record<string, ProjectFunction[]> = {
  p001: [
    { id: 'f001', function_nm: '採購模塊重構',    project_id: 'p001', status: 4, priority: 3, progress: 100, group1: '後端', expected_start_date: '2025-12-01', expected_end_date: '2026-01-15', describe: '重構採購申請、採購訂單、供應商管理三個子模塊' },
    { id: 'f002', function_nm: '倉庫模塊開發',    project_id: 'p001', status: 2, priority: 3, progress: 65,  group1: '後端', expected_start_date: '2026-01-10', expected_end_date: '2026-03-10', developers: 'DEV001;DEV002' },
    { id: 'f003', function_nm: '財務報表對接',    project_id: 'p001', status: 2, priority: 2, progress: 40,  group1: '後端', expected_start_date: '2026-02-01', expected_end_date: '2026-03-25' },
    { id: 'f004', function_nm: '前端 UI 重設計', project_id: 'p001', status: 2, priority: 2, progress: 80,  group1: '前端', expected_start_date: '2025-12-15', expected_end_date: '2026-03-20', developers: 'DEV003' },
    { id: 'f005', function_nm: '移動端適配',      project_id: 'p001', status: 1, priority: 1, progress: 0,   group1: '前端', expected_start_date: '2026-03-15', expected_end_date: '2026-04-10' },
    { id: 'f006', function_nm: '性能壓測與優化', project_id: 'p001', status: 1, priority: 2, progress: 0,   group1: '測試', expected_start_date: '2026-03-20', expected_end_date: '2026-04-05' },
  ],
  p002: [
    { id: 'f007', function_nm: 'iOS 客戶端開發',  project_id: 'p002', status: 2, priority: 4, progress: 35, group1: '移動端', expected_start_date: '2026-01-15', expected_end_date: '2026-03-13', developers: 'DEV004' },
    { id: 'f008', function_nm: 'Android 客戶端', project_id: 'p002', status: 2, priority: 4, progress: 22, group1: '移動端', expected_start_date: '2026-01-15', expected_end_date: '2026-03-13', developers: 'DEV005' },
    { id: 'f009', function_nm: 'Push 推送服務',   project_id: 'p002', status: 1, priority: 3, progress: 0,  group1: '後端', expected_start_date: '2026-02-20', expected_end_date: '2026-03-20' },
  ],
  default: [
    { id: 'fd01', function_nm: '需求分析',    project_id: 'px', status: 4, priority: 2, progress: 100, group1: '産品' },
    { id: 'fd02', function_nm: '系統設計',    project_id: 'px', status: 2, priority: 2, progress: 60,  group1: '後端' },
    { id: 'fd03', function_nm: '前端開發',    project_id: 'px', status: 2, priority: 3, progress: 45,  group1: '前端' },
    { id: 'fd04', function_nm: '測試驗收',    project_id: 'px', status: 1, priority: 1, progress: 0,   group1: '測試' },
  ],
}

export function getMockFunctions(projectId: string): ProjectFunction[] {
  return (MOCK_FUNCTIONS[projectId] ?? MOCK_FUNCTIONS['default']).map((f) => ({ ...f, project_id: projectId }))
}

// ─── Function Detail ──────────────────────────────────────────────────────────

const ALL_FUNCTIONS: ProjectFunction[] = Object.values(MOCK_FUNCTIONS).flat()

export function getMockFunction(pid: string, fid: string): ProjectFunction {
  return (
    ALL_FUNCTIONS.find((f) => f.id === fid) ?? {
      id: fid, function_nm: `虛擬功能 ${fid}`, project_id: pid,
      status: 2, priority: 2, progress: 50, group1: '後端',
      expected_start_date: '2026-02-01', expected_end_date: '2026-04-01',
      describe: '這是一個虛擬功能說明，僅用於開發調試',
    }
  )
}

// ─── Progress Records ─────────────────────────────────────────────────────────

export const MOCK_PROGRESS: Record<string, ProgressRecord[]> = {
  f001: [
    { progress_id: 'pr001', progress: 100, progress_record: '採購申請、採購訂單、供應商三個子模塊全部完成，已通過單元測試和集成測試，代碼已合並主幹分支。', submitter: '王小明', time_consum: 48, created_at: '2026-01-14 16:30:00' },
    { progress_id: 'pr002', progress: 70, progress_record: '採購申請和採購訂單兩個子模塊已完成，供應商管理模塊開發中，預計本週完成。', submitter: '王小明', time_consum: 32, created_at: '2026-01-08 11:00:00' },
    { progress_id: 'pr003', progress: 30, progress_record: '完成了採購申請模塊的數據模型設計和接口定義，開始編碼實現。', submitter: '王小明', time_consum: 16, created_at: '2025-12-20 15:00:00' },
  ],
  f002: [
    { progress_id: 'pr004', progress: 65, progress_record: '倉庫入庫、出庫流程已開發完成，庫存盤點功能 50% 完成，本週重點推進庫存報表模塊。', submitter: '李大華', time_consum: 24, created_at: '2026-03-05 17:00:00', files: [{ name: '倉庫模塊設計文檔v2.pdf', url: '#', size: 1024 * 512 }] },
    { progress_id: 'pr005', progress: 40, progress_record: '完成了倉庫基礎數據（倉庫、貨位、商品）管理功能，入庫流程開發中。', submitter: '李大華', time_consum: 20, created_at: '2026-02-20 14:00:00' },
  ],
  fd02: [
    { progress_id: 'pr006', progress: 60, progress_record: '完成了整體架構設計，數據庫 ER 圖已定稿，接口文檔編寫中。', submitter: '開發員', time_consum: 12, created_at: '2026-03-01 10:00:00' },
  ],
}

export function getMockProgress(fid: string): ProgressRecord[] {
  return MOCK_PROGRESS[fid] ?? MOCK_PROGRESS['fd02'] ?? []
}

// ─── Member Dynamics ──────────────────────────────────────────────────────────

export const MOCK_DYNAMICS = [
  { operator: '王小明', action: '更新了倉庫模塊進度至 65%',         created_at: '2026-03-08 17:00:00' },
  { operator: '李大華', action: '完成了採購模塊全部功能，狀態已更新為已完結', created_at: '2026-03-06 16:30:00' },
  { operator: '張美玲', action: '提交了前端 UI 設計稿審核',          created_at: '2026-03-05 11:00:00' },
  { operator: '陳建國', action: '新增了性能壓測功能任務',             created_at: '2026-03-03 09:45:00' },
  { operator: '林小芸', action: '審核通過了倉庫模塊需求文件',         created_at: '2026-03-01 14:20:00' },
  { operator: '王小明', action: '上傳了系統架構設計文檔',             created_at: '2026-02-25 10:00:00' },
]

// ─── Temporary Duties ─────────────────────────────────────────────────────────

export const MOCK_DUTIES: TemporaryDuty[] = [
  { id: 'd001', duty_nm: '修復線上登入超時問題',   creator: '王小明', responsible: 'DEV001', status: 1, priority: 4, progress: 60, expected_start_date: '2026-03-07', expected_end_date: '2026-03-10', describe: '用戶反映在高並發時登入頁面出現 504 超時，需緊急定位並修復。' },
  { id: 'd002', duty_nm: '優化採購單列表查詢',     creator: '李大華', responsible: 'DEV002', status: 1, priority: 3, progress: 35, expected_start_date: '2026-03-05', expected_end_date: '2026-03-15' },
  { id: 'd003', duty_nm: '整理 API 接口文檔',      creator: '張美玲', responsible: 'DEV003', status: 3, priority: 2, progress: 100, expected_start_date: '2026-02-20', expected_end_date: '2026-03-01', revision_count: 1 },
  { id: 'd004', duty_nm: '部署測試環境 Jenkins',   creator: '陳建國', responsible: 'DEV001;DEV004', status: 1, priority: 2, progress: 80, expected_start_date: '2026-03-01', expected_end_date: '2026-03-12' },
  { id: 'd005', duty_nm: '編寫單元測試 (覆蓋率≥80%)', creator: '林小芸', responsible: 'DEV005', status: 1, priority: 2, progress: 50, expected_start_date: '2026-03-03', expected_end_date: '2026-03-20', describe: '為倉庫和採購模塊核心業務邏輯補充單元測試，目標覆蓋率 80%。' },
  { id: 'd006', duty_nm: '數據庫索引優化',         creator: 'DEV001', responsible: 'DEV001', status: 2, priority: 3, progress: 90, expected_start_date: '2026-03-06', expected_end_date: '2026-03-09' },
  { id: 'd007', duty_nm: '更新前端依賴至最新版',   creator: 'DEV003', responsible: 'DEV003', status: 0, priority: 1, progress: 0, expected_start_date: '2026-03-15', expected_end_date: '2026-03-18' },
  { id: 'd008', duty_nm: '準備 Q1 技術覆盤文檔',  creator: '王小明', responsible: 'DEV001', status: 1, priority: 2, progress: 20, expected_start_date: '2026-03-10', expected_end_date: '2026-03-25' },
]

export function getMockDuty(id: string): TemporaryDuty {
  return MOCK_DUTIES.find((d) => d.id === id) ?? { ...MOCK_DUTIES[0], id, duty_nm: `虛擬任務 ${id}` }
}

// ─── Duty Progress Records ────────────────────────────────────────────────────

export const MOCK_DUTY_PROGRESS: Record<string, Array<Record<string, unknown>>> = {
  d001: [
    { progress_id: 'dp001', progress: 60, progress_record: '已定位到問題根因：線程池配置不合理導致請求積壓，已在預發環境修復，待部署生產。', submitter: 'DEV001', time_consum: 4, created_at: '2026-03-09 15:00:00' },
    { progress_id: 'dp002', progress: 20, progress_record: '拉取線上日誌分析，發現 DB 連接池在高峰期耗盡，正在排查線程池配置問題。', submitter: 'DEV001', time_consum: 2, created_at: '2026-03-07 18:00:00' },
  ],
  d002: [
    { progress_id: 'dp003', progress: 35, progress_record: '分析了慢查詢日誌，確認缺少複合索引，正在設計優化方案。', submitter: 'DEV002', time_consum: 3, created_at: '2026-03-08 11:00:00' },
  ],
  d004: [
    { progress_id: 'dp004', progress: 80, progress_record: 'Jenkins 流水線已配置完成，前端和後端自動構建已驗證通過，正在配置自動化測試觸發器。', submitter: 'DEV001', time_consum: 8, created_at: '2026-03-10 10:00:00', files: [{ name: 'jenkins_config.yaml', url: '#' }] },
  ],
}

export function getMockDutyProgress(id: string): Array<Record<string, unknown>> {
  return MOCK_DUTY_PROGRESS[id] ?? []
}

// ─── Review Records ───────────────────────────────────────────────────────────

export const MOCK_PROJECT_REVIEWS: ApplyRecord[] = [
  { id: 'r001', project_id: 'p004', apply_type: '立案申請', submitter: '趙四海', reviewer: 'DEV001', status: 1, priority: 1, created_at: '2026-02-20 10:00:00', project_nm: '客服平台升級' },
  { id: 'r002', project_id: 'p002', apply_type: '規劃審核', submitter: '李大華', reviewer: 'DEV001', status: 1, priority: 4, created_at: '2026-03-05 14:30:00', project_nm: '行動端 APP 2.0' },
  { id: 'r003', project_id: 'p001', apply_type: '完結申請', submitter: '王小明', reviewer: 'DEV001', status: 2, priority: 3, created_at: '2026-02-01 09:00:00', project_nm: 'ERP 核心系統改版' },
]

export const MOCK_DUTY_REVIEWS: ApplyRecord[] = [
  { id: 'r004', apply_type: '完結申請', submitter: 'DEV002', reviewer: 'DEV001', status: 1, priority: 2, created_at: '2026-03-06 16:00:00', project_nm: '整理 API 接口文檔' },
  { id: 'r005', apply_type: '完結申請', submitter: 'DEV001', reviewer: 'DEV001', status: 2, priority: 3, created_at: '2026-03-04 11:30:00', project_nm: '數據庫索引優化' },
]

// ─── Dashboard Index ──────────────────────────────────────────────────────────

export const MOCK_INDEX: UserIndexContent = {
  project_count: 8,
  duty_count: 8,
  pending_review: 3,
  in_progress: 5,
}

// ─── Search ───────────────────────────────────────────────────────────────────

export const MOCK_SEARCH_DATA = [
  ...MOCK_PROJECT_LIST.map((p) => ({ id: p.id, type: 'project' as const, title: p.project_nm, status: p.status, created_at: '2025-12-01' })),
  ...MOCK_DUTIES.map((d) => ({ id: d.id, type: 'duty' as const, title: d.duty_nm, status: d.status, created_at: '2026-01-15' })),
]

// ─── Paginate helper ──────────────────────────────────────────────────────────

export function paginate<T>(items: T[], page = 1, size = 10): ApiResponse<PaginatedContent<T>> {
  const start = (page - 1) * size
  const sliced = items.slice(start, start + size)
  return ok({
    total_page: Math.ceil(items.length / size),
    total_count: items.length,
    data_list: sliced,
  })
}
