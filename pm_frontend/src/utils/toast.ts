import type { MessageInstance } from 'antd/es/message/interface'

// ─── Global toast helpers ─────────────────────────────────────────────────────
// Usage: showToast.success('操作成功')  /  showToast.error('操作失敗')

let messageApi: MessageInstance | null = null

/** Called once from ToastHolder to inject the App-context message instance */
export function setMessageApi(api: MessageInstance) {
  messageApi = api
}

export const showToast = {
  success: (msg: string, duration = 2) => messageApi?.success(msg, duration),
  error:   (msg: string, duration = 3) => messageApi?.error(msg, duration),
  warning: (msg: string, duration = 3) => messageApi?.warning(msg, duration),
  info:    (msg: string, duration = 2) => messageApi?.info(msg, duration),
  loading: (msg = '處理中...', duration = 0) => messageApi?.loading(msg, duration),
}
