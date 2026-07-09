// pages/history/history.js - 历史记录页面（v2.0 筛选 + 标签编辑）
const store = require('../../utils/store.js');
const app = getApp();
const WSManager = require('../../utils/websocket.js');

Page({
  data: {
    history: [],
    stats: {},
    showActions: false,
    selectedId: '',
    selectedItem: null,
    // v2.0 筛选
    filterHasSN: false,
    filterTag: '',
    filterNoDup: false,
    allTags: [],        // 所有已有标签列表
    showAllTags: false,
    // 编辑设备型号
    showEditModel: false,
    editModelValue: '',
    editModelId: '',
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    const filters = {
      hasSN: this.data.filterHasSN || undefined,
      tag: this.data.filterTag || undefined,
      excludeDuplicates: this.data.filterNoDup || undefined,
    };
    const history = await store.getFilteredHistory(filters);
    const stats = await store.getStats();

    // 收集所有标签
    const allHistory = await store.getHistory();
    const tagSet = new Set();
    allHistory.forEach((item) => {
      if (item.tags && item.tags.length) {
        item.tags.forEach((t) => tagSet.add(t));
      }
    });

    const formattedHistory = history.map((item) => ({
      ...item,
      timeText: store.formatTime(item.timestamp),
      formatText: this.formatType(item.format),
    }));

    this.setData({
      history: formattedHistory,
      stats,
      allTags: Array.from(tagSet),
    });
  },

  formatType(format) {
    const map = {
      QR_CODE: 'QR码',
      EAN_13: '条形码',
      EAN_8: '条形码',
      CODE_128: '条形码',
      CODE_39: '条形码',
      DATA_MATRIX: 'DataMatrix',
      PDF_417: 'PDF417',
      unknown: '未知',
    };
    return map[format] || format;
  },

  // 点击记录项
  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.history.find((h) => h.id === id);
    this.setData({
      showActions: true,
      selectedId: id,
      selectedItem: item || null,
    });
  },

  // 复制内容
  copyItem() {
    const item = this.data.history.find((h) => h.id === this.data.selectedId);
    if (!item) return;
    wx.setClipboardData({
      data: item.content,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
        this.setData({ showActions: false });
      },
    });
  },

  // 发送记录（WiFi 配对模式下显示）
  async sendItem() {
    const item = this.data.selectedItem;
    if (!item) return;

    if (app.globalData.connectMode === 'websocket' && app.globalData.paired) {
      try {
        app.sendScanResult({
          result: item.content,
          scanType: item.format,
          sn: item.sn || null,
          deviceModel: item.deviceModel || '',
          tags: item.tags || [],
        });
        // 更新状态为已发送
        await store.updateStatus(item.id, 'sent');
        this.loadData();
        wx.showToast({ title: '已发送', icon: 'success' });
      } catch (err) {
        console.error('[HISTORY] send failed:', err);
        wx.showToast({ title: '发送失败', icon: 'none' });
      }
    } else {
      // 非 WiFi 模式：复制到剪贴板
      wx.setClipboardData({
        data: item.content,
        success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' }),
      });
    }

    this.setData({ showActions: false });
  },

  // 删除记录
  deleteItem() {
    wx.showModal({
      title: '删除记录',
      content: '确定要删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          store.deleteRecord(this.data.selectedId);
          this.loadData();
          this.setData({ showActions: false });
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      },
    });
  },

  // 关闭操作面板
  closeActions() {
    this.setData({ showActions: false });
  },

  // ====== v2.0 筛选 ======

  toggleFilterSN() {
    this.setData({ filterHasSN: !this.data.filterHasSN });
    this.loadData();
  },

  toggleFilterNoDup() {
    this.setData({ filterNoDup: !this.data.filterNoDup });
    this.loadData();
  },

  filterByTag(e) {
    const tag = e.currentTarget.dataset.tag;
    if (this.data.filterTag === tag) {
      this.setData({ filterTag: '' });
    } else {
      this.setData({ filterTag: tag });
    }
    this.loadData();
  },

  toggleAllTags() {
    this.setData({ showAllTags: !this.data.showAllTags });
  },

  // ====== v2.0 编辑设备型号 ======

  openEditModel(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.history.find((h) => h.id === id);
    if (!item) return;
    this.setData({
      showEditModel: true,
      editModelValue: item.deviceModel || '',
      editModelId: id,
    });
  },

  onEditModelInput(e) {
    this.setData({ editModelValue: e.detail.value });
  },

  async confirmEditModel() {
    await store.updateRecord(this.data.editModelId, { deviceModel: this.data.editModelValue.trim() });
    this.setData({ showEditModel: false });
    this.loadData();
  },

  cancelEditModel() {
    this.setData({ showEditModel: false });
  },

  // ====== v2.0 批量导出 CSV ======

  // 将字段值 CSV 转义处理
  escapeCsvField(value) {
    const str = value == null ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  },

  async exportCSV() {
    const allHistory = await store.getHistory();
    if (allHistory.length === 0) {
      wx.showToast({ title: '没有可导出的记录', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '生成CSV...' });

    // 表头
    const headers = ['扫码内容', '类型', 'SN', '设备型号', '标签', '时间', '状态'];
    const rows = allHistory.map((item) => [
      this.escapeCsvField(item.content),
      this.escapeCsvField(this.formatType(item.format)),
      this.escapeCsvField(item.sn || ''),
      this.escapeCsvField(item.deviceModel || ''),
      this.escapeCsvField((item.tags || []).join(' ')),
      this.escapeCsvField(new Date(item.timestamp).toLocaleString('zh-CN')),
      this.escapeCsvField(item.status || ''),
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const fileName = `ScanBridge_${new Date().toISOString().slice(0, 10)}.csv`;
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

    try {
      const fs = wx.getFileSystemManager();
      fs.writeFileSync(filePath, csvContent, 'utf8');

      wx.hideLoading();
      wx.openDocument({
        filePath,
        fileType: 'csv',
        showMenu: true,
        success: () => {
          wx.showToast({ title: '导出成功', icon: 'success' });
        },
        fail: (err) => {
          console.error('openDocument failed:', err);
          wx.showToast({ title: '打开文件失败', icon: 'none' });
        },
      });
    } catch (err) {
      wx.hideLoading();
      console.error('exportCSV failed:', err);
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  // ====== 清空所有记录 ======
  clearAll() {
    if (this.data.history.length === 0) return;
    wx.showModal({
      title: '清空记录',
      content: '确定要清空所有扫码记录吗？此操作不可恢复。',
      confirmColor: '#FA5151',
      success: (res) => {
        if (res.confirm) {
          store.clearHistory();
          this.loadData();
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      },
    });
  },
});
