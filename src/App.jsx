import { useEffect, useMemo, useState, useRef } from 'react'
import './App.css'
import Overlay from './Overlay'

function App() {
  const [route, setRoute] = useState(window.location.hash || '#/')
  const isOverlay = useMemo(() => route === '#/overlay', [route])
  const hasElectronApi = typeof window !== 'undefined' && !!window.electronAPI
  const [statusText, setStatusText] = useState('')
  const [statusType, setStatusType] = useState('') // success, warning, error
  const timerRef = useRef(null)

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', onHashChange)
    document.body.classList.toggle('overlay-mode', isOverlay)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [isOverlay])

  useEffect(() => {
    if (!hasElectronApi) return
    const off = window.electronAPI.onStatus?.((s) => {
      // Clear existing timer if any
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      if (s === 'capturing') {
        setStatusText('处理中...')
        setStatusType('')
      }
      else if (s === 'copied') {
        setStatusText('复制成功')
        setStatusType('success')
      }
      else if (s === 'copy_failed') {
        setStatusText('复制失败')
        setStatusType('error')
      }
      else if (s === 'cancelled') {
        setStatusText('取消')
        setStatusType('warning')
      }
      else {
        setStatusText('')
        setStatusType('')
      }
      
      if (['copied', 'copy_failed', 'cancelled'].includes(s)) {
        timerRef.current = setTimeout(() => {
          setStatusText('')
          timerRef.current = null
        }, 2000)
      }
    })
    return () => {
      off?.()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [hasElectronApi])

  if (isOverlay) {
    return (
      <Overlay
        onConfirm={(rect) => window.electronAPI?.captureRegion?.(rect)}
        onCancel={() => window.electronAPI?.closeOverlay?.()}
      />
    )
  }

  return (
    <div className="container">
      <button
        className="start-btn"
        onClick={() => window.electronAPI?.openOverlay?.()}
        disabled={!hasElectronApi}
      >
        开始
      </button>
      <div className="hint">
        {!hasElectronApi
          ? '请从桌面端打开本工具（不要直接用浏览器访问）。'
          : '点击开始后，拖动/缩放裁剪框，点确定截图。'}
      </div>
      {!!statusText && <div className={`toast ${statusType}`}>{statusText}</div>}
    </div>
  )
}

export default App
