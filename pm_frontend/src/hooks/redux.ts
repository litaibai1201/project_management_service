import { useDispatch, useSelector } from 'react-redux'
import type { RootState, AppDispatch } from '@/app/store'

// Typed hooks — use these throughout the app instead of plain hooks
export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector = <T>(selector: (state: RootState) => T): T =>
  useSelector(selector)
