import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'
import { userApi, CreateUserPayload, QueryUsersParams } from '@/api/user.api'
import { UserProfile } from '@/types/api.types'

interface UserState {
  list:        UserProfile[]
  totalCount:  number
  departments: string[]
  current:     UserProfile | null
  isLoading:   boolean
  isSaving:    boolean
  error:       string | null
}

const initialState: UserState = {
  list:        [],
  totalCount:  0,
  departments: [],
  current:     null,
  isLoading:   false,
  isSaving:    false,
  error:       null,
}

export const fetchUserListThunk = createAsyncThunk(
  'user/fetchList',
  async (params: QueryUsersParams, { rejectWithValue }) => {
    try {
      const res = await userApi.list(params)
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

export const fetchDepartmentsThunk = createAsyncThunk(
  'user/fetchDepartments',
  async (_, { rejectWithValue }) => {
    try {
      const res = await userApi.departments()
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

export const createUserThunk = createAsyncThunk(
  'user/create',
  async (payload: CreateUserPayload, { rejectWithValue }) => {
    try {
      const res = await userApi.create(payload)
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

export const deleteUserThunk = createAsyncThunk(
  'user/delete',
  async (workNo: string, { rejectWithValue }) => {
    try {
      await userApi.delete(workNo)
      return workNo
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    clearCurrentUser(state) { state.current = null },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserListThunk.pending, (state) => { state.isLoading = true })
      .addCase(fetchUserListThunk.fulfilled, (state, action) => {
        state.isLoading = false
        const content = action.payload as { users?: UserProfile[]; total_count?: number }
        state.list      = content.users ?? []
        state.totalCount = content.total_count ?? 0
      })
      .addCase(fetchUserListThunk.rejected, (state, action) => {
        state.isLoading = false; state.error = action.payload as string
      })
      .addCase(fetchDepartmentsThunk.fulfilled, (state, action: PayloadAction<string[]>) => {
        state.departments = action.payload
      })
      .addCase(createUserThunk.pending, (state) => { state.isSaving = true })
      .addCase(createUserThunk.fulfilled, (state) => { state.isSaving = false })
      .addCase(createUserThunk.rejected, (state, action) => {
        state.isSaving = false; state.error = action.payload as string
      })
      .addCase(deleteUserThunk.fulfilled, (state, action: PayloadAction<string>) => {
        state.list = state.list.filter((u) => u.work_no !== action.payload)
      })
  },
})

export const { clearCurrentUser } = userSlice.actions
export default userSlice.reducer
