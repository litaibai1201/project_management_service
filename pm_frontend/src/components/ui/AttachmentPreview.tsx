/**
 * AttachmentPreview — 附件預覽組件
 * 圖片：縮略圖 grid + 點擊 Ant Design Image.PreviewGroup 大圖預覽
 * 文檔：帶圖標的卡片，標示文件名 / 大小 / 類型，點擊下載
 */
import React from 'react'
import { Image, Tooltip } from 'antd'
import {
  PaperClipIcon,
  DocumentTextIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'

export interface FileItem {
  name: string
  url: string
  size?: number
}

interface AttachmentPreviewProps {
  files?: FileItem[]
  images?: FileItem[]
  onPreview?: (file: FileItem) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const IMG_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|svg)$/i
const PDF_EXTENSION  = /\.pdf$/i

function isImageUrl(name: string, url: string): boolean {
  return IMG_EXTENSIONS.test(name) || IMG_EXTENSIONS.test(url) || url.startsWith('https://placehold')
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(name: string): React.ReactNode {
  if (PDF_EXTENSION.test(name))       return <span className="text-red-400 text-[10px] font-bold">PDF</span>
  if (/\.docx?$/i.test(name))         return <span className="text-blue-400 text-[10px] font-bold">DOC</span>
  if (/\.xlsx?$/i.test(name))         return <span className="text-green-400 text-[10px] font-bold">XLS</span>
  if (/\.pptx?$/i.test(name))         return <span className="text-orange-400 text-[10px] font-bold">PPT</span>
  if (/\.(ya?ml|json|xml)$/i.test(name)) return <span className="text-violet-400 text-[10px] font-bold">CFG</span>
  return <DocumentTextIcon className="w-3.5 h-3.5 text-slate-400" />
}

// ─── Component ──────────────────────────────────────────────────────────────

const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({ files = [], images = [], onPreview }) => {
  if (files.length === 0 && images.length === 0) return null

  // Separate: explicit images + any image-like files
  const imgItems: FileItem[] = [
    ...images,
    ...files.filter((f) => isImageUrl(f.name, f.url)),
  ]
  const docItems: FileItem[] = files.filter((f) => !isImageUrl(f.name, f.url))

  return (
    <div className="mt-2 space-y-2">
      {/* Image thumbnails with preview */}
      {imgItems.length > 0 && (
        <div className="flex items-start gap-1.5">
          <PhotoIcon className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 mt-0.5" />
          <Image.PreviewGroup>
            <div className="flex flex-wrap gap-1.5">
              {imgItems.map((img, i) => (
                <Tooltip key={i} title={img.name}>
                  <div className="relative rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors"
                    style={{ width: 64, height: 64 }}>
                    <Image
                      src={img.url}
                      alt={img.name}
                      width={64}
                      height={64}
                      style={{ objectFit: 'cover' }}
                      preview={{ mask: <span className="text-[10px]">預覽</span> }}
                      fallback="https://placehold.co/64x64/f1f5f9/94a3b8?text=IMG"
                    />
                  </div>
                </Tooltip>
              ))}
            </div>
          </Image.PreviewGroup>
        </div>
      )}

      {/* Document file cards */}
      {docItems.length > 0 && (
        <div className="flex items-start gap-1.5">
          <PaperClipIcon className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 mt-0.5" />
          <div className="flex flex-wrap gap-1.5">
            {docItems.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPreview ? onPreview(f) : window.open(f.url, '_blank')}
                className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 hover:border-blue-200 transition-colors group cursor-pointer"
              >
                <div className="w-6 h-6 rounded flex items-center justify-center bg-white border border-slate-100 flex-shrink-0">
                  {getFileIcon(f.name)}
                </div>
                <div className="min-w-0 text-left">
                  <div className="text-xs text-slate-600 font-medium truncate max-w-[120px] group-hover:text-blue-600">
                    {f.name}
                  </div>
                  {f.size && (
                    <div className="text-[10px] text-slate-300 leading-none">{formatSize(f.size)}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AttachmentPreview
