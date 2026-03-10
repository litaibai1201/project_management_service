import { message } from 'antd'

// ─── Global toast helpers ─────────────────────────────────────────────────────
// Usage: showToast.success('操作成功')  /  showToast.error('操作失敗')

export const showToast = {
  success: (msg: string, duration = 2) => message.success(msg, duration),
  error:   (msg: string, duration = 3) => message.error(msg, duration),
  warning: (msg: string, duration = 3) => message.warning(msg, duration),
  info:    (msg: string, duration = 2) => message.info(msg, duration),
  loading: (msg = '處理中...', duration = 0) => message.loading(msg, duration),
}
