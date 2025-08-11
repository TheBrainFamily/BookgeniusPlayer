interface ParagraphEditEvent {
  chapterNumber: number
  paragraphNumber: number
  timestamp: string
}

interface SSEStatusBarProps {
  isConnected: boolean
  connectionError: string | null
  lastParagraphEdit: ParagraphEditEvent | null
  onReconnect: () => void
  onDisconnect: () => void
}

export const SSEStatusBar = ({ 
  isConnected, 
  connectionError, 
  lastParagraphEdit, 
  onReconnect, 
  onDisconnect 
}: SSEStatusBarProps) => {
  return (
    <div className="sse-status-bar">
      <div className="sse-connection-status">
        <div className={`sse-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          <span className="sse-dot"></span>
          <span className="sse-text">
            {isConnected ? 'Connected to BookGenius' : 'Disconnected'}
          </span>
        </div>
        
        {connectionError && (
          <div className="sse-error">
            Error: {connectionError}
          </div>
        )}
        
        <div className="sse-controls">
          {isConnected ? (
            <button className="sse-button disconnect" onClick={onDisconnect}>
              Disconnect
            </button>
          ) : (
            <button className="sse-button connect" onClick={onReconnect}>
              Reconnect
            </button>
          )}
        </div>
      </div>

      {lastParagraphEdit && (
        <div className="sse-last-edit">
          <div className="sse-edit-info">
            <span className="sse-edit-label">Last Edit:</span>
            <span className="sse-edit-details">
              Chapter {lastParagraphEdit.chapterNumber}, Paragraph {lastParagraphEdit.paragraphNumber}
            </span>
            <span className="sse-edit-time">
              {new Date(lastParagraphEdit.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}