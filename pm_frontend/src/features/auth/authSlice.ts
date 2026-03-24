import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'
import { authApi } from '@/api/auth.api'
import { tokenStorage, userStorage } from '@/api/httpClient'
import { LoginPayload, LoginContent, UserIndexContent } from '@/types/api.types'

interface AuthState {
  token:          string | null
  workNo:         string | null
  name:           string | null
  roleCode:       string | null
  roleName:       string | null
  isSupervisor:   boolean
  isAdmin:        boolean
  isManagerView:  boolean   // 主管视角开关（仅主管可切换）
  indexData:      UserIndexContent | null
  isLoading:      boolean
  error:          string | null
}

const _savedUser = userStorage.get()

const initialState: AuthState = {
  token:          tokenStorage.get(),
  workNo:         _savedUser?.workNo       ?? null,
  name:           _savedUser?.name         ?? null,
  roleCode:       _savedUser?.roleCode     ?? null,
  roleName:       _savedUser?.roleName     ?? null,
  isSupervisor:   _savedUser?.isSupervisor ?? false,
  isAdmin:        _savedUser?.isAdmin      ?? false,
  isManagerView:  _savedUser?.isSupervisor ?? false,
  indexData:      null,
  isLoading:      false,
  error:          null,
}

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const loginThunk = createAsyncThunk(
  'auth/login',
  async (payload: LoginPayload, { rejectWithValue }) => {
    try {
      const res = await authApi.login(payload)
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message || '登入失敗')
    }
  },
)

export const fetchIndexThunk = createAsyncThunk(
  'auth/fetchIndex',
  async (_, { rejectWithValue }) => {
    try {
      const res = await authApi.getIndex()
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

// ─── Slice ────────────────────────────────────────────────────────────────────

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.token         = null
      state.workNo        = null
      state.name          = null
      state.roleCode      = null
      state.roleName      = null
      state.isSupervisor  = false
      state.isAdmin       = false
      state.isManagerView = false
      tokenStorage.remove()
      userStorage.remove()
    },
    restoreSession(state, action: PayloadAction<{ workNo: string; name: string }>) {
      state.workNo = action.payload.workNo
      state.name   = action.payload.name
    },
    setManagerView(state, action: PayloadAction<boolean>) {
      state.isManagerView = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (state) => {
        state.isLoading = true
        state.error     = null
      })
      .addCase(loginThunk.fulfilled, (state, action: PayloadAction<LoginContent>) => {
        state.isLoading     = false
        state.token         = action.payload.access_token
        state.workNo        = action.payload.work_no
        state.name          = action.payload.name
        state.roleCode      = action.payload.role_code
        state.roleName      = action.payload.role_name
        state.isSupervisor  = action.payload.is_supervisor ?? false
        state.isAdmin       = action.payload.is_admin ?? false
        state.isManagerView = action.payload.is_supervisor ?? false
        tokenStorage.set(action.payload.access_token)
        userStorage.set({
          workNo:       action.payload.work_no,
          name:         action.payload.name,
          roleCode:     action.payload.role_code,
          roleName:     action.payload.role_name,
          isSupervisor: action.payload.is_supervisor ?? false,
          isAdmin:      action.payload.is_admin ?? false,
        })
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.isLoading = false
        state.error     = action.payload as string
      })
      .addCase(fetchIndexThunk.fulfilled, (state, action: PayloadAction<UserIndexContent>) => {
        state.indexData = action.payload
      })
  },
})

export const { logout, restoreSession, setManagerView } = authSlice.actions
export default authSlice.reducer
