import React from 'react'
import { Dropdown } from 'antd'
import { useTranslation } from 'react-i18next'
import { GlobeAltIcon } from '@heroicons/react/24/outline'

const LANGS = [
  { key: 'zh', label: '繁體中文' },
  { key: 'zh-CN', label: '简体中文' },
  { key: 'en', label: 'English' },
  { key: 'th', label: 'ภาษาไทย' },
]

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation()

  return (
    <Dropdown
      menu={{
        items: LANGS.map((l) => ({
          key: l.key,
          label: l.label,
          onClick: () => i18n.changeLanguage(l.key),
          style: l.key === i18n.language ? { fontWeight: 600, color: '#2563eb' } : undefined,
        })),
      }}
      placement="bottomRight"
      trigger={['click']}
      arrow={false}
    >
      <button
        type="button"
        className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-50 transition-colors text-slate-500 border-0 outline-none bg-transparent cursor-pointer"
        title="Language"
      >
        <GlobeAltIcon className="w-[18px] h-[18px]" />
      </button>
    </Dropdown>
  )
}

export default LanguageSwitcher
