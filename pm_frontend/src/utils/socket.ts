import { io, Socket } from 'socket.io-client'
import { tokenStorage } from '@/api/httpClient'

// ─── Socket.IO Singleton ──────────────────────────────────────────────────────

let socket: Socket | null = null

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io('/', {
      auth: { token: tokenStorage.get() },
      transports: ['websocket', 'polling'],
      autoConnect: false,
    })

    socket.on('connect', () => {
      console.log('[Socket] connected:', socket?.id)
    })

    socket.on('disconnect', (reason) => {
      console.log('[Socket] disconnected:', reason)
    })

    socket.on('connect_error', (err) => {
      console.warn('[Socket] connection error:', err.message)
    })
  }
  return socket
}

export const connectSocket = (): void => {
  const s = getSocket()
  if (!s.connected) s.connect()
}

export const disconnectSocket = (): void => {
  socket?.disconnect()
  socket = null
}

// ─── Event helpers ────────────────────────────────────────────────────────────

/** Subscribe to a socket event; returns an unsubscribe function */
export const onSocketEvent = <T = unknown>(
  event: string,
  handler: (data: T) => void,
): (() => void) => {
  const s = getSocket()
  s.on(event, handler)
  return () => s.off(event, handler)
}

/** Emit a socket event */
export const emitSocketEvent = (event: string, data?: unknown): void => {
  getSocket().emit(event, data)
}
