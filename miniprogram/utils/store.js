// utils/store.js - 数据存储管理（云开发增强版）
// 支持两种模式：
//   1. 本地存储模式：wx.setStorageSync（无云开发环境时降级）
//   2. 云数据库模式：wx.cloud.database（推荐，支持多设备同步）

const STORAGE_KEY = 'scan_history';
const MAX_RECORDS = 500;
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5分钟内重复内容视为重复
const CLOUD_COLLECTION = 'scan_history';

let db = null;        // 云数据库实例
let useCloudDB = false; // 是否使用云数据库

const store = {
  // 初始化云数据库
  initCloudDB() {
    if (!wx.cloud) {
      console.warn('[STORE] no cloud SDK, using local storage');
      useCloudDB = false;
      return;
    }

    try {
      db = wx.cloud.database();
      useCloudDB = true;
      console.log('[STORE] cloud database initialized');
    } catch (e) {
      console.error('[STORE] cloud database init failed:', e);
      useCloudDB = false;
    }
  },

  // 获取所有历史记录
  async getHistory() {
    if (useCloudDB && db) {
      try {
        const { data } = await db.collection(CLOUD_COLLECTION)
          .orderBy('timestamp', 'desc')
          .limit(MAX_RECORDS)
          .get();
        return data;
      } catch (e) {
        console.error('[STORE] cloud query failed, falling back to local:', e);
      }
    }
    return wx.getStorageSync(STORAGE_KEY) || [];
  },

  // 添加一条记录（含查重和 SN 字段）
  async addRecord(record) {
    const now = Date.now();

    // ====== 查重：检查最近是否已扫过相同内容 ======
    const history = wx.getStorageSync(STORAGE_KEY) || [];
    const duplicate = history.find((r) =>
      r.content === record.content && (now - r.timestamp) < DEDUP_WINDOW_MS
    );

    const sn = record.sn || null;
    const deviceModel = record.deviceModel || '';
    const tags = record.tags || [];
    const snDetected = !!sn;

    const newRecord = {
      id: now + '_' + Math.random().toString(36).substr(2, 9),
      content: record.content,
      format: record.format || 'unknown',
      timestamp: record.timestamp || now,
      status: record.status || 'pending',
      // v2.0 新增字段
      sn,
      snDetected,
      deviceModel,
      tags,
      duplicate: !!duplicate,
      createdAt: new Date().toLocaleString('zh-CN'),
    };

    if (useCloudDB && db) {
      try {
        const cloudRecord = {
          content: newRecord.content,
          format: newRecord.format,
          timestamp: newRecord.timestamp,
          status: newRecord.status,
          sn, snDetected, deviceModel, tags, duplicate: !!duplicate,
          createdAt: newRecord.createdAt,
        };

        const { _id } = await db.collection(CLOUD_COLLECTION).add({ data: cloudRecord });
        newRecord._id = _id;
      } catch (e) {
        console.error('[STORE] cloud save failed, falling back to local:', e);
      }
    }

    // 同时保存本地一份
    history.unshift(newRecord);
    if (history.length > MAX_RECORDS) {
      history.length = MAX_RECORDS;
    }
    wx.setStorageSync(STORAGE_KEY, history);

    return newRecord;
  },

  // 更新记录状态
  async updateStatus(id, status) {
    if (useCloudDB && db) {
      try {
        // 云数据库记录用 _id 更新
        if (id.startsWith('_') || id.length > 20) {
          // 可能是云数据库的 _id
          await db.collection(CLOUD_COLLECTION).doc(id).update({
            data: { status },
          });
        }
      } catch (e) {
        console.error('[STORE] cloud update failed:', e);
      }
    }

    // 同步更新本地
    const history = wx.getStorageSync(STORAGE_KEY) || [];
    const record = history.find((r) => r.id === id || r._id === id);
    if (record) {
      record.status = status;
      wx.setStorageSync(STORAGE_KEY, history);
    }
  },

  // 更新记录（编辑标签/设备型号）
  async updateRecord(id, updates) {
    if (useCloudDB && db) {
      try {
        const cloudUpdates = {};
        if (updates.tags !== undefined) cloudUpdates.tags = updates.tags;
        if (updates.deviceModel !== undefined) cloudUpdates.deviceModel = updates.deviceModel;
        if (Object.keys(cloudUpdates).length > 0) {
          await db.collection(CLOUD_COLLECTION).doc(id).update({ data: cloudUpdates });
        }
      } catch (e) {
        console.error('[STORE] cloud update failed:', e);
      }
    }

    // 同步更新本地
    const history = wx.getStorageSync(STORAGE_KEY) || [];
    const record = history.find((r) => r.id === id || r._id === id);
    if (record) {
      if (updates.tags !== undefined) record.tags = updates.tags;
      if (updates.deviceModel !== undefined) record.deviceModel = updates.deviceModel;
      wx.setStorageSync(STORAGE_KEY, history);
    }
  },

  // 获取筛选后的历史记录
  async getFilteredHistory(filters = {}) {
    const history = await this.getHistory();
    let filtered = [...history];

    if (filters.hasSN === true) {
      filtered = filtered.filter((r) => r.snDetected);
    }
    if (filters.tag) {
      filtered = filtered.filter((r) => r.tags && r.tags.includes(filters.tag));
    }
    if (filters.deviceModel) {
      filtered = filtered.filter((r) => r.deviceModel === filters.deviceModel);
    }
    // 排除重复项
    if (filters.excludeDuplicates) {
      filtered = filtered.filter((r) => !r.duplicate);
    }

    return filtered;
  },

  // 删除单条记录
  async deleteRecord(id) {
    if (useCloudDB && db) {
      try {
        if (id.startsWith('_') || id.length > 20) {
          await db.collection(CLOUD_COLLECTION).doc(id).remove();
        }
      } catch (e) {
        console.error('[STORE] cloud delete failed:', e);
      }
    }

    let history = wx.getStorageSync(STORAGE_KEY) || [];
    history = history.filter((r) => r.id !== id && r._id !== id);
    wx.setStorageSync(STORAGE_KEY, history);
  },

  // 清空所有记录
  async clearHistory() {
    if (useCloudDB && db) {
      try {
        // 云数据库清空需要逐条删除（无批量删除 API）
        const { data } = await db.collection(CLOUD_COLLECTION)
          .limit(MAX_RECORDS)
          .get();

        const deletePromises = data.map((item) =>
          db.collection(CLOUD_COLLECTION).doc(item._id).remove()
        );
        await Promise.all(deletePromises);
        console.log('[STORE] cloud collection cleared');
      } catch (e) {
        console.error('[STORE] cloud clear failed:', e);
      }
    }

    wx.setStorageSync(STORAGE_KEY, []);
  },

  // 获取统计信息
  async getStats() {
    const history = await this.getHistory();
    return {
      total: history.length,
      sent: history.filter((r) => r.status === 'sent').length,
      failed: history.filter((r) => r.status === 'failed').length,
      pending: history.filter((r) => r.status === 'pending').length,
    };
  },

  // 格式化时间
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },
};

module.exports = store;
