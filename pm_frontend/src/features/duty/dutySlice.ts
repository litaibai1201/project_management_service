import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'
import { dutyApi } from '@/api/duty.api'
import { TemporaryDuty, CreateDutyPayload, DutyListQuery, PaginatedContent } from '@/types/api.types'

interface DutyState {
  list:       TemporaryDuty[]
  totalCount: number
  totalPage:  number
  current:    TemporaryDuty | null
  isLoading:  boolean
  isSaving:   boolean
  error:      string | null
  query:      DutyListQuery
}

const initialState: DutyState = {
  list:       [],
  totalCount: 0,
  totalPage:  0,
  current:    null,
  isLoading:  false,
  isSaving:   false,
  error:      null,
  query:      { page: 1, size: 200 },
}

export const fetchDutyListThunk = createAsyncThunk(
  'duty/fetchList',
  async (query: DutyListQuery, { rejectWithValue }) => {
    try {
      const res = await dutyApi.list(query)
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

export const fetchDutyThunk = createAsyncThunk(
  'duty/fetchOne',
  async (id: string, { rejectWithValue }) => {
    try {
      const res = await dutyApi.get(id)
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

export const createDutyThunk = createAsyncThunk(
  'duty/create',
  async ({ payload, files }: { payload: CreateDutyPayload; files?: Record<string, File[]> }, { rejectWithValue }) => {
    try {
      const res = await dutyApi.create(payload, files)
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

export const deleteDutyThunk = createAsyncThunk(
  'duty/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await dutyApi.delete(id)
      return id
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

const dutySlice = createSlice({
  name: 'duty',
  initialState,
  reducers: {
    setDutyQuery(state, action: PayloadAction<Partial<DutyListQuery>>) {
      state.query = { ...state.query, ...action.payload }
    },
    clearCurrentDuty(state) {
      state.current = null
    },
    silentUpdateList(state, action: PayloadAction<PaginatedContent<TemporaryDuty>>) {
      const content = action.payload
      state.list       = (Array.isArray(content?.data_list) ? content.data_list : []) as TemporaryDuty[]
      state.totalCount = content?.total_count ?? 0
      state.totalPage  = content?.total_page ?? 0
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDutyListThunk.pending, (state) => { state.isLoading = true; state.error = null })
      .addCase(fetchDutyListThunk.fulfilled, (state, action: PayloadAction<PaginatedContent<TemporaryDuty>>) => {
        state.isLoading  = false
        const content    = action.payload
        state.list       = (Array.isArray(content?.data_list) ? content.data_list : []) as TemporaryDuty[]
        state.totalCount = content?.total_count ?? 0
        state.totalPage  = content?.total_page ?? 0
      })
      .addCase(fetchDutyListThunk.rejected, (state, action) => {
        state.isLoading = false; state.error = action.payload as string
      })
      .addCase(fetchDutyThunk.pending, (state) => { state.isLoading = true })
      .addCase(fetchDutyThunk.fulfilled, (state, action: PayloadAction<TemporaryDuty>) => {
        state.isLoading = false; state.current = action.payload
      })
      .addCase(fetchDutyThunk.rejected, (state, action) => {
        state.isLoading = false; state.error = action.payload as string
      })
      .addCase(createDutyThunk.pending, (state) => { state.isSaving = true })
      .addCase(createDutyThunk.fulfilled, (state) => { state.isSaving = false })
      .addCase(createDutyThunk.rejected, (state, action) => {
        state.isSaving = false; state.error = action.payload as string
      })
      .addCase(deleteDutyThunk.fulfilled, (state, action: PayloadAction<string>) => {
        state.list = state.list.filter((d) => d.id !== action.payload)
      })
  },
})

export const { setDutyQuery, clearCurrentDuty, silentUpdateList } = dutySlice.actions
export default dutySlice.reducer
