import { useState, useEffect, useRef } from 'react'

export interface ParagraphEditEvent {
  chapterNumber: number
  paragraphNumber: number
  bookName: string
  timestamp: string
}

interface UseBookGeniusSSEOptions {
  bookName?: string
  onParagraphEdit?: (event: ParagraphEditEvent) => void
}

export const useBookGeniusSSE = (options: UseBookGeniusSSEOptions = {}) => {
  const { bookName = 'Romeo-And-Juliet-Small', onParagraphEdit } = options

  console.log('[SSE Hook] Initializing with book:', bookName)

  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const connect = () => {
    if (eventSourceRef.current) {
      console.log('[SSE] Already connected, skipping')
      return
    }

    const sseUrl = `http://localhost:3000/api/text-editor/sse/book-updates?book=${bookName}`
    console.log('[SSE] Attempting to connect to:', sseUrl)
    
    try {
      const eventSource = new EventSource(sseUrl)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setIsConnected(true)
        setConnectionError(null)
        console.log('[SSE] Connected to:', sseUrl)
        console.log('[SSE] Connection state:', eventSource.readyState)
      }

      eventSource.onmessage = (event) => {
        // Skip ping messages
        if (event.data === ':ping' || event.data.startsWith(':')) {
          return
        }

        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'external-app-trigger') {
            console.log('✅ Processing external-app-trigger event');

            console.log(`🎯 [EDITOR APP] Received edit trigger:`)
            console.log(`   📚 Book: ${data.bookName}`)
            console.log(`   📖 Chapter: ${data.chapterNumber}`)
            console.log(`   📄 Paragraph: ${data.paragraphNumber}`)
            console.log(`   ⏰ Timestamp: ${data.timestamp}`)
            console.log(`   📦 Full data:`, data)

            onParagraphEdit?.({
              chapterNumber: data.chapterNumber,
              paragraphNumber: data.paragraphNumber,
              bookName: data.bookName,
              timestamp: data.timestamp
            })
          }
        } catch (error) {
          // Ignore parsing errors for non-JSON messages
        }
      }

      eventSource.onerror = () => {
        setIsConnected(false)
        setConnectionError('Connection failed')
        eventSource.close()
        eventSourceRef.current = null
      }

    } catch (error) {
      setConnectionError('Failed to connect')
    }
  }

  const disconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
    setConnectionError(null)
  }

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [])

  return {
    isConnected,
    connectionError,
    connect,
    disconnect
  }
}