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
body{font-family:sans-serif;font-size:12px;margin:8px;overflow:auto;}
table{border-collapse:collapse;}
td,th{border:1px solid #e2e8f0;padding:4px 8px;white-space:nowrap;vertical-align:top;}
th{background:#f1f5f9;font-weight:600;}
</style>`
        setSheets(wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name]
          const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(ws, { header: 1, defval: '' })
          const tbody = rows.map((row) =>
            `<tr>${row.map((cell) => `<td>${String(cell ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}</tr>`
          ).join('')
          return { name, html: `<!DOCTYPE html><html><head><meta charset="utf-8">${STYLE}</head><body><table>${tbody}</table></body></html>` }
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
    <div>
      {sheets.length > 1 && (
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '0 16px', background: '#f8fafc' }}>
          {sheets.map((s, i) => (
            <button key={s.name} onClick={() => setActive(i)} style={{
              padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
              borderBottom: i === active ? '2px solid #2563eb' : '2px solid transparent',
              color: i === active ? '#2563eb' : '#64748b', fontSize: 13, fontWeight: i === active ? 600 : 400,
            }}>{s.name}</button>
          ))}
        </div>
      )}
      <iframe srcDoc={sheets[active]?.html} title="xlsx-preview"
        style={{ width: '100%', height: '68vh', border: 'none', display: 'block' }} />
    </div>
  )
}

// ─── Ext sets ─────────────────────────────────────────────────────────────────

const IMAGE_EXTS  = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
const PDF_EXTS    = new Set(['pdf'])
const TEXT_EXTS   = new Set(['txt', 'md', 'yaml', 'yml', 'csv'])
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
          if (TEXT_EXTS.has(ext)) {
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
          if (TEXT_EXTS.has(ext)) {
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
  const isWide = PDF_EXTS.has(ext) || HTML_EXTS.has(ext) || DOCX_EXTS.has(ext) || XLSX_EXTS.has(ext) || PPTX_EXTS.has(ext)

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
      ) : TEXT_EXTS.has(ext) && state.text !== undefined ? (
        <pre style={{
          margin: 0, padding: '16px 20px', fontSize: 13, lineHeight: 1.6,
          fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          background: '#f8fafc', minHeight: 200,
        }}>{state.text}</pre>
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
