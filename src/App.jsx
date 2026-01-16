import { useEffect, useMemo, useState, useRef } from 'react'
import './App.css'
import Overlay from './Overlay'

function App() {
  const [route, setRoute] = useState(window.location.hash || '#/')
  const isOverlay = useMemo(() => route.startsWith('#/overlay'), [route])
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

  const [mode, setMode] = useState('manual') // 'manual' or 'batch'
  const [batchConfig, setBatchConfig] = useState({
    loopCount: 10,
    sourcePos: null, // {x, y}
    targetPos: null  // {x, y}
  })
  const [isRunning, setIsRunning] = useState(false)
  
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
      else if (s.startsWith('batch-progress:')) {
        const [_, current, total] = s.split(':')
        setStatusText(`进度: ${current} / ${total}`)
        setStatusType('')
        // Do not auto-hide progress
        return
      }
      else if (s === 'batch-complete') {
        setStatusText('批量操作完成')
        setStatusType('success')
        setIsRunning(false)
      }
      else if (s === 'batch-stopped') {
        setStatusText('批量操作已停止')
        setStatusType('warning')
        setIsRunning(false)
      }
      else {
        setStatusText('')
        setStatusType('')
      }
      
      if (['copied', 'copy_failed', 'cancelled', 'batch-complete', 'batch-stopped'].includes(s)) {
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

  const handlePickPoint = async (type) => {
    try {
      const pos = await window.electronAPI?.pickPoint?.()
      if (pos) {
        setBatchConfig(prev => ({ ...prev, [type]: pos }))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleStartBatch = () => {
    if (!batchConfig.sourcePos || !batchConfig.targetPos) {
      setStatusText('请先设置左右窗口焦点位置')
      setStatusType('error')
      setTimeout(() => setStatusText(''), 2000)
      return
    }
    setIsRunning(true)
    window.electronAPI?.startBatch?.(batchConfig)
  }

  const handleStopBatch = () => {
    window.electronAPI?.stopBatch?.()
  }

  if (isOverlay) {
    return (
      <Overlay
        onConfirm={(rect) => window.electronAPI?.captureRegion?.(rect)}
        onCancel={() => window.electronAPI?.closeOverlay?.()}
        onPointPicked={(pos) => window.electronAPI?.pointPicked?.(pos)}
      />
    )
  }

  return (
    <div className="container">
      <div className="mode-switch">
        <button 
          className={`mode-btn ${mode === 'manual' ? 'active' : ''}`}
          onClick={() => setMode('manual')}
        >
          单次截图
        </button>
        <button 
          className={`mode-btn ${mode === 'batch' ? 'active' : ''}`}
          onClick={() => setMode('batch')}
        >
          批量自动化
        </button>
      </div>

      {mode === 'manual' ? (
        <>
          <button
            className="start-btn"
            onClick={() => window.electronAPI?.openOverlay?.()}
            disabled={!hasElectronApi}
          >
            开始截图
          </button>
          <div className="hint">
            {!hasElectronApi
              ? '请从桌面端打开本工具（不要直接用浏览器访问）。'
              : '点击开始后，拖动/缩放裁剪框，点确定截图。'}
          </div>
        </>
      ) : (
        <div className="batch-panel">
          <div className="config-row">
            <label>循环次数：</label>
            <input 
              type="number" 
              value={batchConfig.loopCount}
              onChange={(e) => setBatchConfig(prev => ({...prev, loopCount: parseInt(e.target.value) || 0}))}
              className="count-input"
            />
          </div>
          <div className="config-row">
            <button className="pick-btn" onClick={() => handlePickPoint('sourcePos')}>
              {batchConfig.sourcePos ? `右源窗口 (OK)` : '设置右源窗口位置'}
            </button>
            <button className="pick-btn" onClick={() => handlePickPoint('targetPos')}>
              {batchConfig.targetPos ? `左目标窗口 (OK)` : '设置左目标窗口位置'}
            </button>
          </div>
          
          <div className="action-row">
            {!isRunning ? (
              <button 
                className="start-btn batch-start"
                onClick={handleStartBatch}
                disabled={!hasElectronApi}
              >
                开始执行
              </button>
            ) : (
              <button 
                className="start-btn batch-stop"
                onClick={handleStopBatch}
              >
                停止 (ESC)
              </button>
            )}
          </div>
          <div className="hint">
            先设置截图区域（在单次模式），再设置左右窗口位置，最后开始。
          </div>
        </div>
      )}

      {!!statusText && <div className={`toast ${statusType}`}>{statusText}</div>}
    </div>
  )
}

export default App
