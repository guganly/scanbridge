// app.js - ScanBridge Mini Program（WiFi 配对 + 剪贴板同步 + 独立扫码）
const store = require('./utils/store.js');

App({
  globalData: {
    // 连接模式：'standalone' | 'websocket' | 'clipboard'
    connectMode: 'standalone',

    // WebSocket 相关
    serverUrl: '',
    sessionId: null,
    paired: false,
    connected: false,

    // 云开发
    cloudReady: false,
    cloudHostingUrl: '',

    // 设置
    settings: {
      autoSend: true,     // WiFi 配对后自动发送
      autoCopy: true,     // 剪贴板同步模式下自动复制
      vibrate: true,
      sound: true,
      scanType: 'all',
    },
  },

  onLaunch() {
    // 加载本地设置
    const savedSettings = wx.getStorageSync('settings');
    if (savedSettings) {
      this.globalData.settings = { ...this.globalData.settings, ...savedSettings };
    }

    // 加载上次连接模式
    const savedMode = wx.getStorageSync('connectMode');
    if (savedMode) {
      this.globalData.connectMode = savedMode;
    }

    // WebSocket 相关
    const savedSession = wx.getStorageSync('sessionId');
    if (savedSession) {
      this.globalData.sessionId = savedSession;
      this.globalData.paired = true;
    }
    const savedServerUrl = wx.getStorageSync('serverUrl');
    if (savedServerUrl) {
      this.globalData.serverUrl = savedServerUrl;
    }

    // 云开发（非阻塞，静默捕获异常）
    this._tryInitCloud().catch((err) => {
      const msg = err.message || '';
      // 云函数/数据库未部署时不必显示为错误
      if (msg.includes('FUNCTION_NOT_FOUND') || msg.includes('database collection not exists')) {
        console.log('[APP] 云开发未配置，使用本地存储模式');
      } else {
        console.warn('[APP] 云开发初始化失败（不影响本地功能）:', err.message);
      }
    });
  },

  onError(err) {
    console.error('[APP] Uncaught error:', err);
  },

  // ==================== 切换连接模式 ====================

  setConnectMode(mode) {
    this.globalData.connectMode = mode;
    wx.setStorageSync('connectMode', mode);

    // 如果切换到 standalone 或 clipboard，断开 WebSocket
    if (mode !== 'websocket' && this.globalData.paired) {
      try {
        const WSManager = require('./utils/websocket.js');
        WSManager.disconnect();
      } catch(e) {}
      this.globalData.paired = false;
      this.globalData.connected = false;
      this.globalData.sessionId = null;
      this.globalData.serverUrl = '';
      wx.removeStorageSync('sessionId');
      wx.removeStorageSync('serverUrl');
    }

    // WebSocket 模式：如果之前已配对，自动重连
    if (mode === 'websocket' && this.globalData.serverUrl && this.globalData.sessionId) {
      this._reconnectWebSocket();
    }
  },

  _reconnectWebSocket() {
    try {
      const WSManager = require('./utils/websocket.js');
      WSManager.init({
        onStatusChange: (status) => {
          this.globalData.connected = status.connected;
          if (!status.connected) {
            this.globalData.paired = false;
          }
        },
      });
      WSManager.updateUrl(this.globalData.serverUrl);
      WSManager.connect();
    } catch(e) {
      console.error('[APP] WS init error:', e);
    }
  },

  // ==================== 云开发 ====================

  _tryInitCloud() {
    return new Promise((resolve, reject) => {
      if (!wx.cloud) {
        reject(new Error('当前版本不支持云开发'));
        return;
      }
      const cloudEnvId = 'cloud1-d4gcfsku4e81556e0';
      if (!cloudEnvId) {
        reject(new Error('未配置云开发环境 ID'));
        return;
      }
      try {
        wx.cloud.init({ env: cloudEnvId, traceUser: true });
        wx.cloud.callFunction({
          name: 'getCloudHostingUrl',
          data: {},
          success: (res) => {
            if (res.result && res.result.url) {
              this.globalData.cloudHostingUrl = res.result.url;
              this.globalData.cloudReady = true;
              resolve();
            } else {
              reject(new Error('云函数未返回 URL'));
            }
          },
          fail: reject,
        });
      } catch(e) { reject(e); }
    });
  },

  // ==================== 发送扫码结果（统一入口） ====================

  sendScanResult(result) {
    const mode = this.globalData.connectMode;

    // WiFi 配对模式：通过 WebSocket 发送到电脑
    if (mode === 'websocket' && this.globalData.paired) {
      const WSManager = require('./utils/websocket.js');
      WSManager.send({
        type: 'scan_result',
        sessionId: this.globalData.sessionId,
        data: {
          content: result.result,
          format: result.scanType,
          timestamp: Date.now(),
          // v2.0 附加字段
          sn: result.sn || null,
          deviceModel: result.deviceModel || '',
          tags: result.tags || [],
        },
      });
    }

    return Promise.resolve();
  },

  // ==================== 复制到剪贴板 ====================

  copyToClipboard(content) {
    return new Promise((resolve, reject) => {
      wx.setClipboardData({
        data: content,
        success: () => resolve(true),
        fail: (err) => reject(err),
      });
    });
  },
});
