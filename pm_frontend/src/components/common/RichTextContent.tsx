import React from 'react'

/**
 * Renders saved rich-text (HTML) or legacy plain-text project descriptions.
 * - If the stored value looks like HTML, render it with dangerouslySetInnerHTML
 *   so that headings, lists, bold, etc. are preserved.
 * - If it's plain text (created before the rich-text editor was added),
 *   render it as-is with whitespace preserved.
 * - onImageClick: optional callback when an inline image thumbnail is clicked,
 *   receives the image src URL for full preview.
 */
const RichTextContent: React.FC<{
  html?: string
  className?: string
  onImageClick?: (src: string) => void
}> = ({ html, className = '', onImageClick }) => {
  if (!html || html === '<p></p>') {
    return <span className="text-slate-400">—</span>
  }

  const isHtml = /<[a-z][\s\S]*>/i.test(html)

  if (!isHtml) {
    return <span className={`text-slate-600 whitespace-pre-wrap text-sm leading-relaxed ${className}`}>{html}</span>
  }

  const handleClick = onImageClick
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement
        if (target.tagName === 'IMG') {
          const src = (target as HTMLImageElement).src
          if (src) onImageClick(src)
        }
      }
    : undefined

  return (
    <div
      className={`rte-display ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  )
}

export default RichTextContent
