# 專案管理系統 — 前端

基於 React 18 + TypeScript + Vite 的企業級專案管理前端。

---

## 技術棧

| 類別 | 套件 |
|------|------|
| 框架 | React 18 + TypeScript (strict) |
| 建置 | Vite 5 |
| UI | Ant Design 5.x + Tailwind CSS + @heroicons/react |
| 狀態管理 | Redux Toolkit + react-redux |
| 路由 | React Router v6 |
| HTTP | Axios（單例 httpClient，ApiResponse\<T> 包裝） |
| 表單 | React Hook Form + Zod |
| 即時通訊 | Socket.IO Client |
| 日期 | dayjs |

---

## 目錄結構

```
src/
├── api/                    # API 層（每個後端 Blueprint 一個文件）
│   ├── httpClient.ts       # Axios 單例，token 注入，全域錯誤攔截
│   ├── auth.api.ts
│   ├── project.api.ts
│   ├── duty.api.ts
│   ├── user.api.ts
│   ├── group.api.ts
│   └── search.api.ts
├── app/
│   └── store.ts            # Redux store 設定
├── components/
│   ├── common/
│   │   └── AppLayout.tsx   # 側邊欄 + Header 佈局
│   └── ui/                 # 通用 UI 元件
│       ├── StatusTag.tsx
│       ├── PageHeader.tsx
│       └── EmptyState.tsx
├── features/               # 業務模組（每個模組：slice + pages + components）
│   ├── auth/               # 登入、儀表板、PrivateRoute
│   ├── project/            # 專案列表、詳情、建立、功能任務、審核
│   ├── duty/               # AR列表、詳情
│   ├── user/               # 用戶管理
│   ├── group/              # 成員管理
│   └── search/             # 全局搜索
├── hooks/
│   ├── redux.ts            # useAppDispatch / useAppSelector
│   ├── useSocket.ts        # useSocketConnection / useSocketEvent
├── router/
│   └── index.tsx           # React Router v6 路由定義
├── types/
│   └── api.types.ts        # 所有接口 TypeScript 型別
└── utils/
    ├── toast.ts            # showToast.success/error/warning/info
    ├── status.ts           # 狀態/優先級 mapping + render 函式
    ├── format.ts           # formatDate, splitIds 等工具
    └── socket.ts           # Socket.IO 單例管理
```

---

## 快速開始

### 1. 安裝依賴

```bash
cd pm_frontend
npm install
```

### 2. 啟動開發服務器

```bash
npm run dev
```

> 預設監聽 http://localhost:3000
> Vite proxy 已設定將 `/api` 請求轉發至 `http://localhost:5000`（後端）

### 3. 打包生產版本

```bash
npm run build
```

---

## 環境配置

如需修改後端 API 地址，編輯 `vite.config.ts` 中的 proxy：

```ts
proxy: {
  '/api': {
    target: 'http://your-backend-host:5000',
    changeOrigin: true,
  },
},
```

---

## 核心設計模式

### API 呼叫
```ts
// 每個 API 都返回 ApiResponse<T>
const res = await projectApi.list({ page: 1 })
// res.content 是強型別資料
```

### Redux 狀態
```ts
// 使用類型安全的自定義 hooks
const dispatch = useAppDispatch()
const { list, isLoading } = useAppSelector((s) => s.project)
```

### 表單驗證
```ts
// React Hook Form + Zod schema
const { control, handleSubmit } = useForm<FormValues>({
  resolver: zodResolver(schema),
})
```

### 即時通訊
```ts
// 訂閱 Socket 事件，自動在 unmount 時取消
useSocketEvent<ProgressData>('progress_updated', (data) => {
  // 更新 UI
})
```

### 錯誤處理
- HTTP 401 → 自動清除 token，跳轉 /login
- HTTP 403/404/500 → 全域 `showToast.error()`
- 業務錯誤碼（`code !== '0'`）→ showToast.error(msg)
- 元件層 catch → `showToast.error()`

---

## 路由結構

| 路徑 | 頁面 | 需要登入 |
|------|------|--------|
| `/login` | 登入頁 | ✗ |
| `/` | 儀表板 | ✓ |
| `/projects` | 專案列表 | ✓ |
| `/projects/:id` | 專案詳情 | ✓ |
| `/review` | 審核管理 | ✓ |
| `/duties` | AR列表 | ✓ |
| `/duties/:id` | 任務詳情 | ✓ |
| `/users` | 用戶管理 | ✓ |
| `/members` | 成員管理 | ✓ |
| `/search` | 全局搜索 | ✓ |
