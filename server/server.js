// server.js - ScanBridge WebSocket 中继服务器
// 负责管理设备配对、消息路由、心跳保活
//
// 启动方式: node server.js
// 默认端口: 8080
// 生产环境建议配合 nginx 做 TLS 终结 (wss://)

const { WebSocketServer } = require('ws');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// 会话存储：sessionId -> { desktop: ws, miniapps: Set<ws>, code: string }
const sessions = new Map();

// 配对码 -> sessionId 的映射（用于快速查找）
const codeToSession = new Map();

// 客户端 -> sessionId 的反向映射（用于断开时清理）
const clientToSession = new Map();

// 生成 6 位配对码
function generateSessionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (codeToSession.has(code));
  return code;
}

// 生成 sessionId
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// 发送消息给客户端
function sendMessage(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// 广播给会话中的所有小程序客户端
function broadcastToMiniApps(session, message, excludeWs = null) {
  if (session.miniapps) {
    for (const ws of session.miniapps) {
      if (ws !== excludeWs && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  }
}

// 获取本机真实局域网 IP（排除 VPN、虚拟机等虚拟网卡）
function getLocalIP() {
  const interfaces = require('os').networkInterfaces();
  
  // 虚拟网卡关键词（排除这些）
  const virtualKeywords = [
    'vpn', 'virtual', 'vmware', 'vbox', 'virtualbox', 
    'hyper-v', 'wsl', 'docker', 'tunnel', 'wireguard',
    'inode', 'loopback', 'tun', 'tap',
  ];
  
  // 优先级：Wi-Fi/WLAN > 以太网 > 其他真实网卡
  const preferredKeywords = ['wi-fi', 'wlan', 'wireless', '无线', '以太网', 'ethernet', 'en0', 'en1'];
  
  let candidates = [];
  
  for (const name of Object.keys(interfaces)) {
    const nameLower = name.toLowerCase();
    
    // 跳过虚拟网卡
    const isVirtual = virtualKeywords.some(k => nameLower.includes(k));
    if (isVirtual) continue;
    
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.family === 'IPv4') {
        // 跳过明显的虚拟网段：192.168.56.x (VirtualBox), 192.168.136.x (VMware), 192.168.68.x (VMware)
        const ip = iface.address;
        if (ip.startsWith('192.168.56.') || ip.startsWith('192.168.136.') || ip.startsWith('192.168.68.') || ip.startsWith('192.168.201.') || ip.startsWith('192.168.202.')) continue;
        
        const isPreferred = preferredKeywords.some(k => nameLower.includes(k));
        candidates.push({ name, ip, priority: isPreferred ? 1 : 2 });
      }
    }
  }
  
  // 按优先级排序，返回最可能的真实 IP
  candidates.sort((a, b) => a.priority - b.priority);
  
  if (candidates.length > 0) {
    return candidates[0].ip;
  }
  return 'localhost';
}

// 获取所有真实局域网 IP（供用户选择）
function getAllRealIPs() {
  const interfaces = require('os').networkInterfaces();
  const virtualKeywords = ['vpn', 'virtual', 'vmware', 'vbox', 'virtualbox', 'hyper-v', 'wsl', 'docker', 'tunnel', 'wireguard', 'inode', 'tun', 'tap'];
  const result = [];
  
  for (const name of Object.keys(interfaces)) {
    const nameLower = name.toLowerCase();
    const isVirtual = virtualKeywords.some(k => nameLower.includes(k));
    if (isVirtual) continue;
    
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.family === 'IPv4') {
        const ip = iface.address;
        if (ip.startsWith('192.168.56.') || ip.startsWith('192.168.136.') || ip.startsWith('192.168.68.') || ip.startsWith('192.168.201.') || ip.startsWith('192.168.202.')) continue;
        result.push({ name, ip });
      }
    }
  }
  return result;
}

// 创建 HTTP 服务器（用于健康检查 + 托管网页端接收器）
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      sessions: sessions.size,
      uptime: process.uptime(),
    }));
  } else if (req.url === '/' || req.url === '/index.html') {
    // 托管网页版接收器
    const filePath = path.join(__dirname, 'public', 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  } else if (req.url === '/api/ips') {
    // 返回真实局域网 IP 列表（供小程序配置参考）
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      recommended: localIP,
      all: allIPs,
      port: PORT,
      recommendedWsUrl: `ws://${localIP}:${PORT}`,
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[CONNECT] ${clientIp}`);

  // 心跳超时检测
  let lastPing = Date.now();
  const heartbeatCheck = setInterval(() => {
    if (Date.now() - lastPing > 60000) {
      console.log('[TIMEOUT] client heartbeat timeout');
      ws.terminate();
    }
  }, 30000);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      console.error('[ERROR] invalid message format:', e.message);
      return;
    }

    lastPing = Date.now();

    switch (msg.type) {
      // ---- 桌面客户端注册 ----
      case 'register_desktop': {
        const existingSessionId = msg.sessionId;  // 尝试恢复旧会话

        // 如果提供了旧 sessionId 且会话仍然存在，恢复它
        if (existingSessionId && sessions.has(existingSessionId)) {
          const oldSession = sessions.get(existingSessionId);
          // 检查旧桌面连接是否还在
          if (oldSession.desktop && oldSession.desktop.readyState === oldSession.desktop.OPEN) {
            // 旧连接仍在，拒绝重复注册（可能在多个标签页打开了页面）
            oldSession.desktop.close(4001, 'duplicate connection');
          }
          // 替换桌面连接
          oldSession.desktop = ws;
          clientToSession.set(ws, existingSessionId);
          // 清除旧的清理定时器（因为重新连接了）
          if (oldSession._cleanupTimer) {
            clearTimeout(oldSession._cleanupTimer);
            oldSession._cleanupTimer = null;
          }
          console.log(`[DESKTOP] resumed session=${existingSessionId} code=${oldSession.code}`);
          sendMessage(ws, {
            type: 'registered',
            sessionId: existingSessionId,
            code: oldSession.code,
            resumed: true,
          });
          break;
        }

        // 新注册
        const sessionId = generateSessionId();
        const code = generateSessionCode();

        const session = {
          sessionId,
          code,
          desktop: ws,
          miniapps: new Set(),
          createdAt: Date.now(),
        };

        sessions.set(sessionId, session);
        codeToSession.set(code, sessionId);
        clientToSession.set(ws, sessionId);

        console.log(`[DESKTOP] registered session=${sessionId} code=${code}`);
        sendMessage(ws, {
          type: 'registered',
          sessionId,
          code,
        });
        break;
      }

      // ---- 小程序配对请求 ----
      case 'pair_request': {
        // 兼容 sessionCode 和 code 两种字段名
        const pairCode = msg.sessionCode || msg.code;
        const sessionId = codeToSession.get(pairCode);

        if (!pairCode) {
          sendMessage(ws, {
            type: 'pair_error',
            message: '缺少配对码',
          });
          return;
        }

        if (!sessionId) {
          sendMessage(ws, {
            type: 'pair_rejected',
            reason: '配对码无效或已过期',
          });
          return;
        }

        const session = sessions.get(sessionId);
        if (!session || !session.desktop || session.desktop.readyState !== session.desktop.OPEN) {
          sendMessage(ws, {
            type: 'pair_rejected',
            reason: '电脑端未连接或已离线',
          });
          return;
        }

        // 将小程序加入会话
        session.miniapps.add(ws);
        clientToSession.set(ws, sessionId);

        console.log(`[PAIR] miniapp paired to session=${sessionId}`);

        // 通知小程序配对成功
        sendMessage(ws, {
          type: 'pair_accepted',
          session_id: sessionId,
          code: pairCode,
        });

        // 通知桌面端有设备配对
        sendMessage(session.desktop, {
          type: 'miniapp_connected',
          sessionId,
          count: session.miniapps.size,
        });
        break;
      }

      // ---- 扫码结果转发 ----
      case 'scan_result': {
        const { sessionId, data } = msg;
        const session = sessions.get(sessionId);

        if (!session) {
          sendMessage(ws, {
            type: 'delivery_failed',
            message: '会话不存在',
            data,
          });
          return;
        }

        if (!session.desktop || session.desktop.readyState !== session.desktop.OPEN) {
          sendMessage(ws, {
            type: 'delivery_failed',
            message: '电脑端离线',
            data,
          });
          return;
        }

        // 转发给桌面端
        const delivered = sendMessage(session.desktop, {
          type: 'scan_result',
          data,
          from: clientIp,
        });

        // 回复小程序发送成功
        sendMessage(ws, {
          type: 'delivery_success',
          data,
          timestamp: Date.now(),
        });

        console.log(`[DELIVER] content="${data.content}" session=${sessionId}`);
        break;
      }

      // ---- 心跳 ----
      case 'ping': {
        sendMessage(ws, { type: 'pong' });
        break;
      }

      default:
        console.log(`[UNKNOWN] message type: ${msg.type}`);
    }
  });

  ws.on('close', () => {
    clearInterval(heartbeatCheck);
    console.log(`[DISCONNECT] ${clientIp}`);

    const sessionId = clientToSession.get(ws);
    if (!sessionId) return;

    const session = sessions.get(sessionId);
    if (!session) return;

    // 如果是桌面端断开
    if (session.desktop === ws) {
      console.log(`[DESKTOP_OFFLINE] session=${sessionId}`);

      // 通知所有小程序
      broadcastToMiniApps(session, {
        type: 'desktop_offline',
        message: '电脑端已断开',
      });

      // 清理会话
      // 给 30 秒宽限期，如果桌面端重连则恢复
      const cleanupTimer = setTimeout(() => {
        const currentSession = sessions.get(sessionId);
        if (currentSession && currentSession.desktop === ws) {
          // 清理配对码
          codeToSession.delete(session.code);
          // 清理小程序的反向映射
          for (const miniappWs of session.miniapps) {
            clientToSession.delete(miniappWs);
          }
          sessions.delete(sessionId);
          console.log(`[CLEANUP] session=${sessionId} removed`);
        }
      }, 30000);
      // 保存清理定时器引用，如果重连则取消
      session._cleanupTimer = cleanupTimer;
    } else {
      // 如果是小程序断开
      session.miniapps.delete(ws);

      // 通知桌面端
      if (session.desktop && session.desktop.readyState === session.desktop.OPEN) {
        sendMessage(session.desktop, {
          type: 'miniapp_disconnected',
          count: session.miniapps.size,
        });
      }
    }

    clientToSession.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[WS_ERROR]', err.message);
  });
});

const localIP = getLocalIP();
const allIPs = getAllRealIPs();

server.listen(PORT, () => {
  console.log('=================================');
  console.log('  ScanBridge Relay Server');
  console.log('=================================');
  console.log(`  WebSocket:   ws://0.0.0.0:${PORT}`);
  console.log(`  Health:      http://0.0.0.0:${PORT}/health`);
  console.log('');
  console.log('  --- 网页版接收端（推荐）---');
  console.log(`  本机打开:    http://localhost:${PORT}`);
  console.log('');
  console.log('  --- 手机连接地址（选其中一个）---');
  for (const item of allIPs) {
    console.log(`  ${item.name}: ws://${item.ip}:${PORT}`);
    console.log(`  ${item.name}: http://${item.ip}:${PORT}`);
  }
  if (allIPs.length === 0) {
    console.log('  ⚠ 未检测到真实局域网 IP，请手动检查');
    console.log(`  使用 VPN IP: http://${localIP}:${PORT} (可能手机无法访问)`);
  }
  console.log('');
  console.log(`  ★ 推荐手机填入: ws://${localIP}:${PORT}`);
  console.log('=================================');
  console.log('  等待连接...\n');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] closing server...');
  wss.clients.forEach((ws) => ws.terminate());
  server.close();
  process.exit(0);
});
