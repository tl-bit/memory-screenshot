const { app, BrowserWindow, ipcMain, screen, clipboard, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const { screen: nutScreen, Region } = require('@nut-tree/nut-js')
const Jimp = require('jimp')

app.disableHardwareAcceleration()

let mainWindow
let overlayWindow

const isDev = !app.isPackaged
const lastRectPath = path.join(app.getPath('userData'), 'last-rect.json')

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
    width: 400,
    height: 400,
    title: '截图辅助工具',
    frame: true,
    alwaysOnTop: false,
    transparent: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.setMenu(null)

  if (isDev) {
    const loadURL = () => {
      win.loadURL('http://localhost:5173').catch((e) => {
        setTimeout(loadURL, 1000)
      })
    }
    loadURL()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  
  win.on('closed', () => {
    mainWindow = null
    if (overlayWindow) overlayWindow.close()
  })

  mainWindow = win
}

function createOverlayWindow() {
  if (overlayWindow) return

  const primaryDisplay = screen.getPrimaryDisplay()
  const bounds = primaryDisplay.bounds

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
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
      contextIsolation: true
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173/#/overlay')
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

ipcMain.handle('open-overlay', () => {
  createOverlayWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide()
  }
  if (overlayWindow) {
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.show()
    overlayWindow.focus()
  }
})

ipcMain.handle('close-overlay', () => {
  if (overlayWindow) {
    overlayWindow.close()
    overlayWindow = null
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status', 'cancelled')
    mainWindow.show()
    mainWindow.focus()
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
  if (!win) return

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

  console.log(
    `[capture] rectDip=${JSON.stringify(rect)} absDipCrop=${JSON.stringify(
      absDipCrop
    )} absScreenCrop=${JSON.stringify(absScreenCrop)}`
  )

  win.hide()
  await new Promise((r) => setTimeout(r, 220))

  try {
    const region = new Region(
      absScreenCrop.x,
      absScreenCrop.y,
      absScreenCrop.width,
      absScreenCrop.height
    )
    const grabbed = await nutScreen.grab(region)
    console.log(`[capture] grabbed ${grabbed.width}x${grabbed.height} bytes=${grabbed.data?.length || 0}`)

    const jimpImg = new Jimp({
      data: grabbed.data,
      width: grabbed.width,
      height: grabbed.height
    })

    // Fallback: If grabbed image is significantly larger than requested region (e.g. full screen),
    // manually crop it. This handles cases where nut.js might ignore the region or return full screen.
    // We assume if width mismatch is > 50px, it's likely not the correct region.
    if (Math.abs(grabbed.width - absScreenCrop.width) > 50 || Math.abs(grabbed.height - absScreenCrop.height) > 50) {
      console.log(`[capture] size mismatch, manual cropping applied.`)
      // If grabbed is full screen, crop using absolute coordinates
      // Note: This assumes grabbed image starts at (0,0) of the screen/display space
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
    
    /* 
    // Previous color swap logic (removed for createFromBitmap optimization)
    jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function (_x, _y, idx) {
      const blue = this.bitmap.data[idx + 0]
      const red = this.bitmap.data[idx + 2]
      this.bitmap.data[idx + 0] = red
      this.bitmap.data[idx + 2] = blue
    })
    */

    const img = nativeImage.createFromBitmap(jimpImg.bitmap.data, {
      width: jimpImg.bitmap.width,
      height: jimpImg.bitmap.height,
      scaleFactor: primary.scaleFactor
    })

    console.log(
      `[capture] nativeImageSize=${JSON.stringify(img.getSize())} scaleFactor=${primary.scaleFactor}`
    )
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

      console.log(
        `[capture] clipboard attempt=${attempt} formats=${JSON.stringify(formats)} size=${JSON.stringify(
          size
        )}`
      )

      if (!verify.isEmpty() && size.width > 0 && size.height > 0) {
        ok = true
        break
      }
    }

    if (!ok) {
      console.log(
        `[capture] clipboard restore beforeFormats=${JSON.stringify(beforeFormats)} prevImageEmpty=${prevImage.isEmpty()} prevTextLen=${prevText?.length || 0}`
      )
      if (!prevImage.isEmpty()) clipboard.write({ image: prevImage })
      else if (prevText || prevHtml) clipboard.write({ text: prevText, html: prevHtml })
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status', ok ? 'copied' : 'copy_failed')
    }
  } catch (e) {
    console.log(`[capture] exception ${e && (e.stack || e.message) ? e.stack || e.message : ''}`)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status', 'copy_failed')
    }
  } finally {
    if (overlayWindow) {
      overlayWindow.close()
      overlayWindow = null
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  }
})

ipcMain.handle('finish-capture', () => {
  if (overlayWindow) {
    overlayWindow.close()
    overlayWindow = null
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  }
})
