import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'
import { authApi } from '@/api/auth.api'
import { tokenStorage } from '@/api/httpClient'
import { LoginPayload, LoginContent, UserIndexContent } from '@/types/api.types'

interface AuthState {
  token:       string | null
  workNo:      string | null
  name:        string | null
  indexData:   UserIndexContent | null
  isLoading:   boolean
  error:       string | null
}

const initialState: AuthState = {
  token:     tokenStorage.get(),
  workNo:    null,
  name:      null,
  indexData: null,
  isLoading: false,
  error:     null,
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
      state.token  = null
      state.workNo = null
      state.name   = null
      tokenStorage.remove()
    },
    restoreSession(state, action: PayloadAction<{ workNo: string; name: string }>) {
      state.workNo = action.payload.workNo
      state.name   = action.payload.name
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (state) => {
        state.isLoading = true
        state.error     = null
      })
      .addCase(loginThunk.fulfilled, (state, action: PayloadAction<LoginContent>) => {
        state.isLoading = false
        state.token     = action.payload.access_token
        state.workNo    = action.payload.work_no
        state.name      = action.payload.name
        tokenStorage.set(action.payload.access_token)
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

export const { logout, restoreSession } = authSlice.actions
export default authSlice.reducer
