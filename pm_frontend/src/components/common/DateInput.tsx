import React from 'react'
import { DatePicker } from 'antd'
import type { DatePickerProps } from 'antd'
import dayjs from 'dayjs'

/**
 * Drop-in replacement for <Input type="date" />.
 * Bridges Ant Design DatePicker (dayjs) ↔ Form string values (YYYY-MM-DD).
 * Respects ConfigProvider locale so "年/月/日" only shows in Chinese mode.
 */
const DateInput: React.FC<
  Omit<DatePickerProps, 'value' | 'onChange'> & {
    value?: string
    onChange?: (value: string) => void
  }
> = ({ value, onChange, ...rest }) => (
  <DatePicker
    value={value ? dayjs(value) : undefined}
    onChange={(d) => onChange?.(d ? d.format('YYYY-MM-DD') : '')}
    style={{ width: '100%' }}
    {...rest}
  />
)

export default DateInput
