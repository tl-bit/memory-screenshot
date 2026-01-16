import { useEffect, useState } from 'react'
import './Overlay.css'

export default function Overlay({ onConfirm, onCancel, onPointPicked }) {
  const [mode, setMode] = useState('crop') // 'crop' or 'pick'
  const [rect, setRect] = useState({ x: 120, y: 120, width: 360, height: 240 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Check if we are in pick mode based on URL hash or props (simplified: passed via props/main logic)
  // Actually, Main process controls the window. If we want a different mode, we can check a flag or just use the same window.
  // Let's use a query param or just simple logic: if onPointPicked is active, we might be in pick mode? 
  // But wait, the window is loaded with #/overlay. 
  // Let's just listen for a special click event if we are in 'picking' mode.
  // The Main process will tell us if we are picking.
  
  // Actually, easier way: 
  // When 'pickPoint' is called in Main, it opens this Overlay window.
  // We can pass a prop or use a URL param.
  // Let's assume we use URL hash: #/overlay?mode=pick
  
  useEffect(() => {
    if (window.location.hash.includes('mode=pick')) {
      setMode('pick')
    }
    
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const handleMouseDown = (e) => {
    if (mode === 'pick') {
      // Return screen coordinates
      // Since window is full screen transparent, clientX/Y are screen coordinates relative to this display
      onPointPicked({ x: e.screenX, y: e.screenY })
      return
    }
    
    e.stopPropagation()
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - rect.x,
      y: e.clientY - rect.y
    })
  }

  // ... rest of the code ...
  
  if (mode === 'pick') {
    return (
      <div 
        className="overlay-container pick-mode" 
        onMouseDown={handleMouseDown}
        style={{ cursor: 'crosshair', background: 'rgba(0,0,0,0.1)' }}
      >
        <div style={{ 
          position: 'fixed', 
          top: 20, 
          left: '50%', 
          transform: 'translateX(-50%)', 
          background: 'rgba(0,0,0,0.7)', 
          color: 'white', 
          padding: '8px 16px', 
          borderRadius: 4,
          pointerEvents: 'none'
        }}>
          请点击目标位置（ESC取消）
        </div>
      </div>
    )
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
