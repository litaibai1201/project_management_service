import React from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { Select } from 'antd'

// ─── Toolbar Button ───────────────────────────────────────────────────────────

const ToolBtn: React.FC<{
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}> = ({ active, onClick, title, children }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => { e.preventDefault(); onClick() }}
    className={[
      'w-7 h-7 flex items-center justify-center rounded select-none transition-colors',
      'border-0 outline-none shadow-none',
      active
        ? 'bg-blue-100 text-blue-600'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
    ].join(' ')}
  >
    {children}
  </button>
)

const Sep = () => <div className="w-px h-5 bg-slate-200 mx-1 flex-shrink-0" />

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

const BulletListIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <circle cx="3" cy="5" r="1.5" />
    <rect x="6.5" y="4" width="10.5" height="2" rx="1" />
    <circle cx="3" cy="10" r="1.5" />
    <rect x="6.5" y="9" width="10.5" height="2" rx="1" />
    <circle cx="3" cy="15" r="1.5" />
    <rect x="6.5" y="14" width="10.5" height="2" rx="1" />
  </svg>
)

const OrderedListIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <rect x="2" y="3.5" width="3" height="3" rx="0.5" opacity="0.8" />
    <rect x="6.5" y="4" width="10.5" height="2" rx="1" />
    <rect x="2" y="8.5" width="3" height="3" rx="0.5" opacity="0.8" />
    <rect x="6.5" y="9" width="10.5" height="2" rx="1" />
    <rect x="2" y="13.5" width="3" height="3" rx="0.5" opacity="0.8" />
    <rect x="6.5" y="14" width="10.5" height="2" rx="1" />
  </svg>
)

const TaskListIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <rect x="2" y="3.5" width="3" height="3" rx="0.5" fillOpacity="0.15" stroke="currentColor" strokeWidth="1" />
    <path d="M2.5 8.5 L3.5 9.5 L5.5 7.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="2" y="13.5" width="3" height="3" rx="0.5" fillOpacity="0.15" stroke="currentColor" strokeWidth="1" />
    <rect x="6.5" y="4" width="10.5" height="2" rx="1" />
    <rect x="6.5" y="9" width="10.5" height="2" rx="1" />
    <rect x="6.5" y="14" width="10.5" height="2" rx="1" />
  </svg>
)

const AlignLeftIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <rect x="2" y="4" width="16" height="2" rx="1" />
    <rect x="2" y="9" width="10" height="2" rx="1" />
    <rect x="2" y="14" width="14" height="2" rx="1" />
  </svg>
)

const AlignCenterIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <rect x="2" y="4" width="16" height="2" rx="1" />
    <rect x="5" y="9" width="10" height="2" rx="1" />
    <rect x="3" y="14" width="14" height="2" rx="1" />
  </svg>
)

const AlignRightIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <rect x="2" y="4" width="16" height="2" rx="1" />
    <rect x="8" y="9" width="10" height="2" rx="1" />
    <rect x="4" y="14" width="14" height="2" rx="1" />
  </svg>
)

const BlockquoteIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
    <rect x="2" y="4" width="2.5" height="12" rx="1.25" />
    <rect x="6" y="6" width="12" height="2" rx="1" />
    <rect x="6" y="10" width="10" height="2" rx="1" />
    <rect x="6" y="14" width="8" height="2" rx="1" />
  </svg>
)

// ─── Main Component ───────────────────────────────────────────────────────────

interface RichTextEditorProps {
  value?: string
  onChange?: (html: string) => void
  placeholder?: string
  minHeight?: number
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value = '',
  onChange,
  placeholder = '請輸入描述...',
  minHeight = 150,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
      TextStyle,
      Color,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange?.(html === '<p></p>' ? '' : html)
    },
    editorProps: {
      attributes: { style: `min-height: ${minHeight}px` },
    },
  })

  // Sync external value when it changes (e.g. form.reset() or async initial value)
  const lastSyncedRef = React.useRef(value)
  React.useEffect(() => {
    if (!editor) return
    if (value !== lastSyncedRef.current && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
      lastSyncedRef.current = value
    }
  }, [value, editor])

  if (!editor) return null

  const headingLevel = editor.isActive('heading', { level: 1 }) ? 'h1'
    : editor.isActive('heading', { level: 2 }) ? 'h2'
    : editor.isActive('heading', { level: 3 }) ? 'h3'
    : 'p'

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white transition-shadow focus-within:border-blue-400 focus-within:shadow-[0_0_0_2px_rgba(59,130,246,0.1)]">
      {/* ── Toolbar ── */}
      <div className="rte-toolbar flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50 flex-wrap">
        {/* Paragraph style */}
        <Select
          size="small"
          value={headingLevel}
          style={{ width: 80 }}
          options={[
            { value: 'p',  label: '正文' },
            { value: 'h1', label: '標題 1' },
            { value: 'h2', label: '標題 2' },
            { value: 'h3', label: '標題 3' },
          ]}
          onChange={(v) => {
            if (v === 'p') editor.chain().focus().setParagraph().run()
            else editor.chain().focus().toggleHeading({ level: parseInt(v[1]) as 1 | 2 | 3 }).run()
          }}
          onMouseDown={(e) => e.preventDefault()}
        />

        <Sep />

        {/* Bold */}
        <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="粗體 (Ctrl+B)">
          <span className="font-bold text-[13px] leading-none">B</span>
        </ToolBtn>

        {/* Italic */}
        <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜體 (Ctrl+I)">
          <span className="italic font-serif text-[14px] leading-none">I</span>
        </ToolBtn>

        {/* Underline */}
        <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="下劃線 (Ctrl+U)">
          <span className="underline text-[13px] leading-none">U</span>
        </ToolBtn>

        {/* Strikethrough */}
        <ToolBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="刪除線">
          <span className="line-through text-[13px] leading-none">S</span>
        </ToolBtn>

        {/* Inline code */}
        <ToolBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="行內代碼">
          <span className="font-mono text-[11px] leading-none">&lt;/&gt;</span>
        </ToolBtn>

        <Sep />

        {/* Bullet list */}
        <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="無序列表">
          <BulletListIcon />
        </ToolBtn>

        {/* Ordered list */}
        <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="有序列表">
          <OrderedListIcon />
        </ToolBtn>

        {/* Task list */}
        <ToolBtn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="任務清單">
          <TaskListIcon />
        </ToolBtn>

        <Sep />

        {/* Alignment */}
        <ToolBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="靠左對齊">
          <AlignLeftIcon />
        </ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="置中對齊">
          <AlignCenterIcon />
        </ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="靠右對齊">
          <AlignRightIcon />
        </ToolBtn>

        <Sep />

        {/* Highlight */}
        <ToolBtn active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="螢光標記">
          <span className="bg-yellow-200 px-0.5 text-[12px] leading-none rounded text-slate-700">A</span>
        </ToolBtn>

        {/* Blockquote */}
        <ToolBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="引用">
          <BlockquoteIcon />
        </ToolBtn>
      </div>

      {/* ── Editor area ── */}
      <EditorContent editor={editor} className="rte-content" />
    </div>
  )
}

export default RichTextEditor
