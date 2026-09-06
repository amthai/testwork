export type RealtimeProvider = 'mock' | 'openai'

export type RealtimeEvent =
  | { type: 'connected' }
  | { type: 'assistant'; text: string }
  | { type: 'disconnected' }

export interface RealtimeTransport {
  connect(): Promise<void>
  disconnect(): void
  onEvent(listener: (event: RealtimeEvent) => void): () => void
}

/**
 * The browser media layer is already real in this MVP. This transport keeps
 * the voice provider behind one seam so the OpenAI Realtime WebRTC adapter can
 * replace it without changing the call UI when credentials are available.
 */
export class MockRealtimeTransport implements RealtimeTransport {
  private listeners = new Set<(event: RealtimeEvent) => void>()

  async connect() {
    this.emit({ type: 'connected' })
  }

  disconnect() {
    this.emit({ type: 'disconnected' })
  }

  onEvent(listener: (event: RealtimeEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  speak(text: string) {
    this.emit({ type: 'assistant', text })
  }

  private emit(event: RealtimeEvent) {
    this.listeners.forEach((listener) => listener(event))
  }
}

export function createRealtimeTransport(): MockRealtimeTransport {
  return new MockRealtimeTransport()
}
