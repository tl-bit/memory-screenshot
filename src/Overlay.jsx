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
    // Check if we're in pick mode - check both hash and search params
    const hash = window.location.hash || ''
    const search = window.location.search || ''
    const isPickMode = hash.includes('mode=pick') || search.includes('mode=pick')
    
    console.log('[Overlay] Checking mode - hash:', hash, 'search:', search, 'isPickMode:', isPickMode)
    
    if (isPickMode) {
      console.log('[Overlay] Setting mode to pick')
      setMode('pick')
    } else {
      console.log('[Overlay] Setting mode to crop')
      setMode('crop')
    }
  }, []) // Run only once on mount
  
  useEffect(() => {
    // Set up ESC key handler with capture phase for reliable event handling
    const onKeyDown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        if (onCancel) {
          onCancel()
        }
        return false
      }
    }
    
    // Add event listener to window with capture phase to intercept early
    // This ensures ESC is caught before any other handlers
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onCancel, mode])

  const handleMouseDown = (e) => {
    if (mode === 'pick') {
      console.log('[Overlay] Pick mode click detected at screen:', e.screenX, e.screenY)
      // In pick mode, capture screen coordinates and send to main process
      if (onPointPicked) {
        console.log('[Overlay] Calling onPointPicked with:', { x: e.screenX, y: e.screenY })
        onPointPicked({ x: e.screenX, y: e.screenY })
      } else {
        console.error('[Overlay] onPointPicked callback is not defined!')
      }
      return
    }
    
    e.stopPropagation()
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - rect.x,
      y: e.clientY - rect.y
    })
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

  // Mouse event listeners for crop mode
  useEffect(() => {
    if (mode === 'crop') {
      window.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('mousemove', handleMouseMove)
      return () => {
        window.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('mousemove', handleMouseMove)
      }
    }
  }, [mode, isDragging, isResizing, dragOffset, rect])

  // Load last rect for crop mode
  useEffect(() => {
    if (mode === 'crop') {
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
    }
  }, [mode])

  const handleResizeDown = (e) => {
    e.stopPropagation()
    setIsResizing(true)
  }

  const handleConfirm = (e) => {
    e.stopPropagation()
    if (isSubmitting) return
    setIsSubmitting(true)
    requestAnimationFrame(() => onConfirm(rect))
  }

  // Render pick mode
  if (mode === 'pick') {
    console.log('[Overlay] Rendering pick mode')
    return (
      <div 
        className="overlay-container pick-mode" 
        onMouseDown={handleMouseDown}
      >
        {/* Large center prompt with improved styling */}
        <div className="pick-mode-prompt">
          <div className="pick-mode-prompt-icon">🖱️</div>
          <div className="pick-mode-prompt-title">请点击目标位置</div>
          <div className="pick-mode-prompt-hint">按 ESC 键取消</div>
        </div>
        
        {/* Top bar hint with improved styling */}
        <div className="pick-mode-top-hint">
          点击屏幕上任意位置设置窗口焦点位置
        </div>
      </div>
    )
  }

  // Render crop mode
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
