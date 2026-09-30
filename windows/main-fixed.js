const { app, BrowserWindow, Tray, dialog, ipcMain, Menu } = require('electron')
const path = require('path')
const express = require('express')
const fs = require('fs')
const https = require('https')

let win
let localConfigUrl

function apiOrigin (value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Backend URL must use HTTPS')
  return url.origin
}

function readRemoteConfig (address, redirects = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(address)
    if (url.protocol !== 'https:' || url.username || url.password) return reject(new Error('Invalid remote URL'))
    const request = https.get(url, { timeout: 5000, headers: { 'Accept': 'application/json' } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 2) {
        response.resume()
        return resolve(readRemoteConfig(new URL(response.headers.location, url).toString(), redirects + 1))
      }
      if (response.statusCode !== 200) {
        response.resume()
        return reject(new Error('Remote config unavailable'))
      }
      const chunks = []
      let bytes = 0
      response.on('data', chunk => {
        bytes += chunk.length
        if (bytes > 32768) return response.destroy(new Error('Remote config too large'))
        chunks.push(chunk)
      })
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (error) { reject(error) }
      })
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('Remote config timed out')))
    request.on('error', reject)
  })
}

function init () {
  // BrowserWindow
  const width = 400
  const height = 510
  win = new BrowserWindow({
    width,
    height,
    show: false,
    resizable: false,
    frame: false,
    maximizable: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      //devTools: true,
      devTools: !app.isPackaged,
      nodeIntegration: true,
      webSecurity: false,
      // enableRemoteModule: true
    }
  })

  if (app.isPackaged) {
    const server = express()
    server.get('/backend-config.json', async (_req, res) => {
      try {
        const config = JSON.parse(fs.readFileSync(path.join(process.resourcesPath, 'backend.json'), 'utf8'))
        let api = apiOrigin(config.api)
        if (config.remoteConfigUrl) {
          try {
            const remote = await readRemoteConfig(config.remoteConfigUrl)
            api = apiOrigin(remote.api)
          } catch (_) { /* Keep the local fallback when the online JSON is unavailable. */ }
        }
        res.json({ api })
      } catch (error) {
        res.status(500).json({ error: 'Invalid resources/backend.json' })
      }
    })
    server.use('/', express.static(__dirname))
    const srv = server.listen(0, '127.0.0.1', () => {
      if (srv.address().port) {
        localConfigUrl = `http://127.0.0.1:${srv.address().port}/backend-config.json`
        win.loadURL(`http://127.0.0.1:${srv.address().port}/dist/index.html`)
      } else {
        win.loadFile('./dist/index.html')
      }
    })
  } else {
    win.loadURL('http://127.0.0.1:9000')
    win.webContents.openDevTools()
  }

  win.once('ready-to-show', () => {
    win.show()
  })

  win.on('close', (e) => {
    if(!global.isQuit) {
      e.preventDefault()
      if (typeof app.hide === 'function') app.hide()
    }
  })

  global.win = win
  global.isQuit = false
  // Tray
  const tray = new Tray(path.join(__dirname, process.platform === 'darwin' ? 'assets/iconOff@2x.png' : 'assets/iconOff.ico'))
  global.tray = tray
  // IPC
  ipcMain.on('show', () => {
    win.show()
  })
  ipcMain.on('quit', () => {
    global.isQuit = true
    app.quit()
  })
}

if (process.platform === 'darwin') {
  app.dock.hide()
}

app.on('window-all-closed', (e) => {
  e.preventDefault()
  app.quit()
})

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (!win) return
    win.show()
  })

  app.on('ready', () => {
    if (process.platform === 'win32') {
      const appData = app.getPath('appData')
      const safePaths = [
        process.env.SAFE_PATHS,
        app.getPath('userData'),
        app.getPath('desktop'),
        path.join(appData, '桌面'),
        `${appData}桌面`
      ].filter(Boolean)
      process.env.SAFE_PATHS = safePaths.join(path.delimiter)
    }
    const session = require('electron').session.defaultSession
    session.webRequest.onBeforeRequest({ urls: ['https://gitcode.net/-/snippets/4703/raw/master/haochou.json*', 'https://*/api/v1/client/app/getConfig*'] }, (details, callback) => {
      if (details.url.startsWith('https://gitcode.net/-/snippets/4703/raw/master/haochou.json')) {
        return callback(localConfigUrl ? { redirectURL: localConfigUrl } : {})
      }
      const url = new URL(details.url)
      if (url.pathname !== '/api/v1/client/app/getConfig') return callback({})
      url.pathname = '/api/v1/client/subscribe'
      url.searchParams.set('flag', 'meta')
      callback({ redirectURL: url.toString() })
    })
    init()
  })
}
