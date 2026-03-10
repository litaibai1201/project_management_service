import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

/**
 * Format an ISO date string as "YYYY-MM-DD"
 */
export const formatDate = (date?: string | null): string =>
  date ? dayjs(date).format('YYYY-MM-DD') : '—'

/**
 * Format an ISO datetime string as "YYYY-MM-DD HH:mm"
 */
export const formatDateTime = (date?: string | null): string =>
  date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '—'

/**
 * Relative time, e.g. "3 天前"
 */
export const fromNow = (date?: string | null): string =>
  date ? dayjs(date).fromNow() : '—'

/**
 * Split semicolon-separated work_no string into an array
 * e.g. "A001;A002;A003" → ["A001", "A002", "A003"]
 */
export const splitIds = (value?: string | null): string[] =>
  value ? value.split(';').filter(Boolean) : []

/**
 * Join array into semicolon-separated string
 */
export const joinIds = (values: string[]): string => values.join(';')
