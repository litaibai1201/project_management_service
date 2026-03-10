import { configureStore } from '@reduxjs/toolkit'
import authReducer from '@/features/auth/authSlice'
import projectReducer from '@/features/project/projectSlice'
import dutyReducer from '@/features/duty/dutySlice'
import userReducer from '@/features/user/userSlice'

export const store = configureStore({
  reducer: {
    auth:    authReducer,
    project: projectReducer,
    duty:    dutyReducer,
    user:    userReducer,
  },
})

export type RootState    = ReturnType<typeof store.getState>
export type AppDispatch  = typeof store.dispatch
