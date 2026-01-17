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

  const [cropRegion, setCropRegion] = useState(null) // {x, y, width, height} or null
  const [leftSourcePos, setLeftSourcePos] = useState(null) // {x, y} or null (左源位置)
  const [rightSourcePos, setRightSourcePos] = useState(null) // {x, y} or null (右源位置)
  const [loopCount, setLoopCount] = useState(3)
  const [leftOffsetDistance, setLeftOffsetDistance] = useState(0) // 左源下移距离
  const [rightOffsetDistance, setRightOffsetDistance] = useState(0) // 右源下移距离
  const [isRunning, setIsRunning] = useState(false)
  
  // Check if crop region is set on mount
  useEffect(() => {
    if (!hasElectronApi) return
    const checkCropRegion = async () => {
      try {
        const rect = await window.electronAPI?.getLastRect?.()
        if (rect && rect.x !== undefined && rect.y !== undefined && rect.width > 0 && rect.height > 0) {
          setCropRegion(rect)
        }
      } catch (e) {
        console.error('Failed to check crop region:', e)
      }
    }
    checkCropRegion()
  }, [hasElectronApi])
  
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
        setStatusText('裁剪区域已设置')
        setStatusType('success')
        setCropRegion(true) // Mark as set
      }
      else if (s === 'copy_failed') {
        setStatusText('操作失败')
        setStatusType('error')
      }
      else if (s === 'cancelled') {
        setStatusText('已取消')
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
      else if (s.startsWith('batch-error:')) {
        const errorMsg = s.split('batch-error:')[1] || '批量执行失败'
        setStatusText(errorMsg)
        setStatusType('error')
        setIsRunning(false)
      }
      else if (s.startsWith('pick-point-failed:')) {
        const errorMsg = s.split('pick-point-failed:')[1] || '位置设置失败'
        setStatusText(errorMsg)
        setStatusType('error')
      }
      else {
        setStatusText('')
        setStatusType('')
      }
      
      if (['copied', 'copy_failed', 'cancelled', 'batch-complete', 'batch-stopped'].includes(s) || s.startsWith('batch-error:') || s.startsWith('pick-point-failed:')) {
        timerRef.current = setTimeout(() => {
          setStatusText('')
          timerRef.current = null
        }, 3000)
      }
    })
    return () => {
      off?.()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [hasElectronApi])

  const handleSetCropRegion = () => {
    window.electronAPI?.openOverlay?.()
  }

  const handlePickPoint = async (type) => {
    console.log(`handlePickPoint called with type: ${type}`)
    console.log('electronAPI available:', !!window.electronAPI)
    console.log('pickPoint function:', typeof window.electronAPI?.pickPoint)
    
    try {
      const pos = await window.electronAPI?.pickPoint?.()
      console.log('pickPoint returned:', pos)
      
      if (pos && pos.x !== undefined && pos.y !== undefined) {
        if (type === 'leftSource') {
          setLeftSourcePos(pos)
          setStatusText(`左源位置已设置: (${pos.x}, ${pos.y})`)
          setStatusType('success')
        } else if (type === 'rightSource') {
          setRightSourcePos(pos)
          setStatusText(`右源位置已设置: (${pos.x}, ${pos.y})`)
          setStatusType('success')
        }
        timerRef.current = setTimeout(() => {
          setStatusText('')
          timerRef.current = null
        }, 2000)
      } else {
        console.log('pickPoint returned null or invalid position')
      }
    } catch (e) {
      console.error('Error picking point:', e)
      setStatusText('位置设置失败，请重试')
      setStatusType('error')
      timerRef.current = setTimeout(() => {
        setStatusText('')
        timerRef.current = null
      }, 3000)
    }
  }

  const handleStartBatch = () => {
    console.log('handleStartBatch called')
    console.log('cropRegion:', cropRegion)
    console.log('leftSourcePos:', leftSourcePos)
    console.log('rightSourcePos:', rightSourcePos)
    console.log('loopCount:', loopCount)
    console.log('leftOffsetDistance:', leftOffsetDistance)
    console.log('rightOffsetDistance:', rightOffsetDistance)
    
    if (!cropRegion) {
      setStatusText('请先设置裁剪区域')
      setStatusType('error')
      setTimeout(() => setStatusText(''), 3000)
      return
    }
    if (!leftSourcePos) {
      setStatusText('请先设置左源位置')
      setStatusType('error')
      setTimeout(() => setStatusText(''), 3000)
      return
    }
    if (!rightSourcePos) {
      setStatusText('请先设置右源位置')
      setStatusType('error')
      setTimeout(() => setStatusText(''), 3000)
      return
    }
    if (loopCount <= 0) {
      setStatusText('循环次数必须大于0')
      setStatusType('error')
      setTimeout(() => setStatusText(''), 3000)
      return
    }
    
    console.log('Starting batch with config:', {
      loopCount,
      leftSourcePos,
      rightSourcePos,
      leftOffsetDistance,
      rightOffsetDistance
    })
    
    setIsRunning(true)
    window.electronAPI?.startBatch?.({
      loopCount,
      leftSourcePos,
      rightSourcePos,
      leftOffsetDistance,
      rightOffsetDistance
    })
  }

  const handleStopBatch = () => {
    window.electronAPI?.stopBatch?.()
  }

  // Check crop region on mount
  useEffect(() => {
    if (!hasElectronApi) return
    const checkCropRegion = async () => {
      try {
        const rect = await window.electronAPI?.getLastRect?.()
        if (rect && rect.x !== undefined && rect.y !== undefined && rect.width > 0 && rect.height > 0) {
          setCropRegion(true)
        }
      } catch (e) {
        console.error('Failed to check crop region:', e)
      }
    }
    checkCropRegion()
  }, [hasElectronApi])

  if (isOverlay) {
    return (
      <Overlay
        onConfirm={(rect) => {
          window.electronAPI?.captureRegion?.(rect)
          setCropRegion(true)
        }}
        onCancel={() => {
          window.electronAPI?.closeOverlay?.()
        }}
        onPointPicked={(pos) => {
          window.electronAPI?.pointPicked?.(pos)
        }}
      />
    )
  }

  return (
    <div className="container">
      <h2 style={{ marginBottom: '20px', fontSize: '18px', fontWeight: 'bold' }}>批量自动化工具</h2>

      {!hasElectronApi && (
        <div style={{ marginBottom: '16px', padding: '10px 12px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6, color: '#a8071a', fontSize: 12 }}>
          未检测到桌面端环境：请使用 npm run dev 启动 Electron，否则按钮不可用。
        </div>
      )}
      
      <div className="batch-panel">
        {/* Step 1: Set Crop Region */}
        <div className="config-row" style={{ marginBottom: '16px' }}>
          <label style={{ minWidth: '120px' }}>步骤 1: 设置裁剪区域</label>
          <button 
            className={`pick-btn ${cropRegion ? 'success' : ''}`}
            onClick={handleSetCropRegion}
            disabled={!hasElectronApi}
            style={{ flex: 1 }}
          >
            {cropRegion ? '✓ 裁剪区域已设置' : '设置裁剪区域'}
          </button>
        </div>

        {/* Step 2: Set Left Source Position */}
        <div className="config-row" style={{ marginBottom: '16px' }}>
          <label style={{ minWidth: '120px' }}>步骤 2: 设置左源位置</label>
          <button 
            className={`pick-btn ${leftSourcePos ? 'success' : ''}`}
            onClick={() => handlePickPoint('leftSource')}
            disabled={!hasElectronApi}
            style={{ flex: 1 }}
          >
            {leftSourcePos ? `✓ 左源位置已设置 (${leftSourcePos.x}, ${leftSourcePos.y})` : '设置左源位置'}
          </button>
        </div>

        {/* Step 3: Set Right Source Position */}
        <div className="config-row" style={{ marginBottom: '16px' }}>
          <label style={{ minWidth: '120px' }}>步骤 3: 设置右源位置</label>
          <button 
            className={`pick-btn ${rightSourcePos ? 'success' : ''}`}
            onClick={() => handlePickPoint('rightSource')}
            disabled={!hasElectronApi}
            style={{ flex: 1 }}
          >
            {rightSourcePos ? `✓ 右源位置已设置 (${rightSourcePos.x}, ${rightSourcePos.y})` : '设置右源位置'}
          </button>
        </div>

        {/* Step 4: Loop Count */}
        <div className="config-row" style={{ marginBottom: '20px' }}>
          <label style={{ minWidth: '120px' }}>步骤 4: 循环次数</label>
          <input 
            type="number" 
            value={loopCount}
            onChange={(e) => setLoopCount(Math.max(1, parseInt(e.target.value) || 1))}
            className="count-input"
            min="1"
            style={{ width: '80px' }}
          />
        </div>

        {/* Step 5: Left Source Offset Distance */}
        <div className="config-row" style={{ marginBottom: '12px' }}>
          <label style={{ minWidth: '120px' }}>步骤 5: 左源下移距离</label>
          <input 
            type="number" 
            value={leftOffsetDistance}
            onChange={(e) => setLeftOffsetDistance(Math.max(0, parseInt(e.target.value) || 0))}
            className="count-input"
            min="0"
            style={{ width: '80px' }}
          />
          <span style={{ marginLeft: '8px', fontSize: '14px', color: '#666' }}>像素</span>
        </div>

        {/* Step 6: Right Source Offset Distance */}
        <div className="config-row" style={{ marginBottom: '20px' }}>
          <label style={{ minWidth: '120px' }}>步骤 6: 右源下移距离</label>
          <input 
            type="number" 
            value={rightOffsetDistance}
            onChange={(e) => setRightOffsetDistance(Math.max(0, parseInt(e.target.value) || 0))}
            className="count-input"
            min="0"
            style={{ width: '80px' }}
          />
          <span style={{ marginLeft: '8px', fontSize: '14px', color: '#666' }}>像素</span>
        </div>
        
        {/* Step 7: Start Batch */}
        <div className="action-row">
          {!isRunning ? (
            <button 
              className="start-btn batch-start"
              onClick={handleStartBatch}
              disabled={!hasElectronApi || !cropRegion || !leftSourcePos || !rightSourcePos}
              style={{ width: '100%' }}
            >
              开始执行
            </button>
          ) : (
            <button 
              className="start-btn batch-stop"
              onClick={handleStopBatch}
              style={{ width: '100%' }}
            >
              停止执行 (ESC)
            </button>
          )}
        </div>
        
        <div className="hint" style={{ marginTop: '16px', fontSize: '12px', color: '#666' }}>
          操作流程：点击右源位置 → 截图裁剪区域 → 复制到剪切板 → 点击左源位置 → 粘贴
        </div>
      </div>

      {!!statusText && <div className={`toast ${statusType}`}>{statusText}</div>}
    </div>
  )
}

export default App
