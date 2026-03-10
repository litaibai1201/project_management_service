import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'
import { projectApi } from '@/api/project.api'
import {
  Project,
  ProjectListItem,
  ProjectListQuery,
  CreateProjectPayload,
  ProjectGroup,
} from '@/types/api.types'

interface ProjectState {
  list:         ProjectListItem[]
  totalCount:   number
  totalPage:    number
  current:      Project | null
  groups:       ProjectGroup[]
  isLoading:    boolean
  isSaving:     boolean
  error:        string | null
  query:        ProjectListQuery
}

const initialState: ProjectState = {
  list:       [],
  totalCount: 0,
  totalPage:  0,
  current:    null,
  groups:     [],
  isLoading:  false,
  isSaving:   false,
  error:      null,
  query:      { page: 1, size: 10 },
}

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const fetchProjectListThunk = createAsyncThunk(
  'project/fetchList',
  async (query: ProjectListQuery, { rejectWithValue }) => {
    try {
      const res = await projectApi.list(query)
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

export const fetchProjectThunk = createAsyncThunk(
  'project/fetchOne',
  async (id: string, { rejectWithValue }) => {
    try {
      const res = await projectApi.get(id)
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

export const createProjectThunk = createAsyncThunk(
  'project/create',
  async ({ payload, files }: { payload: CreateProjectPayload; files?: Record<string, File[]> }, { rejectWithValue }) => {
    try {
      const res = await projectApi.create(payload, files)
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

export const deleteProjectThunk = createAsyncThunk(
  'project/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await projectApi.delete(id)
      return id
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

export const fetchProjectGroupsThunk = createAsyncThunk(
  'project/fetchGroups',
  async (_, { rejectWithValue }) => {
    try {
      const res = await projectApi.groups()
      return res.content
    } catch (err: unknown) {
      return rejectWithValue((err as Error).message)
    }
  },
)

// ─── Slice ────────────────────────────────────────────────────────────────────

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    setQuery(state, action: PayloadAction<Partial<ProjectListQuery>>) {
      state.query = { ...state.query, ...action.payload }
    },
    clearCurrent(state) {
      state.current = null
    },
  },
  extraReducers: (builder) => {
    builder
      // List
      .addCase(fetchProjectListThunk.pending, (state) => {
        state.isLoading = true; state.error = null
      })
      .addCase(fetchProjectListThunk.fulfilled, (state, action) => {
        state.isLoading  = false
        state.list       = ((action.payload.project_list ?? action.payload.data_list) as ProjectListItem[]) || []
        state.totalCount = action.payload.total_count
        state.totalPage  = action.payload.total_page
      })
      .addCase(fetchProjectListThunk.rejected, (state, action) => {
        state.isLoading = false; state.error = action.payload as string
      })
      // Detail
      .addCase(fetchProjectThunk.pending, (state) => { state.isLoading = true })
      .addCase(fetchProjectThunk.fulfilled, (state, action: PayloadAction<Project>) => {
        state.isLoading = false; state.current = action.payload
      })
      .addCase(fetchProjectThunk.rejected, (state, action) => {
        state.isLoading = false; state.error = action.payload as string
      })
      // Create
      .addCase(createProjectThunk.pending, (state) => { state.isSaving = true })
      .addCase(createProjectThunk.fulfilled, (state) => { state.isSaving = false })
      .addCase(createProjectThunk.rejected, (state, action) => {
        state.isSaving = false; state.error = action.payload as string
      })
      // Delete
      .addCase(deleteProjectThunk.fulfilled, (state, action: PayloadAction<string>) => {
        state.list = state.list.filter((p) => p.id !== action.payload)
      })
      // Groups
      .addCase(fetchProjectGroupsThunk.fulfilled, (state, action: PayloadAction<ProjectGroup[]>) => {
        state.groups = action.payload
      })
  },
})

export const { setQuery, clearCurrent } = projectSlice.actions
export default projectSlice.reducer
