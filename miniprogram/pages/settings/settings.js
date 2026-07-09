// pages/settings/settings.js - 设置页面（独立扫码 + 剪贴板同步 + WiFi 配对）
const app = getApp();

Page({
  data: {
    connectMode: 'standalone',
    // WebSocket 状态
    wsPaired: false,
    serverUrl: '',
    // 扫码设置
    scanType: 'all',
    autoSend: true,
    autoCopy: true,
    vibrate: true,
    sound: true,
    scanTypeOptions: [
      { value: 'all', label: '全部（推荐）' },
      { value: 'qrCode', label: '仅二维码' },
      { value: 'barCode', label: '仅条形码' },
    ],
  },

  onLoad() {
    this.setData({
      connectMode: app.globalData.connectMode,
      wsPaired: app.globalData.paired && app.globalData.connectMode === 'websocket',
      serverUrl: app.globalData.serverUrl || '',
      scanType: app.globalData.settings.scanType,
      autoSend: app.globalData.settings.autoSend !== false,
      autoCopy: app.globalData.settings.autoCopy !== false,
      vibrate: app.globalData.settings.vibrate !== false,
      sound: app.globalData.settings.sound !== false,
    });
  },

  onShow() {
    this.setData({
      wsPaired: app.globalData.paired && app.globalData.connectMode === 'websocket',
      serverUrl: app.globalData.serverUrl || '',
      connectMode: app.globalData.connectMode,
    });
  },

  // ==================== 模式切换 ====================

  switchToStandalone() {
    if (this.data.connectMode === 'standalone') return;

    if (app.globalData.paired) {
      wx.showModal({
        title: '切换模式',
        content: '切换到独立模式将断开 WiFi 连接，确定？',
        success: (res) => { if (res.confirm) this._doSwitchMode('standalone'); },
      });
    } else {
      this._doSwitchMode('standalone');
    }
  },

  switchToClipboard() {
    if (this.data.connectMode === 'clipboard') return;

    if (app.globalData.paired) {
      wx.showModal({
        title: '切换模式',
        content: '切换到剪贴板同步将断开 WiFi 连接，确定？',
        success: (res) => { if (res.confirm) this._doSwitchMode('clipboard'); },
      });
    } else {
      this._doSwitchMode('clipboard');
    }
  },

  switchToWebSocket() {
    if (this.data.connectMode === 'websocket') return;
    this._doSwitchMode('websocket');

    // 如果未配对，跳转到配对页面
    if (!app.globalData.paired) {
      wx.navigateTo({ url: '/pages/pair/pair?mode=websocket' });
    }
  },

  _doSwitchMode(mode) {
    app.setConnectMode(mode);
    this.setData({ connectMode: mode,
      wsPaired: mode === 'websocket' ? app.globalData.paired : false,
    });
  },

  // ==================== 去配对页面 ====================

  goToPair() {
    wx.navigateTo({ url: '/pages/pair/pair?mode=websocket' });
  },

  // ==================== 扫码设置 ====================

  onScanTypeChange(e) {
    const value = this.data.scanTypeOptions[e.detail.value].value;
    this.setData({ scanType: value });
    this.saveSetting('scanType', value);
  },

  onAutoSendChange(e) {
    this.setData({ autoSend: e.detail.value });
    this.saveSetting('autoSend', e.detail.value);
  },

  onAutoCopyChange(e) {
    this.setData({ autoCopy: e.detail.value });
    this.saveSetting('autoCopy', e.detail.value);
  },

  onVibrateChange(e) {
    this.setData({ vibrate: e.detail.value });
    this.saveSetting('vibrate', e.detail.value);
  },

  onSoundChange(e) {
    this.setData({ sound: e.detail.value });
    this.saveSetting('sound', e.detail.value);
  },

  saveSetting(key, value) {
    app.globalData.settings[key] = value;
    wx.setStorageSync('settings', app.globalData.settings);
  },

  // ==================== 缓存 & 关于 ====================

  copyDownloadGuide() {
    const downloadUrl = 'https://share.weiyun.com/r5QPVsJ6';
    wx.setClipboardData({
      data: downloadUrl,
      success: () => wx.showToast({ title: '已复制下载链接', icon: 'success' }),
    });
  },

  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '将清除所有本地数据（配对信息和扫码记录），确定？',
      confirmColor: '#FA5151',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          app.globalData.connectMode = 'standalone';
          app.globalData.paired = false;
          app.globalData.sessionId = null;
          app.globalData.serverUrl = '';

          try {
            const WSManager = require('../../utils/websocket.js');
            WSManager.disconnect();
          } catch(e) {}

          wx.showToast({ title: '已清除', icon: 'success' });
          setTimeout(() => wx.reLaunch({ url: '/pages/scan/scan' }), 1000);
        }
      },
    });
  },

  showAbout() {
    wx.showModal({
      title: '关于 ScanBridge',
      content: 'ScanBridge v5.0.0\n\n手机扫码，电脑接收。\n\n三种模式：\n① 独立扫码 - 扫码复制，手动粘贴\n② 剪贴板同步 - 微信输入法跨设备传输\n③ WiFi 配对 - 局域网自动发送到电脑\n\n灵感来源：Binary Eye (GitHub)\n扫码引擎：微信原生 scanCode',
      showCancel: false,
    });
  },
});
