// pages/scan/scan.js - 扫码主页面（独立 + 剪贴板同步 + WiFi 配对）
const app = getApp();
const store = require('../../utils/store.js');
const { detectSN, detectDeviceModel } = require('../../utils/sn.js');
const WSManager = require('../../utils/websocket.js');

Page({
  data: {
    connectMode: 'standalone',
    wsPaired: false,

    // 扫码相关
    lastResult: null,
    lastResultTime: '',
    scanCount: 0,
    sending: false,
    sendStatus: '',     // '' | 'sending' | 'success' | 'failed'
    autoSend: true,
    autoCopy: true,
    showResult: false,

    // v2.0 新增：SN、标签
    lastRecordId: '',
    snInfo: null,        // { type, value } | null
    deviceModel: '',
    isDuplicate: false,
    showTagInput: false,
    tagInput: '',
  },

  async onLoad() {
    const stats = await store.getStats();
    this.setData({
      connectMode: app.globalData.connectMode,
      wsPaired: app.globalData.paired && app.globalData.connectMode === 'websocket',
      autoSend: app.globalData.settings.autoSend !== false,
      autoCopy: app.globalData.settings.autoCopy !== false,
      scanCount: stats.total || 0,
    });
  },

  onShow() {
    this.setData({
      connectMode: app.globalData.connectMode,
      wsPaired: app.globalData.paired && app.globalData.connectMode === 'websocket',
      autoSend: app.globalData.settings.autoSend !== false,
      autoCopy: app.globalData.settings.autoCopy !== false,
    });

    // 注册 WebSocket 回调（WiFi 模式需要）
    if (app.globalData.connectMode === 'websocket' && app.globalData.paired) {
      WSManager.init({
        onMessage: (msg) => {
          if (msg.type === 'delivery_success') {
            this.setData({ sendStatus: 'success', sending: false });
            if (this.data.lastResult) store.updateStatus(this.data.lastResult.id, 'sent');
            setTimeout(() => this.setData({ sendStatus: '' }), 1500);
          } else if (msg.type === 'delivery_failed') {
            this.setData({ sendStatus: 'failed', sending: false });
            setTimeout(() => this.setData({ sendStatus: '' }), 2000);
          }
        },
        onStatusChange: (status) => {
          this.setData({ wsPaired: status.connected });
          app.globalData.connected = status.connected;
          if (!status.connected) app.globalData.paired = false;
        },
      });
    }
  },

  onUnload() {
    // 清理
  },

  // 扫码
  startScan() {
    const scanTypeMap = {
      all: ['barCode', 'qrCode', 'datamatrix', 'pdf417'],
      qrCode: ['qrCode'],
      barCode: ['barCode'],
    };

    wx.scanCode({
      onlyFromCamera: true,
      scanType: scanTypeMap[app.globalData.settings.scanType] || scanTypeMap.all,
      success: (res) => this.handleScanResult(res),
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) return;
        wx.showToast({ title: '扫码失败', icon: 'none' });
      },
    });
  },

  // 处理扫码结果
  async handleScanResult(res) {
    const content = res.result;
    const sn = detectSN(content);
    const deviceModel = detectDeviceModel(content);

    const status = this.data.connectMode === 'websocket' ? 'pending' : 'local';
    const record = await store.addRecord({
      content,
      format: res.scanType,
      timestamp: Date.now(),
      status,
      sn: sn ? sn.value : null,
      deviceModel: deviceModel || '',
      tags: [],
    });

    const snInfo = sn ? { type: sn.type, value: sn.value } : null;

    this.setData({
      lastResult: { id: record.id, content, format: res.scanType },
      lastResultTime: store.formatTime(Date.now()),
      lastRecordId: record.id,
      scanCount: this.data.scanCount + 1,
      showResult: true,
      snInfo,
      deviceModel: deviceModel || '',
      isDuplicate: record.duplicate,
      showTagInput: false,
      tagInput: '',
      sendStatus: '',
      sending: false,
    });

    // 震动反馈
    if (app.globalData.settings.vibrate) {
      wx.vibrateShort({ type: 'medium' });
    }

    // 查重提示
    if (record.duplicate) {
      wx.showToast({ title: '重复内容，5分钟内已扫过', icon: 'none', duration: 2000 });
    }

    // 按模式处理
    if (this.data.connectMode === 'websocket') {
      if (this.data.autoSend && this.data.wsPaired) {
        this.sendToDesktop();
      }
    } else if (this.data.connectMode === 'clipboard') {
      if (this.data.autoCopy) {
        this.copyResult(false);
        this.setData({ sendStatus: 'success' });
        setTimeout(() => this.setData({ sendStatus: '' }), 1500);
      }
    }
  },

  // 发送到电脑（WiFi 模式）
  sendToDesktop() {
    if (!this.data.lastResult) {
      wx.showToast({ title: '没有可发送的内容', icon: 'none' });
      return;
    }

    if (this.data.connectMode === 'websocket') {
      this.setData({ sending: true, sendStatus: 'sending' });
      app.sendScanResult({
        result: this.data.lastResult.content,
        scanType: this.data.lastResult.format,
        sn: this.data.snInfo ? this.data.snInfo.value : null,
        deviceModel: this.data.deviceModel || '',
        tags: this.data.lastResult.tags || [],
      });
    } else {
      wx.showModal({
        title: '未配对电脑',
        content: '扫码结果已保存在手机上。如需自动发送到电脑，请在「设置」中选择 WiFi 配对模式。',
        confirmText: '去设置',
        cancelText: '知道了',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/settings/settings' });
        },
      });
    }
  },

  // 复制结果到剪贴板
  copyResult(silent = false) {
    if (!this.data.lastResult) return;
    app.copyToClipboard(this.data.lastResult.content).then(() => {
      if (!silent) {
        wx.showToast({
          title: this.data.connectMode === 'clipboard' ? '已同步到剪贴板' : '已复制到剪贴板',
          icon: 'success',
        });
      }
    }).catch(() => {
      if (!silent) wx.showToast({ title: '复制失败', icon: 'none' });
    });
  },

  // ====== v2.0 标签管理 ======

  // 打开标签输入框
  openTagInput() {
    this.setData({ showTagInput: true });
  },

  // 取消标签输入
  cancelTagInput() {
    this.setData({ showTagInput: false, tagInput: '' });
  },

  // 标签输入变化
  onTagInput(e) {
    this.setData({ tagInput: e.detail.value });
  },

  // 确认添加标签
  async confirmTag() {
    const tag = this.data.tagInput.trim();
    if (!tag) return;

    const tags = this.data.lastResult.tags || [];
    if (tags.includes(tag)) {
      wx.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    tags.push(tag);

    await store.updateRecord(this.data.lastRecordId, { tags });
    this.setData({
      'lastResult.tags': tags,
      showTagInput: false,
      tagInput: '',
    });
    wx.showToast({ title: '已添加标签', icon: 'success' });
  },

  // 编辑设备型号
  onDeviceModelInput(e) {
    const deviceModel = e.detail.value;
    this.setData({ deviceModel });
    store.updateRecord(this.data.lastRecordId, { deviceModel });
  },

  // 导航
  goToPair() {
    wx.navigateTo({ url: '/pages/pair/pair?mode=websocket' });
  },

  goToSettings() {
    wx.switchTab({ url: '/pages/settings/settings' });
  },

  goToHistory() {
    wx.switchTab({ url: '/pages/history/history' });
  },

  onShareAppMessage() {
    return {
      title: 'ScanBridge - 手机扫码，电脑自动接收',
      path: '/pages/scan/scan',
    };
  },
});
