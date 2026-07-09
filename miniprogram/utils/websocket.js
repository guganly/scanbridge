// utils/websocket.js - WebSocket 连接管理器
// 封装 wx.connectSocket，支持自动重连、心跳保活、消息队列

const HEARTBEAT_INTERVAL = 25000; // 心跳间隔 25 秒
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000]; // 指数退避重连

class WSManager {
  constructor() {
    this.socket = null;
    this.url = '';
    this.connected = false;
    this.connecting = false;
    this.messageQueue = []; // 未连接时的消息队列
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.shouldReconnect = false; // 是否应该自动重连
    this.callbacks = {
      onMessage: null,
      onStatusChange: null,
    };
  }

  init(options) {
    this.url = options.url;
    this.callbacks.onMessage = options.onMessage || null;
    this.callbacks.onStatusChange = options.onStatusChange || null;
  }

  updateUrl(url) {
    this.url = url;
    if (this.connected) {
      this.disconnect();
      this.connect();
    }
  }

  connect() {
    if (this.connected || this.connecting) return;
    this.connecting = true;
    this.shouldReconnect = true;

    console.log('[WS] connecting to:', this.url);

    this.socket = wx.connectSocket({
      url: this.url,
      fail: (err) => {
        console.error('[WS] connect failed:', err);
        this.connecting = false;
        this._notifyStatus(false, '连接失败');
        this._scheduleReconnect();
      },
    });

    this.socket.onOpen(() => {
      console.log('[WS] connected');
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      this._notifyStatus(true, '已连接');
      this._startHeartbeat();
      this._flushQueue();
    });

    this.socket.onMessage((res) => {
      try {
        const msg = JSON.parse(res.data);
        console.log('[WS] message:', msg.type);
        if (this.callbacks.onMessage) {
          this.callbacks.onMessage(msg);
        }
      } catch (e) {
        console.error('[WS] parse message error:', e);
      }
    });

    this.socket.onClose((res) => {
      console.log('[WS] closed:', res.code, res.reason);
      this.connected = false;
      this.connecting = false;
      this._stopHeartbeat();
      this._notifyStatus(false, '连接已断开');
      if (this.shouldReconnect) {
        this._scheduleReconnect();
      }
    });

    this.socket.onError((err) => {
      console.error('[WS] error:', err);
      this.connecting = false;
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    this._stopHeartbeat();
    this._clearReconnectTimer();
    if (this.socket) {
      this.socket.close({ code: 1000, reason: 'user disconnect' });
      this.socket = null;
    }
    this.connected = false;
    this._notifyStatus(false, '已断开');
  }

  send(message) {
    const data = JSON.stringify(message);
    if (this.connected && this.socket) {
      this.socket.send({ data });
    } else {
      // 未连接时加入队列，连接后自动发送
      console.log('[WS] queued message:', message.type);
      this.messageQueue.push(data);
      if (!this.connecting) {
        this.connect();
      }
    }
  }

  _flushQueue() {
    while (this.messageQueue.length > 0) {
      const data = this.messageQueue.shift();
      this.socket.send({ data });
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this.send({ type: 'ping' });
      }
    }, HEARTBEAT_INTERVAL);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _scheduleReconnect() {
    if (!this.shouldReconnect) return;
    this._clearReconnectTimer();

    const delayIndex = Math.min(this.reconnectAttempts, RECONNECT_DELAYS.length - 1);
    const delay = RECONNECT_DELAYS[delayIndex];
    this.reconnectAttempts++;

    console.log(`[WS] reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  _clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  _notifyStatus(connected, message) {
    this.connected = connected;
    if (this.callbacks.onStatusChange) {
      this.callbacks.onStatusChange({ connected, message });
    }
  }
}

// 单例
module.exports = new WSManager();
