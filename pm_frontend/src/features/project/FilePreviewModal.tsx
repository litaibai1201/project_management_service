import React, { useEffect, useRef, useState } from 'react'
import { Modal, Spin, Button } from 'antd'
import { renderAsync as renderDocx } from 'docx-preview'
import * as XLSX from 'xlsx'
import PptxPreview from './PptxPreview'
import { projectApi } from '@/api/project.api'
import { ProjectFile } from '@/types/api.types'

// ─── Sub-renderers ────────────────────────────────────────────────────────────

const DocxRenderer: React.FC<{ blob: Blob }> = ({ blob }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    blob.arrayBuffer().then((buf) => {
      renderDocx(buf, ref.current!, undefined, {
        className: 'docx-preview-body', inWrapper: true,
        ignoreWidth: false, ignoreHeight: false, ignoreFonts: false,
        breakPages: true, useBase64URL: true,
      }).catch(() => setError(true))
    })
  }, [blob])
  if (error) return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
      <span className="text-3xl">⚠️</span><span>文件渲染失敗，請下載後查看</span>
    </div>
  )
  return <div ref={ref} style={{ padding: '16px 32px', background: '#f0f0f0', minHeight: 300 }} />
}

const colIndexToLetter = (n: number): string => {
  let result = ''
  while (n >= 0) { result = String.fromCharCode(65 + (n % 26)) + result; n = Math.floor(n / 26) - 1 }
  return result
}

const XlsxRenderer: React.FC<{ blob: Blob }> = ({ blob }) => {
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState<false | 'password' | 'error'>(false)
  useEffect(() => {
    const load = async () => {
      try {
        const binary = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsBinaryString(blob)
        })
        const wb = XLSX.read(binary, { type: 'binary' })
        const STYLE = `<style>
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; margin: 0; background: #fff; }
table { border-collapse: collapse; table-layout: auto; }
td, th { border: 1px solid #d0d7de; padding: 3px 8px; white-space: nowrap; vertical-align: middle; font-size: 12px; }
thead th { background: #f6f8fa; font-weight: 600; text-align: center; color: #57606a; position: sticky; top: 0; z-index: 2; min-width: 80px; }
th.rn, td.rn { background: #f6f8fa; font-weight: 600; text-align: center; color: #57606a; position: sticky; left: 0; z-index: 1; min-width: 40px; width: 40px; max-width: 40px; font-size: 11px; border-right: 2px solid #d0d7de; }
thead th.rn { z-index: 3; }
tbody tr:hover td { background: #f0f6ff; }
tbody tr:hover td.rn { background: #e0ecff; }
</style>`
        setSheets(wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name]
          if (!ws['!ref']) return { name, html: `<!DOCTYPE html><html><head><meta charset="utf-8">${STYLE}</head><body><p style="padding:16px;color:#94a3b8">空白工作表</p></body></html>` }
          const range = XLSX.utils.decode_range(ws['!ref'])
          const numCols = range.e.c - range.s.c + 1
          const colHeaders = `<tr><th class="rn"></th>${Array.from({ length: numCols }, (_, i) =>
            `<th>${colIndexToLetter(range.s.c + i)}</th>`
          ).join('')}</tr>`
          const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(ws, { header: 1, defval: '', range })
          const tbody = rows.map((row, ri) => {
            const cells = Array.from({ length: numCols }, (_, ci) => {
              const v = (row as (string | number | boolean | null)[])[ci] ?? ''
              return `<td>${String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`
            }).join('')
            return `<tr><td class="rn">${range.s.r + ri + 1}</td>${cells}</tr>`
          }).join('')
          return { name, html: `<!DOCTYPE html><html><head><meta charset="utf-8">${STYLE}</head><body><table><thead>${colHeaders}</thead><tbody>${tbody}</tbody></table></body></html>` }
        }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        setError(msg.includes('password') ? 'password' : 'error')
      }
    }
    load()
  }, [blob])
  if (error) return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
      <span className="text-3xl">⚠️</span>
      <span>{error === 'password' ? '此文件已加密，請下載後用密碼開啟' : '文件渲染失敗，請下載後查看'}</span>
    </div>
  )
  if (sheets.length === 0) return <div className="flex justify-center py-10"><Spin /></div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '75vh' }}>
      {/* Sheet tabs at bottom — matches spreadsheet convention */}
      <iframe srcDoc={sheets[active]?.html} title="xlsx-preview"
        style={{ flex: 1, border: 'none', display: 'block', width: '100%' }} />
      <div style={{ borderTop: '1px solid #e2e8f0', display: 'flex', background: '#f8fafc', flexShrink: 0 }}>
        {sheets.map((s, i) => (
          <button key={s.name} onClick={() => setActive(i)} style={{
            padding: '6px 16px', border: 'none', background: i === active ? '#fff' : 'transparent',
            borderTop: i === active ? '2px solid #2563eb' : '2px solid transparent',
            borderRight: '1px solid #e2e8f0',
            cursor: 'pointer', color: i === active ? '#2563eb' : '#64748b',
            fontSize: 12, fontWeight: i === active ? 600 : 400,
          }}>{s.name}</button>
        ))}
      </div>
    </div>
  )
}

const CsvRenderer: React.FC<{ text: string }> = ({ text }) => {
  const SPREADSHEET_STYLE = `<style>
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; margin: 0; background: #fff; }
table { border-collapse: collapse; table-layout: auto; }
td, th { border: 1px solid #d0d7de; padding: 3px 8px; white-space: nowrap; vertical-align: middle; font-size: 12px; }
thead th { background: #f6f8fa; font-weight: 600; text-align: center; color: #57606a; position: sticky; top: 0; z-index: 2; min-width: 80px; }
th.rn, td.rn { background: #f6f8fa; font-weight: 600; text-align: center; color: #57606a; position: sticky; left: 0; z-index: 1; min-width: 40px; width: 40px; max-width: 40px; font-size: 11px; border-right: 2px solid #d0d7de; }
thead th.rn { z-index: 3; }
tbody tr:nth-child(even) td { background: #fafbfc; }
tbody tr:nth-child(even) td.rn { background: #f0f2f4; }
tbody tr:hover td { background: #f0f6ff; }
tbody tr:hover td.rn { background: #e0ecff; }
thead tr th:not(.rn) { background: #f6f8fa; }
</style>`

  const rows = text.split('\n').map((line) => {
    const cells: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cells.push(cur); cur = '' }
      else { cur += ch }
    }
    cells.push(cur)
    return cells
  }).filter((r) => r.some((c) => c.trim() !== ''))

  if (rows.length === 0) return <div className="flex justify-center items-center py-16 text-slate-400">空白文件</div>

  const numCols = Math.max(...rows.map((r) => r.length))
  const colHeaders = `<tr><th class="rn"></th>${Array.from({ length: numCols }, (_, i) => `<th>${colIndexToLetter(i)}</th>`).join('')}</tr>`
  const [header, ...body] = rows
  const theadRow = `<tr><td class="rn">1</td>${header.map((c) => `<th style="background:#e8f0fe;color:#1d4ed8;font-weight:700">${c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</th>`).join('')}</tr>`
  const tbody = body.map((row, ri) => {
    const cells = Array.from({ length: numCols }, (_, ci) => {
      const v = row[ci] ?? ''
      return `<td>${v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>`
    }).join('')
    return `<tr><td class="rn">${ri + 2}</td>${cells}</tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${SPREADSHEET_STYLE}</head><body><table><thead>${colHeaders}${theadRow}</thead><tbody>${tbody}</tbody></table></body></html>`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '75vh' }}>
      <iframe srcDoc={html} title="csv-preview" style={{ flex: 1, border: 'none', display: 'block', width: '100%' }} />
      <div style={{ borderTop: '1px solid #e2e8f0', padding: '4px 16px', background: '#f8fafc', fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
        共 {body.length} 行 · {numCols} 列
      </div>
    </div>
  )
}

// ─── Ext sets ─────────────────────────────────────────────────────────────────

const IMAGE_EXTS  = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
const PDF_EXTS    = new Set(['pdf'])
const TEXT_EXTS   = new Set(['txt', 'md', 'yaml', 'yml'])
const CSV_EXTS    = new Set(['csv'])
const HTML_EXTS   = new Set(['html', 'htm'])
const DOCX_EXTS   = new Set(['docx'])
const XLSX_EXTS   = new Set(['xlsx', 'xls'])
const PPTX_EXTS   = new Set(['pptx', 'ppt'])

// ─── FilePreviewModal ─────────────────────────────────────────────────────────

interface FilePreviewState {
  blobUrl?: string
  blob?: Blob
  text?: string
  loading: boolean
}

interface Props {
  // Project file mode
  file?: ProjectFile | null
  projectId?: string
  // Direct URL mode (for progress attachments — token already in URL)
  directUrl?: string | null
  filename?: string
  onClose: () => void
}

const FilePreviewModal: React.FC<Props> = ({ file, projectId, directUrl, filename, onClose }) => {
  const [state, setState] = useState<FilePreviewState>({ loading: false })

  useEffect(() => {
    const isProjectMode = !!file && !!projectId
    const isDirectMode  = !!directUrl && !!filename
    if (!isProjectMode && !isDirectMode) return

    const ext = isProjectMode ? file!.file_ext.toLowerCase() : (filename!.split('.').pop()?.toLowerCase() ?? '')
    setState({ loading: true })

    const load = async () => {
      try {
        if (isDirectMode) {
          // Direct URL — token is already embedded in the query string
          if (TEXT_EXTS.has(ext) || CSV_EXTS.has(ext)) {
            const text = await window.fetch(directUrl!).then((r) => r.text())
            setState({ text, loading: false })
          } else if (IMAGE_EXTS.has(ext) || PDF_EXTS.has(ext) || HTML_EXTS.has(ext)) {
            const blob = await window.fetch(directUrl!).then((r) => r.blob())
            setState({ blobUrl: URL.createObjectURL(blob), loading: false })
          } else if (DOCX_EXTS.has(ext) || XLSX_EXTS.has(ext) || PPTX_EXTS.has(ext)) {
            const blob = await window.fetch(directUrl!).then((r) => r.blob())
            setState({ blob, loading: false })
          } else {
            setState({ loading: false })
          }
        } else {
          if (TEXT_EXTS.has(ext) || CSV_EXTS.has(ext)) {
            const text = await projectApi.previewFileAsText(projectId!, file!.id)
            setState({ text, loading: false })
          } else if (IMAGE_EXTS.has(ext) || PDF_EXTS.has(ext) || HTML_EXTS.has(ext)) {
            const blobUrl = await projectApi.previewFileAsBlob(projectId!, file!.id)
            setState({ blobUrl, loading: false })
          } else if (DOCX_EXTS.has(ext) || XLSX_EXTS.has(ext) || PPTX_EXTS.has(ext)) {
            const blob = await projectApi.previewFileRawBlob(projectId!, file!.id)
            setState({ blob, loading: false })
          } else {
            setState({ loading: false })
          }
        }
      } catch {
        setState({ loading: false })
      }
    }
    load()
    return () => {
      setState((prev) => { if (prev.blobUrl) URL.revokeObjectURL(prev.blobUrl); return { loading: false } })
    }
  }, [file, projectId, directUrl, filename])

  if (!file && !directUrl) return null

  const title = file ? file.file_nm : (filename ?? '')
  const ext   = file ? file.file_ext.toLowerCase() : (filename?.split('.').pop()?.toLowerCase() ?? '')
  const isWide = PDF_EXTS.has(ext) || HTML_EXTS.has(ext) || DOCX_EXTS.has(ext) || XLSX_EXTS.has(ext) || PPTX_EXTS.has(ext) || CSV_EXTS.has(ext)

  const footerBtn = file && projectId
    ? <a href={projectApi.getFileDownloadUrl(projectId, file.id)} target="_blank" rel="noreferrer"><Button>下載</Button></a>
    : directUrl
      ? <a href={directUrl} target="_blank" rel="noreferrer"><Button>下載</Button></a>
      : null

  return (
    <Modal
      open
      title={title}
      onCancel={onClose}
      footer={footerBtn}
      width={isWide ? '85vw' : 700}
      styles={{ body: { padding: 0, maxHeight: '78vh', overflow: 'auto' } }}
      destroyOnHidden
    >
      {state.loading ? (
        <div className="flex justify-center items-center py-16"><Spin size="large" /></div>
      ) : IMAGE_EXTS.has(ext) && state.blobUrl ? (
        <div className="flex justify-center p-4 bg-slate-50">
          <img src={state.blobUrl} alt={title}
            style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }} />
        </div>
      ) : PDF_EXTS.has(ext) && state.blobUrl ? (
        <iframe src={state.blobUrl} title={title}
          style={{ width: '100%', height: '78vh', border: 'none', display: 'block' }} />
      ) : HTML_EXTS.has(ext) && state.blobUrl ? (
        <iframe src={state.blobUrl} title={title} sandbox="allow-same-origin"
          style={{ width: '100%', height: '78vh', border: 'none', display: 'block' }} />
      ) : CSV_EXTS.has(ext) && state.text !== undefined ? (
        <CsvRenderer text={state.text} />
      ) : TEXT_EXTS.has(ext) && state.text !== undefined ? (
        <div style={{ background: '#fff', minHeight: 300, padding: '32px 48px' }}>
          <pre style={{
            margin: 0, fontSize: 13, lineHeight: 1.8,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1e293b',
          }}>{state.text}</pre>
        </div>
      ) : DOCX_EXTS.has(ext) && state.blob ? (
        <DocxRenderer blob={state.blob} />
      ) : XLSX_EXTS.has(ext) && state.blob ? (
        <XlsxRenderer blob={state.blob} />
      ) : PPTX_EXTS.has(ext) && state.blob ? (
        <PptxPreview blob={state.blob} />
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
          <span className="text-4xl">📄</span>
          <span>此文件類型不支持預覽，請下載後查看</span>
        </div>
      )}
    </Modal>
  )
}

export default FilePreviewModal
