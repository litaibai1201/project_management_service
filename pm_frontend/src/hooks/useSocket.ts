import { useEffect, useRef } from 'react'
import { connectSocket, disconnectSocket, onSocketEvent } from '@/utils/socket'
import { useAppSelector } from './redux'

/**
 * Connects Socket.IO when the user is authenticated, and disconnects on logout.
 * Call this once at the top of the app (e.g. AppLayout).
 */
export const useSocketConnection = (): void => {
  const token = useAppSelector((s) => s.auth.token)

  useEffect(() => {
    if (token) {
      connectSocket()
    } else {
      disconnectSocket()
    }
    return () => {
      // Intentionally do NOT disconnect on every re-render; only on logout
    }
  }, [token])
}

/**
 * Subscribe to a socket event and automatically clean up on unmount.
 *
 * @example
 * useSocketEvent<ProgressUpdate>('progress_updated', (data) => {
 *   dispatch(updateProgress(data))
 * })
 */
export const useSocketEvent = <T = unknown>(
  event: string,
  handler: (data: T) => void,
): void => {
  // Keep handler ref stable so we don't re-subscribe on every render
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const unsubscribe = onSocketEvent<T>(event, (data) => handlerRef.current(data))
    return unsubscribe
  }, [event])
}
