// pages/pair/pair.js - WiFi 配对页面
const app = getApp();
const WSManager = require('../../utils/websocket.js');

Page({
  data: {
    // 连接状态
    paired: false,
    connected: false,

    // WebSocket 输入
    inputServerUrl: '',
    inputPairCode: '',
    wsConnecting: false,
    wsStatusMsg: '',
    wsStatusError: false,
    serverUrl: '',
  },

  onLoad(options) {
    this.setData({
      serverUrl: app.globalData.serverUrl || '',
      inputServerUrl: app.globalData.serverUrl || '',
      paired: app.globalData.paired || false,
      connected: WSManager.connected,
    });
  },

  onShow() {
    this._registerWSCallbacks();

    this.setData({
      paired: app.globalData.paired || false,
      connected: WSManager.connected,
    });
  },

  onUnload() {
    WSManager.init({});
    if (this._wsPairTimeout) {
      clearTimeout(this._wsPairTimeout);
    }
  },

  // ==================== WebSocket 回调 ====================

  _registerWSCallbacks() {
    WSManager.init({
      onMessage: (msg) => this._handleWSMessage(msg),
      onStatusChange: (status) => this._handleWSStatus(status),
    });
  },

  // ==================== 输入处理 ====================

  onServerUrlInput(e) {
    this.setData({ inputServerUrl: e.detail.value.trim() });
  },

  onPairCodeInput(e) {
    let val = e.detail.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.setData({ inputPairCode: val });
  },

  pasteServerUrl() {
    wx.getClipboardData({
      success: (res) => {
        let url = res.data.trim();
        if (url && !url.startsWith('ws://') && !url.startsWith('wss://')) {
          url = 'ws://' + url;
        }
        if (url) {
          this.setData({ inputServerUrl: url });
          wx.showToast({ title: '已粘贴', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '无法读取剪贴板', icon: 'none' });
      },
    });
  },

  fillFromSaved() {
    const saved = wx.getStorageSync('serverUrl');
    if (saved) {
      this.setData({ inputServerUrl: saved });
      wx.showToast({ title: '已填入上次地址', icon: 'none' });
    } else {
      wx.showToast({ title: '没有保存过的地址', icon: 'none' });
    }
  },

  // ==================== 配对连接 ====================

  startWSPair() {
    const url = this.data.inputServerUrl;
    const code = this.data.inputPairCode;

    if (!url) {
      wx.showToast({ title: '请输入服务器地址', icon: 'none' });
      return;
    }
    if (!code || code.length !== 6) {
      wx.showToast({ title: '请输入 6 位配对码', icon: 'none' });
      return;
    }

    let finalUrl = url;
    if (!finalUrl.startsWith('ws://') && !finalUrl.startsWith('wss://')) {
      finalUrl = 'ws://' + finalUrl;
    }

    this.setData({
      wsConnecting: true,
      wsStatusMsg: '正在连接服务器...',
      wsStatusError: false,
    });

    // 初始化并连接
    WSManager.init({
      onMessage: (msg) => this._handleWSMessage(msg),
      onStatusChange: (status) => this._handleWSStatus(status),
    });
    WSManager.updateUrl(finalUrl);

    // send() 自动队列，连接成功后发出
    WSManager.send({
      type: 'pair_request',
      code: code,
      device: 'miniapp',
      timestamp: Date.now(),
    });

    WSManager.connect();

    this.setData({ wsStatusMsg: '正在连接并发送配对码...' });

    // 10 秒安全超时
    this._wsPairTimeout = setTimeout(() => {
      if (this.data.wsConnecting) {
        this.setData({
          wsConnecting: false,
          wsStatusError: true,
          wsStatusMsg: WSManager.connected
            ? '配对请求已发送但未收到响应，请检查配对码是否正确'
            : '连接服务器失败，请检查地址和网络',
        });
      }
    }, 10000);
  },

  _handleWSMessage(msg) {
    console.log('[PAIR-WS] msg:', msg.type);

    if (this._wsPairTimeout) {
      clearTimeout(this._wsPairTimeout);
      this._wsPairTimeout = null;
    }

    switch (msg.type) {
      case 'pair_accepted':
        const sessionId = msg.session_id || msg.sessionId || Date.now().toString(36);
        app.globalData.serverUrl = this.data.inputServerUrl;
        app.globalData.sessionId = sessionId;
        app.globalData.paired = true;
        app.globalData.connectMode = 'websocket';
        app.globalData.connected = true;

        wx.setStorageSync('serverUrl', this.data.inputServerUrl);
        wx.setStorageSync('sessionId', sessionId);
        wx.setStorageSync('connectMode', 'websocket');

        this.setData({
          wsConnecting: false,
          paired: true,
          connected: true,
          serverUrl: this.data.inputServerUrl,
          wsStatusMsg: '',
        });

        wx.showToast({ title: '配对成功！', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
        break;

      case 'pair_rejected':
        this.setData({
          wsConnecting: false,
          wsStatusError: true,
          wsStatusMsg: msg.reason || '配对码不匹配，请检查后重试',
        });
        break;

      case 'pong':
        break;

      default:
        break;
    }
  },

  _handleWSStatus(status) {
    if (!status.connected && this.data.wsConnecting) {
      this.setData({
        wsConnecting: false,
        wsStatusError: true,
        wsStatusMsg: status.message || '连接中断',
      });
    }
  },

  // ==================== 断开连接 ====================

  unpair() {
    wx.showModal({
      title: '断开 WiFi 连接',
      content: '确定要断开与电脑的 WiFi 连接吗？',
      success: (res) => {
        if (res.confirm) {
          WSManager.disconnect();
          app.globalData.paired = false;
          app.globalData.sessionId = null;
          app.globalData.serverUrl = '';
          app.globalData.connectMode = 'standalone';
          app.globalData.connected = false;
          wx.removeStorageSync('sessionId');
          wx.removeStorageSync('connectMode');
          wx.removeStorageSync('serverUrl');

          this.setData({
            paired: false,
            connected: false,
          });

          wx.showToast({ title: '已断开', icon: 'success' });
        }
      },
    });
  },

  // ==================== 分享 ====================

  onShareAppMessage() {
    return {
      title: 'ScanBridge - 手机扫码，电脑自动接收',
      path: '/pages/pair/pair',
    };
  },
});
