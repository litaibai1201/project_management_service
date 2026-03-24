import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { ApiResponse } from '@/types/api.types'
import { showToast } from '@/utils/toast'

// ─── Token Helpers ────────────────────────────────────────────────────────────

const TOKEN_KEY = 'pm_access_token'
const USER_KEY  = 'pm_user_info'

export const tokenStorage = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => { localStorage.setItem(TOKEN_KEY, token) },
  remove: (): void => { localStorage.removeItem(TOKEN_KEY) },
}

interface StoredUser {
  workNo:       string
  name:         string
  roleCode:     string | null
  roleName:     string | null
  isSupervisor: boolean
  isAdmin:      boolean
}

export const userStorage = {
  get: (): StoredUser | null => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? (JSON.parse(raw) as StoredUser) : null
    } catch {
      return null
    }
  },
  set: (user: StoredUser): void => { localStorage.setItem(USER_KEY, JSON.stringify(user)) },
  remove: (): void => { localStorage.removeItem(USER_KEY) },
}

// ─── Axios Singleton ──────────────────────────────────────────────────────────

const httpClient: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor — attach JWT token
httpClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.get()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Response interceptor — unwrap data, handle global errors
httpClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const { code, msg } = response.data
    // Backend uses code === 'S10000' for success, 'F10001' for failure
    if (code !== 'S10000' && code !== undefined) {
      showToast.error(msg || '請求失敗')
      return Promise.reject(new Error(msg))
    }
    return response
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      if (status === 401) {
        tokenStorage.remove()
        showToast.error('登入已過期，請重新登入')
        window.location.href = '/login'
      } else if (status === 403) {
        showToast.error('無此操作權限')
      } else if (status === 404) {
        showToast.error('請求的資源不存在')
      } else if (status >= 500) {
        showToast.error('伺服器錯誤，請稍後再試')
      }
    } else if (error.request) {
      showToast.error('網路連線異常，請檢查網路')
    }
    return Promise.reject(error)
  },
)

// ─── Typed Request Helpers ────────────────────────────────────────────────────

export const get = <T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
  httpClient.get<ApiResponse<T>>(url, config).then((r) => r.data)

export const post = <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
  httpClient.post<ApiResponse<T>>(url, data, config).then((r) => r.data)

export const put = <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
  httpClient.put<ApiResponse<T>>(url, data, config).then((r) => r.data)

export const del = <T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
  httpClient.delete<ApiResponse<T>>(url, config).then((r) => r.data)

export const postForm = <T>(url: string, formData: FormData): Promise<ApiResponse<T>> =>
  httpClient.post<ApiResponse<T>>(url, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)

/** PUT with multipart/form-data — used for update endpoints that expect PUT + form data */
export const putForm = <T>(url: string, formData: FormData): Promise<ApiResponse<T>> =>
  httpClient.put<ApiResponse<T>>(url, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)

export default httpClient
