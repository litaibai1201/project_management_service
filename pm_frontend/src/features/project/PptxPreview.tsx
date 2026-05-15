/**
 * Client-side PPTX preview.
 *
 * Handles:
 *  - p:sp  — text / placeholder shapes
 *  - p:pic — embedded images
 *  - p:graphicFrame → a:tbl — tables
 *
 * Placeholder positions fall back to:
 *  1. Explicit <a:xfrm> in the slide's <p:spPr>
 *  2. Matching placeholder in the slide layout / master
 *  3. Hard-coded defaults by placeholder type
 */
import React, { useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Spin } from 'antd'

// ─── OOXML namespaces (used only as labels; matching is by localName) ─────────
const P = 'p'   // presentationml
const A = 'a'   // drawingml

// ─── DOM helpers ──────────────────────────────────────────────────────────────
// Manual childNodes traversal — guaranteed to work on XML docs in all browsers.

function allDesc(root: Element | Document): Element[] {
  const results: Element[] = []
  const start = root instanceof Document ? root.documentElement : root
  if (!start) return results
  const walk = (node: Node) => {
    if (node.nodeType === 1 /* ELEMENT_NODE */) results.push(node as Element)
    let child = node.firstChild
    while (child) { walk(child); child = child.nextSibling }
  }
  walk(start)
  return results
}

const gels = (root: Element | Document | null | undefined, _ns: string, name: string): Element[] =>
  root ? allDesc(root).filter(el => el.localName === name) : []

const gel = (root: Element | Document | null | undefined, _ns: string, name: string): Element | null => {
  if (!root) return null
  const walk = (node: Node): Element | null => {
    if (node.nodeType === 1 && (node as Element).localName === name) return node as Element
    let child = node.firstChild
    while (child) { const f = walk(child); if (f) return f; child = child.nextSibling }
    return null
  }
  const start = root instanceof Document ? root.documentElement : root
  return start ? walk(start) : null
}

const ga = (el: Element | null | undefined, attr: string, fb = ''): string =>
  el?.getAttribute(attr) ?? fb

const getREmbed = (el: Element): string =>
  el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ||
  el.getAttribute('r:embed') || ''

// ─── Color ────────────────────────────────────────────────────────────────────
const DEFAULT_SCHEME: Record<string, string> = {
  dk1: '#000000', dk2: '#44546a', lt1: '#ffffff', lt2: '#e7e6e6',
  tx1: '#000000', tx2: '#44546a', bg1: '#ffffff', bg2: '#e7e6e6',
  accent1: '#4472c4', accent2: '#ed7d31', accent3: '#a9d18e',
  accent4: '#ffc000', accent5: '#5b9bd5', accent6: '#70ad47',
}

function applyLumMod(hex: string, lumMod: number, lumOff: number): string {
  // Convert hex to RGB, apply luminance mod/offset
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mod = lumMod / 100000
  const off = lumOff / 100000
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const nr = clamp(r * mod + 255 * off)
  const ng = clamp(g * mod + 255 * off)
  const nb = clamp(b * mod + 255 * off)
  return `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`
}

function parseColor(el: Element | null, fallback = '', scheme: Record<string, string> = DEFAULT_SCHEME): string {
  if (!el) return fallback
  // Search only direct children for fill type — prevents border <solidFill> inside
  // <lnL>/<lnR> etc. from leaking into cell/shape background colors.
  let sf: Element | null = null
  let child = el.firstElementChild
  while (child) {
    const ln = child.localName
    if (ln === 'noFill') return fallback          // explicit no-fill → transparent
    if (ln === 'solidFill') { sf = child; break } // found fill
    // gradFill / pattFill → unsupported, treat as no fill
    if (ln === 'gradFill' || ln === 'pattFill') return fallback
    child = child.nextElementSibling
  }
  if (!sf) return fallback
  const srgb = gel(sf, A, 'srgbClr')
  if (srgb) { const v = ga(srgb, 'val'); return v ? `#${v}` : fallback }
  const sys = gel(sf, A, 'sysClr')
  if (sys)  { const v = ga(sys,  'lastClr'); return v ? `#${v}` : fallback }
  const sc = gel(sf, A, 'schemeClr')
  if (sc) {
    const base = scheme[ga(sc, 'val')] ?? fallback
    if (!base) return fallback
    const lumModEl = gel(sc, A, 'lumMod')
    const lumOffEl = gel(sc, A, 'lumOff')
    const lumMod = lumModEl ? parseInt(ga(lumModEl, 'val') || '100000') : 100000
    const lumOff = lumOffEl ? parseInt(ga(lumOffEl, 'val') || '0') : 0
    if (lumMod !== 100000 || lumOff !== 0) return applyLumMod(base, lumMod, lumOff)
    return base
  }
  return fallback
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Pos = { x: number; y: number; w: number; h: number }

interface TextRun {
  text: string
  fontSize: number
  bold: boolean; italic: boolean; underline: boolean
  color: string
  align: 'left' | 'center' | 'right'
}

interface CellData {
  runs: TextRun[]
  bgColor: string
}

interface SlideShape {
  type: 'text' | 'image' | 'table'
  x: number; y: number; w: number; h: number
  runs?: TextRun[]
  src?: string
  rows?: CellData[][]
  colWidths?: number[]   // each col width as fraction of table width
}

interface SlideData { shapes: SlideShape[]; bgColor: string }

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_W = 9144000
const DEFAULT_H = 5143500
const VIRTUAL_W = 960

function szToPx(sz: number, slideW: number) {
  return (sz / 100) * VIRTUAL_W * 12700 / slideW
}

const PH_DEFAULTS: Record<string, Pos> = {
  title:    { x: 0.04, y: 0.04, w: 0.92, h: 0.14 },
  ctrTitle: { x: 0.04, y: 0.28, w: 0.92, h: 0.20 },
  subTitle: { x: 0.12, y: 0.52, w: 0.76, h: 0.22 },
  body:     { x: 0.04, y: 0.20, w: 0.92, h: 0.70 },
  dt:       { x: 0.00, y: 0.93, w: 0.25, h: 0.06 },
  ftr:      { x: 0.25, y: 0.93, w: 0.50, h: 0.06 },
  sldNum:   { x: 0.75, y: 0.93, w: 0.25, h: 0.06 },
}

// ─── Position helpers ─────────────────────────────────────────────────────────

function extractXfrm(el: Element | null, slideW: number, slideH: number): Pos | null {
  const xfrm = gel(el, A, 'xfrm')
  if (!xfrm) return null
  const off = gel(xfrm, A, 'off')
  const ext = gel(xfrm, A, 'ext')
  if (!off || !ext) return null
  const x = parseInt(ga(off, 'x') || '0')
  const y = parseInt(ga(off, 'y') || '0')
  const w = parseInt(ga(ext, 'cx') || '0')
  const h = parseInt(ga(ext, 'cy') || '0')
  if (w <= 0 || h <= 0) return null
  return { x: x / slideW, y: y / slideH, w: w / slideW, h: h / slideH }
}

function extractLayoutPositions(doc: Document, slideW: number, slideH: number): Map<string, Pos> {
  const map = new Map<string, Pos>()
  for (const sp of gels(doc, P, 'sp')) {
    const ph  = gel(gel(gel(sp, P, 'nvSpPr'), P, 'nvPr'), P, 'ph')
    if (!ph) continue
    const type = ga(ph, 'type') || 'body'
    const idx  = ga(ph, 'idx')
    const pos  = extractXfrm(gel(sp, P, 'spPr'), slideW, slideH)
    if (!pos) continue
    if (idx) map.set(`${type}:${idx}`, pos)
    if (!map.has(type)) map.set(type, pos)
  }
  return map
}

// ─── Text run helper ──────────────────────────────────────────────────────────

function extractTextRuns(txBody: Element, slideW: number, scheme: Record<string, string>, defaultAlign: TextRun['align'] = 'left'): TextRun[] {
  const runs: TextRun[] = []
  for (const para of gels(txBody, A, 'p')) {
    const pPr      = gel(para, A, 'pPr')
    const algn     = ga(pPr, 'algn')
    const paraAlign = (algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : defaultAlign) as TextRun['align']
    const defSz    = parseInt(ga(gel(pPr, A, 'defRPr'), 'sz') || '1800')

    const lineRuns: TextRun[] = []
    for (const r of [...gels(para, A, 'r'), ...gels(para, A, 'fld')]) {
      const text = gel(r, A, 't')?.textContent ?? ''
      if (!text) continue
      const rPr      = gel(r, A, 'rPr')
      const sz       = parseInt(ga(rPr, 'sz') || String(defSz))
      const bold     = ga(rPr, 'b') === '1'
      const italic   = ga(rPr, 'i') === '1'
      const u        = ga(rPr, 'u')
      const underline = !!u && u !== 'none'
      const color    = parseColor(rPr, '', scheme)
      lineRuns.push({ text, fontSize: szToPx(sz, slideW), bold, italic, underline, color, align: paraAlign })
    }
    if (lineRuns.length) {
      runs.push(...lineRuns)
      runs.push({ text: '\n', fontSize: 0, bold: false, italic: false, underline: false, color: '', align: 'left' })
    }
  }
  return runs
}

// ─── PPTX parser ─────────────────────────────────────────────────────────────

async function parsePptx(blob: Blob) {
  const zip   = await JSZip.loadAsync(blob)
  const parse = (xml: string) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.querySelector('parseerror')) console.warn('[PPTX] XML parse error:', xml.slice(0, 120))
    return doc
  }
  const read  = async (path: string) => (await zip.file(path)?.async('string')) ?? ''
  const blobUrls: string[] = []

  const presDoc  = parse(await read('ppt/presentation.xml'))
  const sldSz    = gel(presDoc, P, 'sldSz')
  const slideW   = parseInt(ga(sldSz, 'cx') || String(DEFAULT_W))
  const slideH   = parseInt(ga(sldSz, 'cy') || String(DEFAULT_H))
  const aspectRatio = slideW / slideH

  // Read actual theme colors
  const scheme: Record<string, string> = { ...DEFAULT_SCHEME }
  const themeFiles = Object.keys(zip.files).filter(f => /^ppt\/theme\/theme\d+\.xml$/.test(f))
  if (themeFiles.length > 0) {
    const themeDoc = parse(await read(themeFiles[0]))
    const clrScheme = gel(themeDoc, A, 'clrScheme')
    if (clrScheme) {
      let child = clrScheme.firstElementChild
      while (child) {
        const name = child.localName
        // Each child of clrScheme has exactly one color child (srgbClr or sysClr)
        const colorEl = child.firstElementChild
        if (colorEl) {
          const ln = colorEl.localName
          if (ln === 'srgbClr') {
            const v = ga(colorEl, 'val'); if (v) scheme[name] = `#${v}`
          } else if (ln === 'sysClr') {
            const v = ga(colorEl, 'lastClr'); if (v) scheme[name] = `#${v}`
          }
        }
        child = child.nextElementSibling
      }
    }
  }
  // Build aliases so both short names (dk1) and long names (dark1) resolve
  const ALIASES: Record<string, string> = {
    dk1: 'dark1', dk2: 'dark2', lt1: 'light1', lt2: 'light2',
    dark1: 'dk1', dark2: 'dk2', light1: 'lt1', light2: 'lt2',
  }
  for (const [k, v] of Object.entries(ALIASES)) {
    if (!scheme[k] && scheme[v]) scheme[k] = scheme[v]
  }

  const slideFiles = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const n = (s: string) => parseInt(s.match(/slide(\d+)/)?.[1] ?? '0')
      return n(a) - n(b)
    })

  const slides: SlideData[] = []

  for (const slidePath of slideFiles) {
    const num     = slidePath.match(/slide(\d+)\.xml/)?.[1] ?? '1'
    const xml     = await read(slidePath)
    const relsXml = await read(`ppt/slides/_rels/slide${num}.xml.rels`)
    const doc     = parse(xml)

    const rels: Record<string, string> = {}
    for (const rel of Array.from(parse(relsXml).getElementsByTagName('Relationship'))) {
      rels[ga(rel, 'Id')] = ga(rel, 'Target')
    }

    // ── Layout / master placeholder positions ─────────────────────────────
    let layoutPositions = new Map<string, Pos>()
    const layoutTarget = Object.values(rels).find(t => t.includes('slideLayout'))
    if (layoutTarget) {
      const layoutPath = layoutTarget.startsWith('../')
        ? 'ppt/' + layoutTarget.slice(3)
        : 'ppt/slides/' + layoutTarget
      const layoutDoc = parse(await read(layoutPath))
      layoutPositions = extractLayoutPositions(layoutDoc, slideW, slideH)

      if (layoutPositions.size === 0) {
        const layoutName    = layoutPath.split('/').pop()!
        const layoutRelsXml = await read(layoutPath.replace(`/${layoutName}`, `/_rels/${layoutName}.rels`))
        const masterTarget  = Array.from(parse(layoutRelsXml).getElementsByTagName('Relationship'))
          .find(r => ga(r, 'Target').includes('slideMaster'))
          ?.getAttribute('Target')
        if (masterTarget) {
          const masterPath = masterTarget.startsWith('../')
            ? 'ppt/' + masterTarget.slice(3)
            : 'ppt/slideLayouts/' + masterTarget
          layoutPositions = extractLayoutPositions(parse(await read(masterPath)), slideW, slideH)
        }
      }
    }

    const getTextPos = (sp: Element): Pos | null => {
      const pos = extractXfrm(gel(sp, P, 'spPr'), slideW, slideH)
      if (pos) return pos
      const ph   = gel(gel(gel(sp, P, 'nvSpPr'), P, 'nvPr'), P, 'ph')
      if (!ph) return null
      const type = ga(ph, 'type') || 'body'
      const idx  = ga(ph, 'idx')
      if (idx) { const p = layoutPositions.get(`${type}:${idx}`); if (p) return p }
      const p = layoutPositions.get(type)
      if (p) return p
      return PH_DEFAULTS[type] ?? PH_DEFAULTS['body'] ?? null
    }

    // ── Background ────────────────────────────────────────────────────────
    let bgColor = '#ffffff'
    const bg    = gel(doc, P, 'bg')
    const bgPr  = bg ? gel(bg, P, 'bgPr') : null
    if (bgPr) {
      bgColor = parseColor(bgPr, '#ffffff', scheme) || '#ffffff'
    } else {
      // Most slides use <p:bgRef idx="N"><a:schemeClr val="bg1"/></p:bgRef>
      const bgRef = bg ? gel(bg, P, 'bgRef') : null
      if (bgRef) {
        const sc = gel(bgRef, A, 'schemeClr')
        if (sc) bgColor = scheme[ga(sc, 'val')] || '#ffffff'
      }
    }

    const shapes: SlideShape[] = []

    // ── Text shapes (p:sp) ────────────────────────────────────────────────
    for (const sp of gels(doc, P, 'sp')) {
      const txBody = gel(sp, P, 'txBody')
      if (!txBody) continue
      const pos = getTextPos(sp)
      if (!pos) continue
      const runs = extractTextRuns(txBody, slideW, scheme)
      if (runs.some(r => r.text !== '\n')) {
        shapes.push({ type: 'text', ...pos, runs })
      }
    }

    // ── Tables inside graphic frames (p:graphicFrame → a:tbl) ────────────
    for (const frame of gels(doc, P, 'graphicFrame')) {
      const tbl = gel(frame, A, 'tbl')
      if (!tbl) continue

      // Position: <p:xfrm> is a direct child of <p:graphicFrame>
      const pos = extractXfrm(frame, slideW, slideH)
      if (!pos) continue

      // Column widths from <a:tblGrid><a:gridCol w="..."/>
      const tblGrid   = gel(tbl, A, 'tblGrid')
      const gridCols  = gels(tblGrid, A, 'gridCol')
      const totalColW = gridCols.reduce((s, c) => s + parseInt(ga(c, 'w') || '0'), 0) || 1
      const colWidths = gridCols.map(c => parseInt(ga(c, 'w') || '0') / totalColW)

      // Rows and cells
      const rows: CellData[][] = []
      for (const tr of gels(tbl, A, 'tr')) {
        const cells: CellData[] = []
        for (const tc of gels(tr, A, 'tc')) {
          // skip cells that are part of a merge
          if (ga(tc, 'hMerge') === '1' || ga(tc, 'vMerge') === '1') {
            cells.push({ runs: [], bgColor: '' })
            continue
          }
          const txBody  = gel(tc, A, 'txBody')
          const runs    = txBody ? extractTextRuns(txBody, slideW, scheme) : []
          const tcPr    = gel(tc, A, 'tcPr')
          const bg      = parseColor(tcPr, '', scheme)
          cells.push({ runs, bgColor: bg })
        }
        if (cells.length) rows.push(cells)
      }

      if (rows.length) {
        shapes.push({ type: 'table', ...pos, rows, colWidths })
      }
    }

    // ── Images (p:pic) ────────────────────────────────────────────────────
    for (const pic of gels(doc, P, 'pic')) {
      const blip  = gel(pic, A, 'blip')
      const embed = blip ? getREmbed(blip) : ''
      const target = embed ? rels[embed] : ''
      if (!target) continue

      const mediaPath = target.startsWith('../') ? 'ppt/' + target.slice(3) : 'ppt/slides/' + target
      const mediaFile = zip.file(mediaPath)
      if (!mediaFile) continue

      const ext  = mediaPath.split('.').pop()?.toLowerCase() ?? 'png'
      const MIME: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
      }
      const src = URL.createObjectURL(
        new Blob([await mediaFile.async('arraybuffer')], { type: MIME[ext] ?? 'image/png' })
      )
      blobUrls.push(src)

      const pos = extractXfrm(gel(pic, P, 'spPr'), slideW, slideH)
      if (!pos) continue
      shapes.push({ type: 'image', ...pos, src })
    }

    slides.push({ shapes, bgColor })
  }

  return { slides, blobUrls, aspectRatio }
}

// ─── Run renderer helper ──────────────────────────────────────────────────────

function RunsView({ runs }: { runs: TextRun[] }) {
  const blocks: TextRun[][] = []
  let cur: TextRun[] = []
  for (const r of runs) {
    if (r.text === '\n') { if (cur.length) blocks.push(cur); cur = [] }
    else cur.push(r)
  }
  if (cur.length) blocks.push(cur)

  return (
    <>
      {blocks.map((block, bi) => (
        <div key={bi} style={{ textAlign: block[0]?.align ?? 'left', lineHeight: 1.3 }}>
          {block.map((r, ri) => (
            <span key={ri} style={{
              fontSize: r.fontSize || 14,
              fontWeight: r.bold ? 700 : 400,
              fontStyle: r.italic ? 'italic' : 'normal',
              textDecoration: r.underline ? 'underline' : 'none',
              color: r.color || '#000',
            }}>{r.text}</span>
          ))}
        </div>
      ))}
    </>
  )
}

// ─── Slide renderer ───────────────────────────────────────────────────────────

const SlideView: React.FC<{ slide: SlideData; aspectRatio: number }> = ({ slide, aspectRatio }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const virtualH = Math.round(VIRTUAL_W / aspectRatio)

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const obs = new ResizeObserver(([e]) => setScale(e.contentRect.width / VIRTUAL_W))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={containerRef} style={{
      width: '100%', paddingTop: `${(1 / aspectRatio) * 100}%`,
      position: 'relative', overflow: 'hidden',
      background: slide.bgColor, border: '1px solid #e2e8f0',
      boxShadow: '0 2px 8px rgba(0,0,0,.12)',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: VIRTUAL_W, height: virtualH,
        transformOrigin: 'top left', transform: `scale(${scale})`,
        overflow: 'hidden',
      }}>
        {slide.shapes.map((shape, i) => {
          const left   = shape.x * VIRTUAL_W
          const top    = shape.y * virtualH
          const width  = shape.w * VIRTUAL_W
          const height = shape.h * virtualH

          if (shape.type === 'image') {
            return <img key={i} src={shape.src} alt=""
              style={{ position: 'absolute', left, top, width, height, objectFit: 'contain' }} />
          }

          if (shape.type === 'table' && shape.rows) {
            return (
              <div key={i} style={{ position: 'absolute', left, top, width, minHeight: height, boxSizing: 'border-box' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 12 }}>
                  {shape.colWidths && (
                    <colgroup>
                      {shape.colWidths.map((cw, ci) => <col key={ci} style={{ width: `${cw * 100}%` }} />)}
                    </colgroup>
                  )}
                  <tbody>
                    {shape.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{
                            border: '1px solid #cbd5e1',
                            padding: '3px 6px',
                            background: cell.bgColor || 'transparent',
                            verticalAlign: 'top',
                            lineHeight: 1.4,
                            wordBreak: 'break-word',
                          }}>
                            <RunsView runs={cell.runs} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }

          // text shape
          return (
            <div key={i} style={{
              position: 'absolute', left, top, width, height,
              overflow: 'hidden', padding: '2px 4px', boxSizing: 'border-box',
            }}>
              <RunsView runs={shape.runs ?? []} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

const PptxPreview: React.FC<{ blob: Blob }> = ({ blob }) => {
  const [data,   setData]   = useState<Awaited<ReturnType<typeof parsePptx>> | null>(null)
  const [active, setActive] = useState(0)
  const [error,  setError]  = useState(false)
  const urlsRef = useRef<string[]>([])

  useEffect(() => {
    parsePptx(blob)
      .then(r => { urlsRef.current = r.blobUrls; setData(r) })
      .catch(e => { console.error('PPTX parse error:', e); setError(true) })
    return () => { urlsRef.current.forEach(URL.revokeObjectURL) }
  }, [blob])

  if (error) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'48px 0', color:'#94a3b8', gap:8 }}>
      <span style={{ fontSize:32 }}>⚠️</span><span>文件渲染失敗，請下載後查看</span>
    </div>
  )
  if (!data) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}>
      <Spin tip="解析中…" />
    </div>
  )
  if (data.slides.length === 0) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'48px 0', color:'#94a3b8', gap:8 }}>
      <span style={{ fontSize:32 }}>📄</span><span>未能讀取到投影片，請下載後查看</span>
    </div>
  )

  const { slides, aspectRatio } = data

  return (
    <div>
      {slides.length > 1 && (
        <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap', padding:'8px 16px', borderBottom:'1px solid #e2e8f0', background:'#f8fafc' }}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} style={{
              minWidth:32, height:28, padding:'0 10px',
              border: i === active ? '2px solid #2563eb' : '1px solid #cbd5e1',
              borderRadius:4, background: i === active ? '#eff6ff' : '#fff',
              color: i === active ? '#2563eb' : '#64748b',
              fontSize:12, cursor:'pointer', fontWeight: i === active ? 600 : 400,
            }}>{i + 1}</button>
          ))}
          <span style={{ marginLeft:8, fontSize:12, color:'#94a3b8' }}>{active + 1} / {slides.length}</span>
        </div>
      )}
      <div style={{ padding:'12px 16px', background:'#e8e8e8' }}>
        <SlideView slide={slides[active]} aspectRatio={aspectRatio} />
      </div>
    </div>
  )
}

export default PptxPreview
