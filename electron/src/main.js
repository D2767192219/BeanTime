const { app, BrowserWindow, ipcMain, Menu, Tray, dialog, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================
// 数据存储路径
// ============================================================
const DATA_DIR = path.join(app.getPath('userData'), 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ============================================================
// 内存缓存 + 异步持久化
// ============================================================
let dbCache = null;
let writeTimer = null;
let writeDirty = false;
let writeInFlight = false;

function dbLoad() {
  ensureDataDir();
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('[dbLoad error]', e);
  }
  return { areas: [], tables: [], records: [], histories: [], settings: { key: 'main', hourlyRate: 30, currency: '¥' } };
}

async function flushDbSave() {
  if (writeInFlight || !writeDirty) return;

  writeInFlight = true;
  writeDirty = false;
  try {
    await fs.promises.writeFile(DB_FILE, JSON.stringify(dbCache), 'utf8');
  } catch (e) {
    console.error('[dbSave error]', e);
  } finally {
    writeInFlight = false;
    if (writeDirty) {
      flushDbSave();
    }
  }
}

function dbSave() {
  writeDirty = true;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    flushDbSave();
  }, 120);
}

// ============================================================
// 窗口管理
// ============================================================
let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '拼豆管理',
    icon: getIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const rendererFile = path.join(app.getAppPath(), 'dist', 'renderer', 'index.html');

  if (devServerUrl) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(rendererFile);
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (win) {
      win.show();
    }
  });
}

// ============================================================
// 系统托盘
// ============================================================
function createTray() {
  const icon = getIcon();
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('拼豆管理');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { if (win) { win.show(); win.focus(); } } },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (win) {
      if (win.isVisible()) { win.hide(); } else { win.show(); win.focus(); }
    }
  });
}

function getIcon() {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(__dirname, 'icon', iconName);
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  return nativeImage.createEmpty();
}

// ============================================================
// 应用菜单
// ============================================================
function createMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' }, { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit' }
    ]}] : []),
    {
      label: '文件',
      submenu: [
        { label: '导出数据', click: async () => {
          const result = await dialog.showSaveDialog(win, {
            title: '导出数据', defaultPath: `jgdz-backup-${Date.now()}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }]
          });
          if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, JSON.stringify(dbCache, null, 2));
            win.webContents.send('show-toast', '数据已导出');
          }
        }},
        { label: '导入数据', click: async () => {
          const result = await dialog.showOpenDialog(win, {
            title: '导入数据', filters: [{ name: 'JSON', extensions: ['json'] }],
            properties: ['openFile']
          });
          if (!result.canceled && result.filePaths.length > 0) {
            try {
              const imported = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
              dbCache = imported;
              dbSave();
              win.webContents.send('data-imported', imported);
            } catch (e) {
              win.webContents.send('show-toast', '导入失败：文件格式错误');
            }
          }
        }},
        { type: 'separator' },
        { label: '打开数据文件夹', click: () => shell.showItemInFolder(DB_FILE) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { label: '编辑', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ]},
    { label: '视图', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' }
    ]},
    { label: '窗口', submenu: [
      { role: 'minimize' }, { role: 'zoom' },
      ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])
    ]},
    { label: '帮助', submenu: [{ label: '关于', click: () => {
      dialog.showMessageBox(win, {
        type: 'info', title: '关于拼豆管理',
        message: '拼豆管理平台 v1.0.0',
        detail: '专业的拼豆计时计费管理系统\n\n支持 Windows 和 macOS'
      });
    }}]}
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ============================================================
// IPC 处理器
// ============================================================
function setupIPC() {
  ipcMain.handle('db:getAll', async () => {
    return dbCache;
  });

  ipcMain.handle('db:put', async (event, namespace, data) => {
    if (namespace === 'settings') {
      dbCache.settings = data;
      dbSave();
      return data;
    }

    if (!Array.isArray(dbCache[namespace])) {
      dbCache[namespace] = [];
    }

    const arr = dbCache[namespace] || [];
    const idx = arr.findIndex(x => x.id === data.id);
    if (idx >= 0) arr[idx] = data; else arr.push(data);
    dbCache[namespace] = arr;
    dbSave();
    return data;
  });

  ipcMain.handle('db:del', async (event, namespace, id) => {
    if (namespace === 'settings') {
      dbCache.settings = { key: 'main', hourlyRate: 30, currency: '¥' };
      dbSave();
      return true;
    }

    dbCache[namespace] = (dbCache[namespace] || []).filter(x => x.id !== id);
    dbSave();
    return true;
  });

  ipcMain.handle('db:putFull', async (event, data) => {
    dbCache = data;
    dbSave();
    return true;
  });

  ipcMain.handle('db:putBatch', async (event, namespace, items) => {
    if (!Array.isArray(dbCache[namespace])) {
      dbCache[namespace] = [];
    }

    const arr = dbCache[namespace] || [];
    for (const data of items) {
      const idx = arr.findIndex(x => x.id === data.id);
      if (idx >= 0) arr[idx] = data; else arr.push(data);
    }
    dbCache[namespace] = arr;
    dbSave();
    return true;
  });

  ipcMain.handle('app:notify', async (event, title, body) => {
    const { Notification } = require('electron');
    if (Notification.isSupported()) new Notification({ title, body }).show();
  });

  ipcMain.handle('app:openExternal', async (event, url) => {
    shell.openExternal(url);
  });
}

// ============================================================
// 应用生命周期
// ============================================================
app.whenReady().then(() => {
  dbCache = dbLoad();
  createMenu();
  createTray();
  createWindow();
  setupIPC();

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
});

app.on('before-quit', () => {
  if (writeTimer) clearTimeout(writeTimer);
  if (dbCache) {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf8'); } catch (e) {}
  }
  if (tray) tray.destroy();
});
