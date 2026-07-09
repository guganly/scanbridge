// desktop/main.js - ScanBridge Electron 主进程
// 双击 exe 后：
//   1. 启动 Node.js WebSocket 中继服务器（端口 8080）
//   2. 打开浏览器窗口显示电脑接收端页面
//   3. 关闭窗口时自动停止服务器

const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverReady = false;

const PORT = 8080;

// 决定服务器脚本路径
// 开发模式：../server/server.js
// 打包后：process.resourcesPath/server/server.js
function getServerScriptPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server', 'server.js');
  }
  return path.join(__dirname, '..', 'server', 'server.js');
}

// 决定 public 目录路径
function getPublicDirPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server', 'public');
  }
  return path.join(__dirname, '..', 'server', 'public');
}

// 启动 Node.js 服务器进程
function startServer() {
  return new Promise((resolve, reject) => {
    const scriptPath = getServerScriptPath();
    const publicDir = getPublicDirPath();

    // 检查服务器脚本是否存在
    if (!fs.existsSync(scriptPath)) {
      reject(new Error('找不到服务器脚本: ' + scriptPath));
      return;
    }

    console.log('[MAIN] 启动服务器:', scriptPath);

    // 使用当前 Electron 内嵌的 Node 启动服务器
    serverProcess = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        PORT: String(PORT),
        ELECTRON_RUN_AS_NODE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[SERVER]', msg);
      if (msg.includes('等待连接') || msg.includes('WebSocket:')) {
        if (!serverReady) {
          serverReady = true;
          resolve();
        }
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[SERVER-ERR]', data.toString());
    });

    serverProcess.on('error', (err) => {
      console.error('[SERVER] 启动失败:', err);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      console.log('[SERVER] 退出, code:', code);
      serverReady = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-stopped', { code });
      }
    });

    // 健康检查兜底：3 秒后不管 server 输出了没都尝试连接
    setTimeout(() => {
      if (!serverReady) {
        checkServer().then(resolve).catch(reject);
      }
    }, 3000);
  });
}

function checkServer() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${PORT}/health`, (res) => {
      if (res.statusCode === 200) {
        serverReady = true;
        resolve();
      } else {
        reject(new Error('Server health check failed: ' + res.statusCode));
      }
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('Server health check timeout'));
    });
  });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill('SIGINT');
    } catch(e) {
      console.error('Failed to stop server:', e);
    }
    serverProcess = null;
  }
}

// 获取本机所有真实局域网 IP
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const virtualKeywords = ['vpn', 'virtual', 'vmware', 'vbox', 'virtualbox',
    'hyper-v', 'wsl', 'docker', 'tunnel', 'wireguard', 'inode', 'tun', 'tap'];
  const result = [];

  for (const name of Object.keys(interfaces)) {
    const nameLower = name.toLowerCase();
    if (virtualKeywords.some(k => nameLower.includes(k))) continue;

    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.family === 'IPv4') {
        const ip = iface.address;
        if (ip.startsWith('192.168.56.') || ip.startsWith('192.168.136.') ||
            ip.startsWith('192.168.68.') || ip.startsWith('192.168.201.') ||
            ip.startsWith('192.168.202.')) continue;
        result.push({ name, ip });
      }
    }
  }
  return result;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 780,
    minWidth: 420,
    minHeight: 600,
    title: 'ScanBridge - 电脑接收端',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#f5f5f5',
    icon: path.join(__dirname, 'icon.png'),
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 阻止外部链接打开新窗口
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'icon.png'));
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开 ScanBridge',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
          }
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit();
        },
      },
    ]);
    tray.setToolTip('ScanBridge 电脑接收端');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      } else {
        createWindow();
      }
    });
  } catch(e) {
    console.warn('Failed to create tray:', e.message);
  }
}

// ====== App 生命周期 ======

app.whenReady().then(async () => {
  try {
    await startServer();
    console.log('[MAIN] Server ready on port', PORT);
    createWindow();
    createTray();
  } catch (err) {
    console.error('[MAIN] Failed to start:', err);
    dialog.showErrorBox('ScanBridge 启动失败',
      '无法启动本地服务器：\n' + err.message + '\n\n请检查端口 ' + PORT + ' 是否被占用。');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Windows: 退出应用
  stopServer();
  app.quit();
});

app.on('before-quit', () => {
  stopServer();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ====== IPC 处理器 ======

ipcMain.handle('get-config', () => {
  return {
    port: PORT,
    ips: getLocalIPs(),
    recommendedIp: getLocalIPs()[0]?.ip || 'localhost',
  };
});

ipcMain.on('minimize-to-tray', () => {
  if (mainWindow) mainWindow.hide();
});
