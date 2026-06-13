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
import { formatGroupNamePlain, STAGE_GROUP } from '@/utils/status'

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

function fileParas(files: FileMeta[], indentLeft = 0): Paragraph[] {
  const result: Paragraph[] = []
  const token = tokenStorage.get()

  for (const f of files) {
    const imgType = toImgType(f.ext)

    if (imgType && f.buffer && f.width && f.height) {
      try {
        result.push(new Paragraph({
          children: [new ImageRun({ data: f.buffer, transformation: { width: f.width, height: f.height }, type: imgType })],
          indent: indentLeft ? { left: indentLeft } : undefined,
        }))
      } catch {
        result.push(new Paragraph({ children: [tr(`[圖片: ${f.name}]`)], indent: indentLeft ? { left: indentLeft } : undefined }))
      }
    } else {
      const base = f.url.startsWith('http')
        ? f.url
        : `${window.location.origin}${f.url.startsWith('/') ? '' : '/'}${f.url}`
      const link = token ? `${base}?token=${token}` : base

      result.push(new Paragraph({
        children: [
          tr('📎 '),
          new ExternalHyperlink({
            link,
            children: [new TextRun({ text: f.name, font: FONT, size: FONT_SIZE, color: '2563EB', underline: { type: 'single' } })],
          }),
        ],
        indent: indentLeft ? { left: indentLeft } : undefined,
      }))
    }
  }
  return result
}

// ─── HTML → DOCX blocks ───────────────────────────────────────────────────────

/** An inline run within one paragraph */
type InlineRun =
  | { type: 'text'; text: string }
  | { type: 'img';  src: string; widthPx?: number }

/** One visual paragraph = ordered list of inline runs (text + images) */
type DocxBlock = InlineRun[]

/** Parse HTML into paragraphs preserving inline image positions. */
function parseHtmlForExport(html: string): DocxBlock[] {
  if (!html || html === '<p></p>') return []
  const isHtml = /<[a-z][\s\S]*>/i.test(html)
  if (!isHtml) {
    return html.split('\n').filter((l) => l.trim()).map((l) => ([{ type: 'text' as const, text: l.trim() }]))
  }

  const dom    = new DOMParser().parseFromString(html, 'text/html')
  const blocks: DocxBlock[] = []

  /** Recursively collect inline runs from a node */
  function inlineRuns(node: Node): InlineRun[] {
    const runs: InlineRun[] = []
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim()
      if (t) runs.push({ type: 'text', text: t })
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el  = node as Element
      const tag = el.tagName.toUpperCase()
      if (tag === 'IMG') {
        const src = el.getAttribute('src')
        if (src) {
          const wAttr = el.getAttribute('width') ?? (el as HTMLElement).style?.width ?? ''
          runs.push({ type: 'img', src, widthPx: parseInt(wAttr) || undefined })
        }
      } else {
        el.childNodes.forEach((c) => runs.push(...inlineRuns(c)))
      }
    }
    return runs
  }

  function processBlock(node: Node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el  = node as Element
    const tag = el.tagName.toUpperCase()

    if (['P', 'H1', 'H2', 'H3', 'H4', 'DIV', 'BLOCKQUOTE', 'PRE'].includes(tag)) {
      const runs: InlineRun[] = []
      el.childNodes.forEach((c) => runs.push(...inlineRuns(c)))
      if (runs.length) blocks.push(runs)
      return
    }
    if (['UL', 'OL'].includes(tag)) {
      el.querySelectorAll('li').forEach((li) => {
        const runs = Array.from(li.childNodes).flatMap((c) => inlineRuns(c))
        if (runs.length) {
          blocks.push([{ type: 'text', text: '• ' }, ...runs])
        }
      })
      return
    }
    el.childNodes.forEach(processBlock)
  }

  dom.body.childNodes.forEach(processBlock)
  return blocks
}

/** Extract all img src values from an HTML string. */
function extractInlineImgSrcs(html: string): string[] {
  const srcs: string[] = []
  const re = /<img[^>]+src="([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) srcs.push(m[1])
  return srcs
}

type InlineImgMap = Map<string, { buffer: ArrayBuffer; width: number; height: number }>

/** Pre-fetch all inline images found in a list of HTML descriptions. */
async function prefetchInlineImages(descriptions: string[]): Promise<InlineImgMap> {
  const map: InlineImgMap = new Map()
  const srcs = [...new Set(descriptions.flatMap(extractInlineImgSrcs))]
  await Promise.all(srcs.map(async (src) => {
    const buf = await fetchBlob(src)
    if (buf) {
      const size = await getImageSize(buf, 400)
      map.set(src, { buffer: buf, ...size })
    }
  }))
  return map
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtHours(h: number): string {
  return parseFloat(h.toFixed(2)) + 'h'
}

// ─── Hierarchy types ──────────────────────────────────────────────────────────

interface ExportEntry {
  description: string
  hours:       number
  files:       FileMeta[]
  date?:       string   // range report only
}

interface ExportTask {
  taskKey:    string
  taskNm:     string
  progress?:  number | null
  totalHours: number
  entries:    ExportEntry[]
}

interface ExportGroup {
  groupNm:    string
  tasks:      ExportTask[]
  totalHours: number
}

interface ExportRequirement {
  reqNm:      string
  groups:     ExportGroup[]
  totalHours: number
}

type RawExportItem = {
  taskId:      string
  taskNm:      string
  reqNm:       string
  groupNm:     string
  progress?:   number | null
  hours:       number
  description: string
  files:       FileMeta[]
  date?:       string
}

/**
 * Build a Requirement → Group → Task hierarchy from flat items.
 * Same logic as buildRequirements() in DailyLogPage — task key is authoritative,
 * first non-empty reqNm/groupNm wins for canonical placement.
 */
function buildExportHierarchy(items: RawExportItem[]): ExportRequirement[] {
  // Step 1: aggregate all entries by task key
  const taskMap = new Map<string, { taskNm: string; reqNm: string; groupNm: string; progress?: number | null; totalHours: number; entries: ExportEntry[] }>()
  for (const item of items) {
    if (!taskMap.has(item.taskId)) {
      taskMap.set(item.taskId, { taskNm: item.taskNm, reqNm: item.reqNm, groupNm: item.groupNm, progress: item.progress, totalHours: 0, entries: [] })
    }
    const g = taskMap.get(item.taskId)!
    g.totalHours += item.hours
    if (item.progress != null && (g.progress == null || item.progress > g.progress)) g.progress = item.progress
    if (!g.reqNm   && item.reqNm)   g.reqNm   = item.reqNm
    if (!g.groupNm && item.groupNm) g.groupNm = item.groupNm
    g.entries.push({ description: item.description, hours: item.hours, files: item.files, date: item.date })
  }

  // Step 2: group by requirement → group
  const reqMap = new Map<string, { reqNm: string; grpMap: Map<string, { groupNm: string; taskIds: string[] }> }>()
  for (const [taskId, task] of taskMap) {
    const rk = task.reqNm || '__no_req__'
    if (!reqMap.has(rk)) reqMap.set(rk, { reqNm: task.reqNm, grpMap: new Map() })
    const req = reqMap.get(rk)!
    const gk  = task.groupNm || '__no_group__'
    if (!req.grpMap.has(gk)) req.grpMap.set(gk, { groupNm: task.groupNm, taskIds: [] })
    req.grpMap.get(gk)!.taskIds.push(taskId)
  }

  // Step 3: assemble result
  const result: ExportRequirement[] = []
  for (const [, req] of reqMap) {
    const groups: ExportGroup[] = []
    for (const [, grp] of req.grpMap) {
      const tasks: ExportTask[] = grp.taskIds.map((id) => {
        const t = taskMap.get(id)!
        return { taskKey: id, taskNm: t.taskNm, progress: t.progress, totalHours: t.totalHours, entries: t.entries }
      })
      groups.push({ groupNm: grp.groupNm, tasks, totalHours: tasks.reduce((s, t) => s + t.totalHours, 0) })
    }
    groups.sort((a, b) => (!a.groupNm && b.groupNm ? 1 : a.groupNm && !b.groupNm ? -1 : 0))
    result.push({ reqNm: req.reqNm, groups, totalHours: groups.reduce((s, g) => s + g.totalHours, 0) })
  }
  result.sort((a, b) => (!a.reqNm && b.reqNm ? 1 : a.reqNm && !b.reqNm ? -1 : a.reqNm.localeCompare(b.reqNm)))
  return result
}

/** Resolve one img run into an ImageRun (returns null if fetch failed). */
function resolveImageRun(run: { src: string; widthPx?: number }, imgMap: InlineImgMap): ImageRun | null {
  const data = imgMap.get(run.src)
  if (!data) return null
  let { width, height } = data
  if (run.widthPx && run.widthPx !== data.width) {
    const scale = run.widthPx / data.width
    width  = run.widthPx
    height = Math.round(data.height * scale)
  }
  const ext     = run.src.split('?')[0].split('.').pop()?.toLowerCase() ?? 'png'
  const imgType = toImgType(ext) ?? 'png'
  try {
    return new ImageRun({ data: data.buffer, transformation: { width, height }, type: imgType })
  } catch { return null }
}

/**
 * Convert one DocxBlock (= one HTML paragraph) into a DOCX Paragraph.
 * prefix / suffix are plain-text strings inserted before/after the block's runs.
 * trFn allows callers to control TextRun styling (e.g. colour for today's entries).
 */
function blockToParagraph(
  block: DocxBlock,
  imgMap: InlineImgMap,
  prefix: string,
  suffix: string,
  trFn: (text: string) => TextRun,
  indentLeft = 0,
): Paragraph {
  const children: (TextRun | ImageRun)[] = []
  if (prefix) children.push(trFn(prefix))
  for (const run of block) {
    if (run.type === 'text') {
      children.push(trFn(run.text))
    } else {
      const img = resolveImageRun(run, imgMap)
      if (img) children.push(img)
    }
  }
  if (suffix) children.push(trFn(suffix))
  return new Paragraph({ children, alignment: AlignmentType.LEFT, indent: indentLeft ? { left: indentLeft } : undefined })
}

/** Build right-cell paragraphs using Requirement → Group → Task hierarchy */
function buildRightParas(requirements: ExportRequirement[], imgMap: InlineImgMap): Paragraph[] {
  const paras: Paragraph[] = []

  for (const req of requirements) {
    if (req.reqNm) {
      paras.push(new Paragraph({ children: [tr(`【需求】${req.reqNm}`, true)], alignment: AlignmentType.LEFT }))
    }
    const hasReq     = !!req.reqNm
    const hasAnyGrp  = req.groups.some((g) => g.groupNm)
    const grpIndent  = hasReq  ? 200 : 0
    const taskIndent = grpIndent + (hasAnyGrp ? 200 : 0)
    const entryIndent = taskIndent + 200

    for (const grp of req.groups) {
      if (grp.groupNm) {
        paras.push(new Paragraph({ children: [tr(`【分組】${grp.groupNm}`, true)], indent: { left: grpIndent }, alignment: AlignmentType.LEFT }))
      }
      grp.tasks.forEach((task, ti) => {
        const progPart = task.progress != null ? `当前进度: ${task.progress}%，` : ''
        paras.push(new Paragraph({
          children: [tr(`${ti + 1}. ${task.taskNm}(${progPart}总耗时：${fmtHours(task.totalHours)})`, true)],
          indent: { left: taskIndent }, alignment: AlignmentType.LEFT,
        }))
        task.entries.forEach((entry) => {
          const blocks = parseHtmlForExport(entry.description)
          if (blocks.length === 0) {
            paras.push(new Paragraph({ children: [tr('- ')], indent: { left: entryIndent }, alignment: AlignmentType.LEFT }))
          } else {
            blocks.forEach((block, bi) => {
              const prefix = bi === 0 ? '- ' : '  '
              paras.push(blockToParagraph(block, imgMap, prefix, '', tr, entryIndent))
            })
          }
          paras.push(...fileParas(entry.files, entryIndent))
        })
      })
    }
  }

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
  cr_ar: 'CR/AR', training: '教育訓練', meeting: '工作會議',
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
  const allEntries  = [...entries]
  const [allFiles, inlineImgMap] = await Promise.all([
    Promise.all(allEntries.map(e => prefetchFiles(e.files))),
    prefetchInlineImages(allEntries.map(e => e.description ?? '')),
  ])
  const fileMap = new Map(allEntries.map((e, i) => [e.entry_id, allFiles[i]]))

  const toRawItem = (e: DailyLogEntry, taskId: string, taskNm: string) => ({
    taskId,
    taskNm,
    reqNm:       e.requirement_nm ?? '',
    groupNm:     e.group1 ? (e.group1 === STAGE_GROUP ? formatGroupNamePlain(e.group1) : (e.group2 ? `${e.group1} / ${e.group2}` : e.group1)) : (e.group2 ?? ''),
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
    const hierarchy = buildExportHierarchy(
      items.map(e => toRawItem(e, e.function_id ?? e.entry_id, e.function_nm || ''))
    )
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. ${projNm}`, true))], COL_LEFT),
      cell(buildRightParas(hierarchy, inlineImgMap), COL_RIGHT),
    ]}))
    sectionIdx++
  }

  // Duty group — group by duty_id
  if (dutyGroup.length) {
    const hierarchy = buildExportHierarchy(
      dutyGroup.map(e => toRawItem(e, e.duty_id ?? e.entry_id, e.duty_nm || ''))
    )
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. AR`, true))], COL_LEFT),
      cell(buildRightParas(hierarchy, inlineImgMap), COL_RIGHT),
    ]}))
    sectionIdx++
  }

  // Other (meeting, training, CR/AR, etc.) — each entry is its own task
  if (otherGroup.length) {
    const hierarchy = buildExportHierarchy(
      otherGroup.map(e => toRawItem(
        e,
        e.entry_id,
        CATEGORY_LABEL[e.work_category] || e.work_category,
      ))
    )
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. 其他`, true))], COL_LEFT),
      cell(buildRightParas(hierarchy, inlineImgMap), COL_RIGHT),
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


function trHighlight(text: string, highlight = false): TextRun {
  return new TextRun({ text, font: FONT, size: FONT_SIZE, ...(highlight ? { color: 'F59E0B' } : {}) })
}

/** Build right-cell paragraphs for range report using Requirement → Group → Task hierarchy */
function buildRangeRightParas(requirements: ExportRequirement[], today: string, imgMap: InlineImgMap): Paragraph[] {
  const paras: Paragraph[] = []

  for (const req of requirements) {
    if (req.reqNm) {
      paras.push(new Paragraph({ children: [tr(`【需求】${req.reqNm}`, true)], alignment: AlignmentType.LEFT }))
    }
    const hasReq     = !!req.reqNm
    const hasAnyGrp  = req.groups.some((g) => g.groupNm)
    const grpIndent  = hasReq  ? 200 : 0
    const taskIndent = grpIndent + (hasAnyGrp ? 200 : 0)
    const entryIndent = taskIndent + 200

    for (const grp of req.groups) {
      if (grp.groupNm) {
        paras.push(new Paragraph({ children: [tr(`【分組】${grp.groupNm}`, true)], indent: { left: grpIndent }, alignment: AlignmentType.LEFT }))
      }
      grp.tasks.forEach((task, ti) => {
        const progPart = task.progress != null ? `当前进度: ${task.progress}%，` : ''
        paras.push(new Paragraph({
          children: [tr(`${ti + 1}. ${task.taskNm}(${progPart}总耗时：${fmtHours(task.totalHours)})`, true)],
          indent: { left: taskIndent }, alignment: AlignmentType.LEFT,
        }))

        const sorted = [...task.entries].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
        sorted.forEach((entry) => {
          const isToday = entry.date === today
          const datePfx = entry.date ? `[${shortDateLabel(entry.date)}] ` : ''
          const hlTr    = (text: string) => trHighlight(text, isToday)
          const blocks  = parseHtmlForExport(entry.description)

          if (blocks.length === 0) {
            paras.push(new Paragraph({ children: [hlTr(`- ${datePfx}`)], indent: { left: entryIndent }, alignment: AlignmentType.LEFT }))
          } else {
            blocks.forEach((block, bi) => {
              const prefix = bi === 0 ? `- ${datePfx}` : '  '
              paras.push(blockToParagraph(block, imgMap, prefix, '', hlTr, entryIndent))
            })
          }
          paras.push(...fileParas(entry.files, entryIndent))
        })
      })
    }
  }

  if (!paras.length) paras.push(p(tr('')))
  return paras
}

export async function exportRangeReport(opts: ExportRangeReportOptions): Promise<void> {
  const { startDate, endDate, workNo, userName, department = '', today, days } = opts

  // ── Flatten all entries carrying their date ───────────────────────────
  type DatedEntry = DailyLogEntry & { _date: string }
  const allDated: DatedEntry[] = days.flatMap(d => d.entries.map(e => ({ ...e, _date: d.date })))

  // ── Pre-fetch all images in parallel ─────────────────────────────────
  const [allFiles, inlineImgMap] = await Promise.all([
    Promise.all(allDated.map(e => prefetchFiles(e.files))),
    prefetchInlineImages(allDated.map(e => e.description ?? '')),
  ])
  const fileMap = new Map(allDated.map((e, i) => [e.entry_id, allFiles[i]]))

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
    reqNm:       e.requirement_nm ?? '',
    groupNm:     e.group1 ? (e.group1 === STAGE_GROUP ? formatGroupNamePlain(e.group1) : (e.group2 ? `${e.group1} / ${e.group2}` : e.group1)) : (e.group2 ?? ''),
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
    const hierarchy = buildExportHierarchy(items.map(e => toRawItem(e, e.function_id ?? e.entry_id, e.function_nm || '')))
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. ${projNm}`, true))], COL_LEFT),
      cell(buildRangeRightParas(hierarchy, today, inlineImgMap), COL_RIGHT),
    ]}))
    sectionIdx++
  }

  if (dutyGroup.length) {
    const hierarchy = buildExportHierarchy(dutyGroup.map(e => toRawItem(e, e.duty_id ?? e.entry_id, e.duty_nm || '')))
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. AR`, true))], COL_LEFT),
      cell(buildRangeRightParas(hierarchy, today, inlineImgMap), COL_RIGHT),
    ]}))
    sectionIdx++
  }

  if (otherGroup.length) {
    const hierarchy = buildExportHierarchy(otherGroup.map(e => toRawItem(e, e.work_category, CATEGORY_LABEL[e.work_category] || e.work_category)))
    dataRows.push(new TableRow({ children: [
      cell([p(tr(`${sectionIdx}. 其他`, true))], COL_LEFT),
      cell(buildRangeRightParas(hierarchy, today, inlineImgMap), COL_RIGHT),
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
