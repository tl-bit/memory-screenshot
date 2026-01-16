import { useEffect, useState } from 'react'
import './Overlay.css'

export default function Overlay({ onConfirm, onCancel }) {
  const [rect, setRect] = useState({ x: 120, y: 120, width: 360, height: 240 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleMouseDown = (e) => {
    e.stopPropagation()
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - rect.x,
      y: e.clientY - rect.y
    })
  }

  const handleResizeDown = (e) => {
    e.stopPropagation()
    setIsResizing(true)
  }

  const handleMouseMove = (e) => {
    if (isDragging) {
      setRect(prev => ({
        ...prev,
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      }))
    } else if (isResizing) {
      setRect(prev => ({
        ...prev,
        width: Math.max(50, e.clientX - prev.x),
        height: Math.max(50, e.clientY - prev.y)
      }))
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsResizing(false)
  }

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [isDragging, isResizing])

  useEffect(() => {
    ;(async () => {
      try {
        const last = await window.electronAPI?.getLastRect?.()
        if (last && typeof last.x === 'number') {
          setRect({
            x: last.x,
            y: last.y,
            width: last.width,
            height: last.height
          })
        }
      } catch {
        // ignore
      }
    })()
  }, [])

  const handleConfirm = (e) => {
    e.stopPropagation()
    if (isSubmitting) return
    setIsSubmitting(true)
    requestAnimationFrame(() => onConfirm(rect))
  }

  return (
    <div className="overlay-container" style={{ opacity: isSubmitting ? 0 : 1 }}>
      <div 
        className="crop-box"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="resize-handle se" onMouseDown={handleResizeDown} />
        
        <div className="action-bar">
          <button className="action-btn btn-confirm" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? '处理中...' : '确定'}
          </button>
          <button className="action-btn btn-cancel" onClick={onCancel} disabled={isSubmitting}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
