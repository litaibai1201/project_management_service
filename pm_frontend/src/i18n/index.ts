import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-tw'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/th'
import zh from './locales/zh.json'
import zhCN from './locales/zh-CN.json'
import en from './locales/en.json'
import th from './locales/th.json'

// Map i18n language to dayjs locale
const DAYJS_LOCALE: Record<string, string> = {
  zh: 'zh-tw',
  'zh-CN': 'zh-cn',
  en: 'en',
  th: 'th',
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      'zh-CN': { translation: zhCN },
      en: { translation: en },
      th: { translation: th },
    },
    fallbackLng: 'zh',
    supportedLngs: ['zh', 'zh-CN', 'en', 'th'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18n_lang',
    },
    interpolation: {
      escapeValue: false,
    },
  })

// Sync dayjs locale when i18n language changes
const syncDayjsLocale = (lng: string) => {
  dayjs.locale(DAYJS_LOCALE[lng] ?? 'en')
}
syncDayjsLocale(i18n.language)
i18n.on('languageChanged', syncDayjsLocale)

export default i18n
