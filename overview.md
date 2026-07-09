# ScanBridge 项目概述

## 项目定位

手机扫码 → 自动发送到电脑的微信小程序，灵感来自 Binary Eye。

## 当前版本：v4.0

### 三种模式

| 模式 | 说明 |
|------|------|
| 独立扫码 | 扫码后复制到剪贴板，手动粘贴 |
| 剪贴板同步 | 微信输入法跨设备同步（零配置） |
| WiFi 配对 | 局域网 WebSocket 自动发送到电脑 |

## 架构

```
手机小程序 ──WebSocket──→ Node.js服务器 ──→ 浏览器接收端
                           (端口 8080)       (自动复制剪贴板)
```

## 文件清单

### 小程序端 (`miniprogram/`)
- `app.js` — 全局逻辑，三模式管理
- `app.json` — 页面路由、TabBar、权限声明
- `utils/websocket.js` — WebSocket 管理器
- `utils/store.js` — 本地 + 云数据库存储
- `pages/scan/` — 扫码主页
- `pages/pair/` — WiFi 配对页面
- `pages/history/` — 扫码历史
- `pages/settings/` — 设置 + 下载引导
- `cloudfunctions/` — 云函数（可选）
- `icon.png` / `icon_144.png` — 小程序头像

### 服务器 (`server/`)
- `server.js` — Node.js WebSocket 中继 + 网页托管
- `public/index.html` — 网页版接收端
- `package.json` — 依赖 + pkg 打包配置

### 桌面打包 (`desktop/`)
- `build-pkg.bat` — PKG 打包为 exe
- `start-server.bat` — 直接启动服务器
- `build.ps1` — PowerShell 打包脚本
- `README.md` — 打包说明

## 关键决策记录

1. **v4.0 移除 BLE 蓝牙**：Windows BLE Peripheral 支持不稳定，Python bless 库不兼容 3.12+
2. **v4.0 新增剪贴板同步**：利用微信输入法跨设备传输，零配置
3. **PKG 替代 Electron**：体积 37MB vs 150MB，国内网络可下载
4. **纯文本配对码**：不使用 QR 码，避免伪 QR 引起误解
