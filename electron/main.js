const { app, BrowserWindow, ipcMain, screen, clipboard, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const { screen: nutScreen, Region, mouse, Point, keyboard, Key } = require('@nut-tree/nut-js')
const Jimp = require('jimp')

app.disableHardwareAcceleration()

let mainWindow
let overlayWindow
let batchRunning = false
let resolvePickPromise = null // Global resolver for pick-point
let pickPointPromise = null

const isDev = !app.isPackaged
const lastRectPath = path.join(app.getPath('userData'), 'last-rect.json')

// --- Window State Management Helpers ---

/**
 * Ensure main window is visible and focused
 */
function ensureMainWindowVisible() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }
      mainWindow.focus()
      // Reset zoom factor to prevent accidental scaling
      mainWindow.webContents.setZoomFactor(1.0)
    } catch (e) {
      console.error('Error ensuring main window visible:', e)
    }
  }
}

/**
 * Ensure overlay window is closed and cleaned up
 */
function ensureOverlayClosed() {
  if (overlayWindow) {
    try {
      // Check if window is destroyed before attempting to close
      if (!overlayWindow.isDestroyed()) {
        overlayWindow.close()
      }
    } catch (e) {
      console.error('Error closing overlay window:', e)
    } finally {
      // Always clear the reference, even if window was already destroyed
      overlayWindow = null
    }
  }
}

function readLastRect() {
  try {
    const raw = fs.readFileSync(lastRectPath, 'utf8')
    const rect = JSON.parse(raw)
    if (!rect || typeof rect !== 'object') return null
    if (typeof rect.x !== 'number' || typeof rect.y !== 'number') return null
    if (typeof rect.width !== 'number' || typeof rect.height !== 'number') return null
    return rect
  } catch {
    return null
  }
}

function writeLastRect(rect) {
  try {
    fs.writeFileSync(lastRectPath, JSON.stringify(rect), 'utf8')
  } catch {
  }
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 600,
    title: '截图辅助工具',
    frame: true,
    alwaysOnTop: false,
    transparent: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      zoomFactor: 1.0
    }
  })

  // Ensure zoom factor is set to 1.0
  win.webContents.setZoomFactor(1.0)

  win.setMenu(null)

  if (isDev) {
    const loadURL = () => {
      win.loadURL('http://127.0.0.1:5173').catch((e) => {
        setTimeout(loadURL, 1000)
      })
    }
    loadURL()
    // Open DevTools in development mode
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  
  win.on('closed', () => {
    mainWindow = null
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close()
    }
  })

  mainWindow = win
}

function createOverlayWindow() {
  // Clean up existing overlay window if it exists and is destroyed
  if (overlayWindow) {
    if (overlayWindow.isDestroyed()) {
      overlayWindow = null
    } else {
      // Window exists and is not destroyed, don't create a new one
      return
    }
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const bounds = primaryDisplay.bounds

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      zoomFactor: 1.0
    }
  })

  // Ensure zoom factor is set to 1.0
  win.webContents.setZoomFactor(1.0)

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173/#/overlay')
    // Open DevTools for overlay window in development (commented out for cleaner UX)
    // Uncomment the line below if you need to debug the overlay window
    // win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/overlay' })
  }

  win.on('closed', () => {
    overlayWindow = null
  })

  overlayWindow = win
}

app.whenReady().then(() => {
  createMainWindow()
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// --- IPC Handlers ---

ipcMain.handle('pick-point', async () => {
  console.log('[pick-point] Handler called')
  
  if (pickPointPromise) {
    console.log('[pick-point] Reusing existing promise')
    try {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show()
        overlayWindow.focus()
      }
    } catch {
    }
    return pickPointPromise
  }

  console.log('[pick-point] Creating new promise')
  pickPointPromise = (async () => {
    // Clean up existing overlay first
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      ensureOverlayClosed()
    }
    
    // Use overlay window to capture a click
    createOverlayWindow()
    
    console.log('[pick-point] Overlay window created:', !!overlayWindow)
    
    if (!overlayWindow) {
      console.error('pick-point: Failed to create overlay window')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status', 'pick-point-failed:无法创建覆盖层窗口')
      }
      return null
    }

    try {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver')
      
      // Reset zoom factor to prevent accidental scaling
      overlayWindow.webContents.setZoomFactor(1.0)
      
      const url = isDev 
          ? 'http://127.0.0.1:5173/#/overlay?mode=pick' 
          : `file://${path.join(__dirname, '../dist/index.html')}#/overlay?mode=pick`
      
      console.log('[pick-point] Loading URL:', url)
          
      try {
        // Retry loading URL a few times in case dev server is busy
        let retries = 3
        while (retries > 0) {
          try {
            if (!overlayWindow || overlayWindow.isDestroyed()) throw new Error('Overlay window destroyed before load')
            await overlayWindow.loadURL(url)
            console.log('[pick-point] URL loaded successfully')
            break
          } catch (err) {
            console.log('[pick-point] Load failed, retries left:', retries - 1, 'Error:', err.message)
            retries--
            if (retries === 0) throw err
            // Check if destroyed during wait
            if (!overlayWindow || overlayWindow.isDestroyed()) throw new Error('Overlay window destroyed during retry wait')
            await new Promise(r => setTimeout(r, 500))
          }
        }
        
        if (!overlayWindow || overlayWindow.isDestroyed()) {
          throw new Error('Overlay window destroyed after loadURL')
        }
        
        // Wait for the page to fully load with timeout
        await Promise.race([
          new Promise((resolve, reject) => {
            if (!overlayWindow || overlayWindow.isDestroyed()) {
              return reject(new Error('Overlay window destroyed in wait promise'))
            }

            try {
              const checkAndResolve = () => {
                console.log('[pick-point] Page loaded, waiting for React...')
                setTimeout(resolve, 500)
              }

              if (overlayWindow.webContents.isLoading()) {
                console.log('[pick-point] Waiting for page to load...')
                overlayWindow.webContents.once('did-finish-load', checkAndResolve)
                // Also listen for dom-ready as backup
                overlayWindow.webContents.once('dom-ready', () => {
                  console.log('[pick-point] DOM ready')
                })
              } else {
                console.log('[pick-point] Page already loaded, waiting for React...')
                checkAndResolve()
              }
            } catch (err) {
              reject(err)
            }
          }),
          // Timeout after 3 seconds
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Page load timeout')), 3000)
          )
        ]).catch(err => {
          console.log('[pick-point] Page load wait failed:', err.message, '- continuing anyway')
          // Continue anyway after timeout
        })
        
        console.log('[pick-point] Ready to show overlay window')
        
        // Show and focus overlay window - do this after loading
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            // Get window bounds for debugging
            const bounds = overlayWindow.getBounds()
            console.log('[pick-point] Window bounds:', bounds)
            
            overlayWindow.setAlwaysOnTop(true, 'screen-saver')
            overlayWindow.show()
            overlayWindow.focus()
            overlayWindow.moveTop()
            
            console.log('[pick-point] Overlay window shown, visible:', overlayWindow.isVisible())
            console.log('[pick-point] Overlay window focused:', overlayWindow.isFocused())
            
            // Double check window is visible
            if (!overlayWindow.isVisible()) {
              console.log('[pick-point] Window not visible, showing again...')
              overlayWindow.show()
              overlayWindow.focus()
            }
            
            // Force a repaint
            overlayWindow.webContents.invalidate()
        } else {
             throw new Error('Overlay window destroyed before show')
        }
        
        // Only hide main window if overlay loaded successfully
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide()
        }
      } catch (e) {
      console.error('Failed to load overlay for pick-point:', e)
      ensureOverlayClosed()
      ensureMainWindowVisible()
      if (mainWindow && !mainWindow.isDestroyed()) {
        let msg = '覆盖层窗口加载失败'
        if (e.code === 'ERR_FAILED' || e.code === 'ERR_CONNECTION_REFUSED') {
          msg = '连接服务失败，请检查开发服务器是否启动'
        }
        mainWindow.webContents.send('status', `pick-point-failed:${msg}`)
      }
      return null // Abort pick point
    }
  } catch (e) {
    console.error('Error setting up overlay for pick-point:', e)
    ensureOverlayClosed()
    ensureMainWindowVisible()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status', 'pick-point-failed:设置覆盖层窗口失败')
    }
    return null
  }
  
  // Wait for the point-picked event with timeout (30 seconds)
  return new Promise((resolve) => {
    // Store resolve globally so close-overlay can use it
    resolvePickPromise = resolve

    // Set timeout to prevent permanent hanging
    const timeoutId = setTimeout(() => {
      if (resolvePickPromise === resolve) {
        ipcMain.removeListener('point-picked', handler)
        ensureOverlayClosed()
        ensureMainWindowVisible()
        resolvePickPromise = null
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('status', 'pick-point-failed:操作超时，请重试')
        }
        resolve(null)
      }
    }, 30000)

    const handler = (_event, pos) => {
      console.log('[pick-point] Point picked:', pos)
      clearTimeout(timeoutId)
      ipcMain.removeListener('point-picked', handler)
      
      // Ensure overlay is closed
      ensureOverlayClosed()
      
      // Clear global resolver
      if (resolvePickPromise === resolve) {
        resolvePickPromise = null
      }
      
      // Ensure main window is visible
      ensureMainWindowVisible()
      
      resolve(pos)
    }
    ipcMain.once('point-picked', handler)
  })
  })()

  try {
    return await pickPointPromise
  } finally {
    pickPointPromise = null
  }
})

ipcMain.handle('stop-batch', () => {
  batchRunning = false
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status', 'batch-stopped')
  }
})

ipcMain.handle('start-batch', async (_event, config) => {
  if (batchRunning) return
  batchRunning = true
  
  const { loopCount, leftSourcePos, rightSourcePos, leftOffsetDistance, rightOffsetDistance } = config
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  
  // Minimize main window to avoid interference
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize()
  }

  try {
    // Read the crop region (last saved rect)
    const rect = readLastRect()
    if (!rect) {
      throw new Error('No crop region set')
    }
    
    // Prepare coordinates for capture (reuse logic from capture-region)
    const primary = screen.getPrimaryDisplay()
    const boundsDip = primary.bounds
    const inset = 2
    const absDipCrop = {
      x: boundsDip.x + rect.x + inset,
      y: boundsDip.y + rect.y + inset,
      width: Math.max(1, rect.width - inset * 2),
      height: Math.max(1, rect.height - inset * 2)
    }
    // We need the window context for dipToScreenRect, but overlay is closed.
    // We can use null if we trust the primary display scaling or just use simple math if scaleFactor is known.
    // safe approach: use screen.dipToScreenRect(null, ...) works for primary display usually
    const absScreenCrop = screen.dipToScreenRect(null, {
      x: Math.round(absDipCrop.x),
      y: Math.round(absDipCrop.y),
      width: Math.round(absDipCrop.width),
      height: Math.round(absDipCrop.height)
    })
    
    const nutRegion = new Region(
      absScreenCrop.x,
      absScreenCrop.y,
      absScreenCrop.width,
      absScreenCrop.height
    )

    for (let i = 1; i <= loopCount; i++) {
      if (!batchRunning) break
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status', `batch-progress:${i}:${loopCount}`)
      }

      // 从第二次循环开始，先更新右源位置
      if (i > 1 && rightOffsetDistance > 0) {
        rightSourcePos.y += rightOffsetDistance
      }

      // a. Click Right Source Position (右源位置)
      await mouse.setPosition(new Point(rightSourcePos.x, rightSourcePos.y))
      await sleep(100)
      await mouse.leftClick()
      await sleep(300)

      // b. Capture the crop region and save to clipboard
      const grabbed = await nutScreen.grab(nutRegion)
      
      // Process image (Create nativeImage)
      const jimpImg = new Jimp({
        data: grabbed.data,
        width: grabbed.width,
        height: grabbed.height
      })
      
      // Auto-crop fallback logic
      if (Math.abs(grabbed.width - absScreenCrop.width) > 50 || Math.abs(grabbed.height - absScreenCrop.height) > 50) {
        jimpImg.crop(absScreenCrop.x, absScreenCrop.y, absScreenCrop.width, absScreenCrop.height)
      }

      const img = nativeImage.createFromBitmap(jimpImg.bitmap.data, {
        width: jimpImg.bitmap.width,
        height: jimpImg.bitmap.height,
        scaleFactor: primary.scaleFactor
      })
      
      if (img.isEmpty()) throw new Error('Empty screenshot')

      // Write to Clipboard
      clipboard.write({ image: img })
      await sleep(300) // Wait for clipboard

      // 从第二次循环开始，先更新左源位置
      if (i > 1 && leftOffsetDistance > 0) {
        leftSourcePos.y += leftOffsetDistance
      }

      // c. Click Left Source Position (左源位置)
      await mouse.setPosition(new Point(leftSourcePos.x, leftSourcePos.y))
      await sleep(100)
      await mouse.leftClick()
      await sleep(300)

      // d. Paste clipboard content to left source position
      await keyboard.pressKey(Key.LeftControl, Key.V)
      await keyboard.releaseKey(Key.LeftControl, Key.V)
      await sleep(1000) // Wait for paste to finish
      
      // Wait before next iteration
      await sleep(500)
    }
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status', 'batch-complete')
    }

  } catch (e) {
    console.error('Batch execution error:', e)
    if (mainWindow && !mainWindow.isDestroyed()) {
      const errorMsg = e.message || '批量执行失败'
      mainWindow.webContents.send('status', `batch-error:${errorMsg}`)
    }
  } finally {
    batchRunning = false
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.restore()
      mainWindow.focus()
    }
  }
})

ipcMain.handle('open-overlay', () => {
  createOverlayWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide()
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    // Reset to normal overlay mode if needed, or ensure correct URL
    if (overlayWindow.webContents.getURL().includes('mode=pick')) {
        const base = isDev ? 'http://127.0.0.1:5173/#/overlay' : `file://${path.join(__dirname, '../dist/index.html')}#/overlay`
        overlayWindow.loadURL(base).catch(() => {})
    }
    overlayWindow.show()
    overlayWindow.focus()
  }
})

ipcMain.handle('close-overlay', () => {
  // Ensure overlay is closed
  ensureOverlayClosed()
  
  // If we were picking a point, resolve with null to stop the hanging promise
  if (resolvePickPromise) {
    resolvePickPromise(null)
    resolvePickPromise = null
  }

  // Ensure main window is visible
  ensureMainWindowVisible()
  
  // Send cancelled status
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status', 'cancelled')
  }
})

ipcMain.handle('get-last-rect', () => {
  return readLastRect()
})

ipcMain.handle('set-last-rect', (_event, rect) => {
  if (!rect || typeof rect !== 'object') return
  if (typeof rect.x !== 'number' || typeof rect.y !== 'number') return
  if (typeof rect.width !== 'number' || typeof rect.height !== 'number') return
  writeLastRect(rect)
})

ipcMain.handle('get-primary-display-info', () => {
  const d = screen.getPrimaryDisplay()
  return {
    id: d.id,
    bounds: d.bounds,
    size: d.size,
    scaleFactor: d.scaleFactor
  }
})

ipcMain.on('emit-status', (_event, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status', value)
  }
})

ipcMain.on('emit-log', (_event, value) => {
  try {
    console.log(value)
  } catch {
    // ignore
  }
})

ipcMain.handle('dip-to-screen-rect', (_event, rect) => {
  return screen.dipToScreenRect(null, rect)
})

ipcMain.handle('capture-region', async (_event, rect) => {
  if (!rect || rect.width <= 0 || rect.height <= 0) return

  const win = overlayWindow
  if (!win || win.isDestroyed()) return

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status', 'capturing')
  }

  writeLastRect(rect)

  // Calculate coordinates before hiding window to ensure correct DIP conversion context
  const primary = screen.getPrimaryDisplay()
  const boundsDip = primary.bounds

  const inset = 2
  const absDipCrop = {
    x: boundsDip.x + rect.x + inset,
    y: boundsDip.y + rect.y + inset,
    width: Math.max(1, rect.width - inset * 2),
    height: Math.max(1, rect.height - inset * 2)
  }

  const absScreenCrop = screen.dipToScreenRect(win, {
    x: Math.round(absDipCrop.x),
    y: Math.round(absDipCrop.y),
    width: Math.round(absDipCrop.width),
    height: Math.round(absDipCrop.height)
  })

  // Calculate screen coordinates for capture region

  // Check if window is still valid before hiding
  if (!win.isDestroyed()) {
    win.hide()
  }
  await new Promise((r) => setTimeout(r, 220))

  try {
    const region = new Region(
      absScreenCrop.x,
      absScreenCrop.y,
      absScreenCrop.width,
      absScreenCrop.height
    )
    const grabbed = await nutScreen.grab(region)

    const jimpImg = new Jimp({
      data: grabbed.data,
      width: grabbed.width,
      height: grabbed.height
    })

    // Fallback: If grabbed image is significantly larger than requested region,
    // manually crop it to handle cases where nut.js returns full screen
    if (Math.abs(grabbed.width - absScreenCrop.width) > 50 || Math.abs(grabbed.height - absScreenCrop.height) > 50) {
      jimpImg.crop(
        absScreenCrop.x, 
        absScreenCrop.y, 
        absScreenCrop.width, 
        absScreenCrop.height
      )
    }

    // Nut.js usually returns BGRA on Windows.
    // Jimp expects RGBA.
    // nativeImage.createFromBitmap expects BGRA on Windows (usually).
    // So if we use createFromBitmap, we should NOT swap channels.
    // We only wrap it in Jimp for potential cropping.
    


    // Create native image from bitmap data
    const img = nativeImage.createFromBitmap(jimpImg.bitmap.data, {
      width: jimpImg.bitmap.width,
      height: jimpImg.bitmap.height,
      scaleFactor: primary.scaleFactor
    })

    if (img.isEmpty()) {
      throw new Error('nativeImage_empty')
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    let ok = false
    const beforeFormats = clipboard.availableFormats()
    const prevImage = clipboard.readImage()
    const prevText = clipboard.readText()
    const prevHtml = clipboard.readHTML()

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.showInactive()
    }

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      clipboard.write({ image: img })

      await sleep(Math.min(60 * attempt, 600))

      const verify = clipboard.readImage()
      const formats = clipboard.availableFormats()
      const size = verify.isEmpty() ? { width: 0, height: 0 } : verify.getSize()

      // Verify clipboard write succeeded

      if (!verify.isEmpty() && size.width > 0 && size.height > 0) {
        ok = true
        break
      }
    }

    // Restore previous clipboard content if write failed
    if (!ok) {
      if (!prevImage.isEmpty()) clipboard.write({ image: prevImage })
      else if (prevText || prevHtml) clipboard.write({ text: prevText, html: prevHtml })
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status', ok ? 'copied' : 'copy_failed')
    }
  } catch (e) {
    console.error('Capture failed:', e.message)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status', 'copy_failed')
    }
  } finally {
    ensureOverlayClosed()
    ensureMainWindowVisible()
  }
})

ipcMain.handle('finish-capture', () => {
  ensureOverlayClosed()
  ensureMainWindowVisible()
})
