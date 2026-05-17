import React from 'react'

/**
 * Renders saved rich-text (HTML) or legacy plain-text project descriptions.
 * - If the stored value looks like HTML, render it with dangerouslySetInnerHTML
 *   so that headings, lists, bold, etc. are preserved.
 * - If it's plain text (created before the rich-text editor was added),
 *   render it as-is with whitespace preserved.
 */
const RichTextContent: React.FC<{ html?: string; className?: string }> = ({ html, className = '' }) => {
  if (!html || html === '<p></p>') {
    return <span className="text-slate-400">—</span>
  }

  const isHtml = /<[a-z][\s\S]*>/i.test(html)

  if (!isHtml) {
    return <span className={`text-slate-600 whitespace-pre-wrap text-sm leading-relaxed ${className}`}>{html}</span>
  }

  return (
    <div
      className={`rte-display ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default RichTextContent
