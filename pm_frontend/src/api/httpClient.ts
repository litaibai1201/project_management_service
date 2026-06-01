import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig, AxiosError } from 'axios'
import { ApiResponse } from '@/types/api.types'
import { showToast } from '@/utils/toast'
import i18n from '@/i18n'

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
      if (!(response.config as InternalAxiosRequestConfig & { skipErrorToast?: boolean }).skipErrorToast) {
        showToast.error(msg || i18n.t('http.requestFailed'))
      }
      return Promise.reject(new Error(msg))
    }
    return response
  },
  (error: AxiosError<{ msg?: string; message?: string }>) => {
    const silent = (error.config as (InternalAxiosRequestConfig & { skipErrorToast?: boolean }) | undefined)?.skipErrorToast
    // Extract backend error message from response body
    const serverMsg = error.response?.data?.msg || error.response?.data?.message || ''
    if (error.response) {
      const status = error.response.status
      if (status === 401) {
        tokenStorage.remove()
        showToast.error(serverMsg || i18n.t('http.sessionExpired'))
        window.location.href = '/login'
      } else if (!silent) {
        if (status === 400) {
          showToast.error(serverMsg || i18n.t('http.badRequest'))
        } else if (status === 403) {
          showToast.error(serverMsg || i18n.t('http.forbidden'))
        } else if (status === 404) {
          showToast.error(serverMsg || i18n.t('http.notFound'))
        } else if (status >= 500) {
          showToast.error(serverMsg || i18n.t('http.serverError'))
        }
      }
    } else if (error.request && !silent) {
      showToast.error(i18n.t('http.networkError'))
    }
    // Pass server message so callers can display it
    return Promise.reject(new Error(serverMsg || error.message))
  },
)

// ─── Typed Request Helpers ────────────────────────────────────────────────────

export const get = <T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
  httpClient.get<ApiResponse<T>>(url, config).then((r) => r.data)

/** Same as get but suppresses all global error toasts — caller handles errors silently */
export const getSilent = <T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
  httpClient.get<ApiResponse<T>>(url, { ...config, skipErrorToast: true } as AxiosRequestConfig).then((r) => r.data)

export const post = <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
  httpClient.post<ApiResponse<T>>(url, data, config).then((r) => r.data)

export const put = <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
  httpClient.put<ApiResponse<T>>(url, data, config).then((r) => r.data)

export const patch = <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
  httpClient.patch<ApiResponse<T>>(url, data, config).then((r) => r.data)

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

/** Fetch a protected binary resource and return a Blob — bypasses JSON interceptor */
export const fetchBlob = async (url: string): Promise<Blob> => {
  const response = await httpClient.get(url, {
    responseType: 'blob',
    transformResponse: [(data) => data],
  })
  return response.data as Blob
}

/** Fetch a protected text resource — bypasses JSON interceptor */
export const fetchText = async (url: string): Promise<string> => {
  const response = await httpClient.get(url, {
    responseType: 'text',
    transformResponse: [(data) => data],
  })
  return response.data as string
}

export default httpClient
