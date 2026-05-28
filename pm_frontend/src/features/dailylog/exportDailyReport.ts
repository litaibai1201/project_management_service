/**
 * 前端生成日報 DOCX（按模板格式）
 *
 * 左列：{n}. {专案名}（粗体）
 * 右列：每个任务逐条列出：
 *   {local_idx}. {任务名}(当前进度: {progress}%，总耗时：{hours}h)
 *     - {描述行}(耗时：{hours}h)
 *   [嵌入图片]
 */
import {
  Document, Paragraph, Table, TableRow, TableCell,
  ImageRun, TextRun, ExternalHyperlink, Packer,
  WidthType, BorderStyle, AlignmentType, ShadingType,
} from 'docx'
import type { DailyLogEntry } from '@/types/api.types'
import { tokenStorage } from '@/api/httpClient'

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT            = 'KaiTi'
const FONT_SIZE       = 21       // half-points → 10.5pt (表格内容)
const FONT_SIZE_TITLE = 26       // half-points → 13pt   (部門名稱段落)
const IMAGE_EXTS      = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp'])
const BORDER          = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const
const CELL_BORDERS    = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const COL_LEFT        = 2518     // DXA
const COL_RIGHT       = 6338     // DXA

// ─── Text / Paragraph helpers ─────────────────────────────────────────────────

function tr(text: string, bold = false, size = FONT_SIZE): TextRun {
  return new TextRun({ text, font: FONT, size, bold })
}

function p(...runs: TextRun[]): Paragraph {
  return new Paragraph({ children: runs, alignment: AlignmentType.LEFT })
}

// ─── Image fetching ───────────────────────────────────────────────────────────

async function fetchBlob(url: string): Promise<ArrayBuffer | null> {
  const token = tokenStorage.get()
  // url may be relative like "/api/temporary_duty/..."
  const absolute = url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
  const withToken = token ? `${absolute}?token=${token}` : absolute
  try {
    const res = await fetch(withToken)
    if (!res.ok) return null
    return res.arrayBuffer()
  } catch {
    return null
  }
}

async function getImageSize(buf: ArrayBuffer, maxW = 400): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([buf]))
    const img = new Image()
    img.onload  = () => {
      const scale = Math.min(1, maxW / img.naturalWidth)
      resolve({ width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => { resolve({ width: maxW, height: Math.round(maxW * 0.6) }); URL.revokeObjectURL(url) }
    img.src = url
  })
}

type ImgType = 'jpg' | 'png' | 'gif' | 'bmp'
function toImgType(ext: string): ImgType | null {
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
  if (ext === 'png')  return 'png'
  if (ext === 'gif')  return 'gif'
  if (ext === 'bmp')  return 'bmp'
  return null
}

interface FileMeta {
  name: string; url: string; ext: string
  buffer?: ArrayBuffer; width?: number; height?: number
}

async function prefetchFiles(files?: { name: string; url: string }[]): Promise<FileMeta[]> {
  if (!files?.length) return []
  return Promise.all(files.map(async (f) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (IMAGE_EXTS.has(ext)) {
      const buffer = await fetchBlob(f.url)
      if (buffer) {
        const { width, height } = await getImageSize(buffer)
        return { name: f.name, url: f.url, ext, buffer, width, height }
      }
    }
    return { name: f.name, url: f.url, ext }
  }))
}

// ─── Cell builder ─────────────────────────────────────────────────────────────

function cell(paras: Paragraph[], colW: number, highlight?: string): TableCell {
  return new TableCell({
    children: paras,
    width: { size: colW, type: WidthType.DXA },
    borders: CELL_BORDERS,
    ...(highlight ? { shading: { type: ShadingType.CLEAR, fill: highlight } } : {}),
  })
}

function fileParas(files: FileMeta[]): Paragraph[] {
  const result: Paragraph[] = []
  const token = tokenStorage.get()

  for (const f of files) {
    const imgType = toImgType(f.ext)

    if (imgType && f.buffer && f.width && f.height) {
      // Image → embed directly
      try {
        result.push(new Paragraph({
          children: [new ImageRun({ data: f.buffer, transformation: { width: f.width, height: f.height }, type: imgType })],
        }))
      } catch {
        result.push(p(tr(`[圖片: ${f.name}]`)))
      }
    } else {
      // Non-image document → clickable hyperlink so user can open/download from Word
      const base = f.url.startsWith('http')
        ? f.url
        : `${window.location.origin}${f.url.startsWith('/') ? '' : '/'}${f.url}`
      const link = token ? `${base}?token=${token}` : base

      result.push(new Paragraph({
        children: [
          tr('📎 '),
          new ExternalHyperlink({
            link,
            children: [
              new TextRun({
                text: f.name,
                font: FONT,
                size: FONT_SIZE,
                color: '2563EB',   // blue
                underline: { type: 'single' },
              }),
            ],
          }),
        ],
      }))
    }
  }
  return result
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtHours(h: number): string {
  return parseFloat(h.toFixed(2)) + 'h'
}

interface EntryLine {
  description: string
  hours: number
  files: FileMeta[]
}

interface TaskGroup {
  taskNm: string
  /** Latest progress across all entries (highest value wins) */
  progress?: number | null
  /** Sum of all entry hours */
  totalHours: number
  entries: EntryLine[]
}

/**
 * Group raw log entries by task ID so multiple progress records for the same
 * task become one numbered item with multiple description lines.
 */
function groupByTask(
  items: { taskId: string; taskNm: string; progress?: number | null; hours: number; description: string; files: FileMeta[] }[],
): TaskGroup[] {
  const order: string[] = []
  const map = new Map<string, TaskGroup>()

  for (const item of items) {
    if (!map.has(item.taskId)) {
      order.push(item.taskId)
      map.set(item.taskId, { taskNm: item.taskNm, progress: item.progress, totalHours: 0, entries: [] })
    }
    const g = map.get(item.taskId)!
    g.totalHours += item.hours
    // Keep latest (highest) progress
    if (item.progress != null && (g.progress == null || item.progress > g.progress)) {
      g.progress = item.progress
    }
    g.entries.push({ description: item.description, hours: item.hours, files: item.files })
  }

  return order.map(id => map.get(id)!)
}

/** Build right-cell paragraphs for a group of task groups */
function buildRightParas(taskGroups: TaskGroup[]): Paragraph[] {
  const paras: Paragraph[] = []

  taskGroups.forEach((task, i) => {
    const taskIdx  = i + 1
    const progPart = task.progress != null ? `当前进度: ${task.progress}%，` : ''
    paras.push(p(tr(`${taskIdx}. ${task.taskNm}(${progPart}总耗时：${fmtHours(task.totalHours)})`)))

    task.entries.forEach(entry => {
      const descLines = entry.description.split('\n').map(l => l.trim()).filter(Boolean)
      if (descLines.length) {
        descLines.forEach((line, li) => {
          const suffix = li === descLines.length - 1 ? `(耗时：${fmtHours(entry.hours)})` : ''
          paras.push(p(tr(`  - ${line}${suffix}`)))
        })
      } else {
        // No description — still show the hours line
        paras.push(p(tr(`  - (耗时：${fmtHours(entry.hours)})`)))
      }
      paras.push(...fileParas(entry.files))
    })
  })

  if (!paras.length) paras.push(p(tr('')))
  return paras
}

// ─── Table row builder ────────────────────────────────────────────────────────

function headerRow(left: string, right: string): TableRow {
  return new TableRow({ children: [
    cell([p(tr(left, true))],  COL_LEFT),
    cell([p(tr(right, true))], COL_RIGHT),
  ]})
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface ExportDailyReportOptions {
  date: string         // 'YYYY-MM-DD'
  workNo: string
  userName: string
  department?: string
  entries: DailyLogEntry[]
}

const CATEGORY_LABEL: Record<string, string> = {
  cr_ar: 'CR/AR', training: '教育訓練', meeting: '週會/月會',
  other: '其他', management: '管理', overtime: '加班',
}

export async function exportDailyReport(opts: ExportDailyReportOptions): Promise<void> {
  const { date, workNo, userName, department = '', entries } = opts
  const [year, month, day] = date.split('-')
  const dateStr = `${year}年${month}月${day}日`

  // ── Group entries ──────────────────────────────────────────────────────
  const projectGroups = new Map<string, DailyLogEntry[]>()
  const dutyGroup: DailyLogEntry[] = []
  const otherGroup: DailyLogEntry[] = []

  for (const e of entries) {
    if (e.work_category === 'project') {
      const key = e.project_nm || e.function_nm || '未分類'
      projectGroups.set(key, [...(projectGroups.get(key) ?? []), e])
    } else if (e.work_category === 'duty') {
      dutyGroup.push(e)
    } else {
      otherGroup.push(e)
    }
  }

  // ── Pre-fetch images (all groups in parallel) ──────────────────────────
  // Flatten all entries for parallel fetch, then reassemble
  const allEntries = [...entries]
  const allFiles   = await Promise.all(allEntries.map(e => prefetchFiles(e.files)))
  const fileMap    = new Map(allEntries.map((e, i) => [e.entry_id, allFiles[i]]))

  const toRawItem = (e: DailyLogEntry, taskId: string, taskNm: string) => ({
    taskId,
    taskNm,
    progress:    e.progress,
    hours:       e.hours,
    description: e.description,
    files:       fileMap.get(e.entry_id) ?? [],
  })

  // ── Build table data rows ──────────────────────────────────────────────
  const dataRows: TableRow[] = []
  let sectionIdx = 1

  // Project groups — within each project, further group by function_id
  for (const [projNm, items] of projectGroups) {
    const taskGroups = groupByTask(
      items.map(e => toRawItem(e, e.function_id ?? e.entry_id, e.function_nm || ''))
    )
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. ${projNm}`, true))], COL_LEFT),
      cell(buildRightParas(taskGroups), COL_RIGHT),
    ]}))
    sectionIdx++
  }

  // Duty group — group by duty_id
  if (dutyGroup.length) {
    const taskGroups = groupByTask(
      dutyGroup.map(e => toRawItem(e, e.duty_id ?? e.entry_id, e.duty_nm || ''))
    )
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. AR`, true))], COL_LEFT),
      cell(buildRightParas(taskGroups), COL_RIGHT),
    ]}))
    sectionIdx++
  }

  // Other (meeting, training, CR/AR, etc.) — each entry is its own task
  if (otherGroup.length) {
    const taskGroups = groupByTask(
      otherGroup.map(e => toRawItem(
        e,
        e.entry_id,   // no shared task id, treat each entry independently
        CATEGORY_LABEL[e.work_category] || e.work_category,
      ))
    )
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. 其他`, true))], COL_LEFT),
      cell(buildRightParas(taskGroups), COL_RIGHT),
    ]}))
  }

  // ── Assemble document ──────────────────────────────────────────────────
  const cm = (v: number) => Math.round(v * 566.929)   // cm → DXA (twips)

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size:   { width: cm(21.59), height: cm(27.94) },
          margin: { top: cm(2.54), bottom: cm(2.54), left: cm(3.17), right: cm(3.17) },
        },
      },
      children: [
        // Header paragraph: 部門名稱 — 13pt bold
        new Paragraph({ children: [
          tr('部門名稱: ', true, FONT_SIZE_TITLE),
          tr(department,   true, FONT_SIZE_TITLE),
        ]}),
        // Main table
        new Table({
          width: { size: COL_LEFT + COL_RIGHT, type: WidthType.DXA },
          rows: [
            headerRow(`工號: ${workNo}`,              `記錄人姓名: ${userName}`),
            headerRow('日期(西元)',                    dateStr),
            headerRow('項目(第幾項、項目名稱)',         '內容'),
            ...dataRows,
          ],
        }),
      ],
    }],
  })

  // ── Download ───────────────────────────────────────────────────────────
  const blob = await Packer.toBlob(doc)
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = `${date}_日報_${userName}.docx`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Range Report ─────────────────────────────────────────────────────────────

export interface ExportRangeReportOptions {
  startDate:   string   // 'YYYY-MM-DD'
  endDate:     string   // 'YYYY-MM-DD'
  workNo:      string
  userName:    string
  department?: string
  today:       string   // 'YYYY-MM-DD' — entry lines for this date get yellow highlight
  days: { date: string; entries: DailyLogEntry[] }[]
}

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六']

function shortDateLabel(dateStr: string): string {
  const d  = new Date(dateStr + 'T00:00:00')
  const [, m, day] = dateStr.split('-')
  return `${m}/${day}(週${WEEKDAY_ZH[d.getDay()]})`
}

function fullDateLabel(dateStr: string): string {
  const d  = new Date(dateStr + 'T00:00:00')
  const [y, m, day] = dateStr.split('-')
  return `${y}年${m}月${day}日（週${WEEKDAY_ZH[d.getDay()]}）`
}

interface EntryLineWithDate {
  date:        string
  description: string
  hours:       number
  files:       FileMeta[]
}

interface TaskGroupWithDate {
  taskNm:     string
  progress?:  number | null
  totalHours: number
  entries:    EntryLineWithDate[]
}

/** Same as groupByTask but carries the date per entry */
function groupByTaskWithDate(
  items: { taskId: string; taskNm: string; progress?: number | null; hours: number; description: string; files: FileMeta[]; date: string }[],
): TaskGroupWithDate[] {
  const order: string[] = []
  const map = new Map<string, TaskGroupWithDate>()

  for (const item of items) {
    if (!map.has(item.taskId)) {
      order.push(item.taskId)
      map.set(item.taskId, { taskNm: item.taskNm, progress: item.progress, totalHours: 0, entries: [] })
    }
    const g = map.get(item.taskId)!
    g.totalHours += item.hours
    if (item.progress != null && (g.progress == null || item.progress > g.progress)) {
      g.progress = item.progress
    }
    g.entries.push({ date: item.date, description: item.description, hours: item.hours, files: item.files })
  }

  return order.map(id => map.get(id)!)
}

function trHighlight(text: string, highlight = false): TextRun {
  return new TextRun({ text, font: FONT, size: FONT_SIZE, ...(highlight ? { color: 'F59E0B' } : {}) })
}

/** Build right-cell paragraphs for range report (entries carry a date prefix, today highlighted) */
function buildRangeRightParas(taskGroups: TaskGroupWithDate[], today: string): Paragraph[] {
  const paras: Paragraph[] = []

  taskGroups.forEach((task, i) => {
    const taskIdx  = i + 1
    const progPart = task.progress != null ? `当前进度: ${task.progress}%，` : ''
    paras.push(p(tr(`${taskIdx}. ${task.taskNm}(${progPart}总耗时：${fmtHours(task.totalHours)})`)))

    // Sort entries chronologically
    const sorted = [...task.entries].sort((a, b) => a.date.localeCompare(b.date))
    sorted.forEach(entry => {
      const isToday   = entry.date === today
      const datePfx   = `[${shortDateLabel(entry.date)}] `
      const descLines = entry.description.split('\n').map(l => l.trim()).filter(Boolean)

      if (descLines.length) {
        descLines.forEach((line, li) => {
          const suffix = li === descLines.length - 1 ? `(耗时：${fmtHours(entry.hours)})` : ''
          const prefix = li === 0 ? `  - ${datePfx}` : '       '
          paras.push(new Paragraph({
            children: [trHighlight(`${prefix}${line}${suffix}`, isToday)],
            alignment: AlignmentType.LEFT,
          }))
        })
      } else {
        paras.push(new Paragraph({
          children: [trHighlight(`  - ${datePfx}(耗时：${fmtHours(entry.hours)})`, isToday)],
          alignment: AlignmentType.LEFT,
        }))
      }
      paras.push(...fileParas(entry.files))
    })
  })

  if (!paras.length) paras.push(p(tr('')))
  return paras
}

export async function exportRangeReport(opts: ExportRangeReportOptions): Promise<void> {
  const { startDate, endDate, workNo, userName, department = '', today, days } = opts

  // ── Flatten all entries carrying their date ───────────────────────────
  type DatedEntry = DailyLogEntry & { _date: string }
  const allDated: DatedEntry[] = days.flatMap(d => d.entries.map(e => ({ ...e, _date: d.date })))

  // ── Pre-fetch all images in parallel ─────────────────────────────────
  const allFiles = await Promise.all(allDated.map(e => prefetchFiles(e.files)))
  const fileMap  = new Map(allDated.map((e, i) => [e.entry_id, allFiles[i]]))

  // ── Group by project / duty / other across all days ───────────────────
  const projectGroups = new Map<string, DatedEntry[]>()
  const dutyGroup: DatedEntry[] = []
  const otherGroup: DatedEntry[] = []

  for (const e of allDated) {
    if (e.work_category === 'project') {
      const key = e.project_nm || e.function_nm || '未分類'
      projectGroups.set(key, [...(projectGroups.get(key) ?? []), e])
    } else if (e.work_category === 'duty') {
      dutyGroup.push(e)
    } else {
      otherGroup.push(e)
    }
  }

  const toRawItem = (e: DatedEntry, taskId: string, taskNm: string) => ({
    taskId,
    taskNm,
    progress:    e.progress,
    hours:       e.hours,
    description: e.description,
    files:       fileMap.get(e.entry_id) ?? [],
    date:        e._date,
  })

  // ── Build data rows ───────────────────────────────────────────────────
  const dataRows: TableRow[] = []
  let sectionIdx = 1

  for (const [projNm, items] of projectGroups) {
    const taskGroups = groupByTaskWithDate(items.map(e => toRawItem(e, e.function_id ?? e.entry_id, e.function_nm || '')))
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. ${projNm}`, true))], COL_LEFT),
      cell(buildRangeRightParas(taskGroups, today), COL_RIGHT),
    ]}))
    sectionIdx++
  }

  if (dutyGroup.length) {
    const taskGroups = groupByTaskWithDate(dutyGroup.map(e => toRawItem(e, e.duty_id ?? e.entry_id, e.duty_nm || '')))
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. AR`, true))], COL_LEFT),
      cell(buildRangeRightParas(taskGroups, today), COL_RIGHT),
    ]}))
    sectionIdx++
  }

  if (otherGroup.length) {
    const taskGroups = groupByTaskWithDate(otherGroup.map(e => toRawItem(e, e.work_category, CATEGORY_LABEL[e.work_category] || e.work_category)))
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. 其他`, true))], COL_LEFT),
      cell(buildRangeRightParas(taskGroups, today), COL_RIGHT),
    ]}))
  }

  // ── Assemble document ─────────────────────────────────────────────────
  const cm = (v: number) => Math.round(v * 566.929)
  const [sy, sm, sd] = startDate.split('-')
  const [ey, em, ed] = endDate.split('-')
  const rangeStr = startDate === endDate
    ? fullDateLabel(startDate)
    : `${sy}年${sm}月${sd}日 ～ ${ey}年${em}月${ed}日`

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size:   { width: cm(21.59), height: cm(27.94) },
          margin: { top: cm(2.54), bottom: cm(2.54), left: cm(3.17), right: cm(3.17) },
        },
      },
      children: [
        new Paragraph({ children: [
          tr('部門名稱: ', true, FONT_SIZE_TITLE),
          tr(department,   true, FONT_SIZE_TITLE),
        ]}),
        new Table({
          width: { size: COL_LEFT + COL_RIGHT, type: WidthType.DXA },
          rows: [
            headerRow(`工號: ${workNo}`,         `記錄人姓名: ${userName}`),
            headerRow('日期範圍',                  rangeStr),
            headerRow('項目（第幾項、項目名稱）',   '內容'),
            ...dataRows,
          ],
        }),
      ],
    }],
  })

  // ── Download ──────────────────────────────────────────────────────────
  const blob = await Packer.toBlob(doc)
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = `${startDate}_${endDate}_報告_${userName}.docx`
  a.click()
  URL.revokeObjectURL(a.href)
}
