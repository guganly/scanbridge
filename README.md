# ScanBridge — 手机扫码，电脑自动接收

> 灵感来源于 GitHub 开源项目 [Binary Eye](https://github.com/markusfisch/BinaryEye)，基于微信小程序生态重新设计。

## 它解决什么问题？

仓库盘点、设备巡检、实验室记录等场景中，需要反复扫设备上的条码/二维码（如 SN 号），然后录入到电脑 Excel。传统方式要么用手持扫码枪（贵），要么手机扫码后手动抄写（慢且易错）。

**ScanBridge 让手机变成一把无线扫码枪** —— 扫码结果自动发送到电脑，复制到剪贴板直接粘贴。

## 三种使用模式

| 模式 | 电脑端要求 | 体验 |
|------|------------|------|
| **独立扫码** | 无需电脑 | 扫码后复制到剪贴板，手动粘贴 |
| **剪贴板同步** | 安装微信输入法 | 扫码自动复制，跨设备同步到电脑剪贴板 |
| **WiFi 配对** | 运行 ScanBridge.exe | 扫码自动发送到电脑网页，自动复制剪贴板 |

## 快速开始

### 手机端（小程序）
1. 微信开发者工具打开 `miniprogram` 目录
2. 填入自己的 AppID
3. 预览到真机测试
4. 发布上线

### 电脑端（三选一）

**方式一：下载 exe（推荐）**
- 下载 `ScanBridge.exe`（微云链接在小程序设置页）
- 双击运行，自动打开浏览器显示配对码

**方式二：Node.js 直接运行**
```bash
cd server
npm install
node server.js
```
浏览器打开 `http://localhost:8080`

**方式三：打包 exe**
```cmd
cd desktop
build-pkg.bat
```
生成 `server/dist/ScanBridge.exe`（约 37MB）

## 使用流程

1. 电脑端启动后显示 6 位配对码
2. 手机小程序 → 设置 → 选择「WiFi 配对」
3. 输入服务器地址（如 `ws://192.168.5.27:8080`）和配对码
4. 配对成功！扫码后结果自动到达电脑，Ctrl+V 粘贴到 Excel

## 项目结构

```
scanbridge/
├── miniprogram/              # 微信小程序
│   ├── app.js               # 全局逻辑（三模式管理）
│   ├── app.json             # 页面路由、TabBar
│   ├── app.wxss             # 全局样式
│   ├── pages/
│   │   ├── scan/            # 扫码主页
│   │   ├── pair/            # WiFi 配对页面
│   │   ├── history/         # 扫码历史
│   │   └── settings/        # 设置（模式切换 + 下载引导）
│   ├── utils/
│   │   ├── websocket.js     # WebSocket 管理器
│   │   └── store.js         # 本地 + 云数据库存储
│   ├── cloudfunctions/      # 云函数（可选）
│   ├── icon.png             # 小程序头像（1024x1024）
│   └── icon_144.png         # 小程序头像（144x144）
│
├── server/                   # WebSocket 中继服务器
│   ├── server.js            # Node.js 服务器 + 网页托管
│   ├── public/
│   │   └── index.html       # 网页版接收端
│   └── package.json         # 依赖 + pkg 打包配置
│
├── desktop/                  # 桌面端打包工具
│   ├── build-pkg.bat        # PKG 打包脚本（推荐）
│   ├── start-server.bat     # 直接启动脚本
│   ├── build.ps1            # PowerShell 打包脚本
│   └── README.md            # 打包说明
│
└── docs/
    └── 云开发部署指南.md      # 云开发部署流程（可选）
```

## 技术架构

```
┌─────────────────┐         ┌──────────────────────┐
│   手机小程序     │  WiFi   │  电脑端              │
│   (微信扫码)     │ ◄─────► │  ScanBridge.exe      │
│                 │  WS     │  ├─ Node.js 服务器    │
│  扫码 → 发送    │         │  ├─ WebSocket:8080   │
│  结果 → 剪贴板  │         │  └─ 浏览器接收页面    │
└─────────────────┘         └──────────────────────┘
```

## 技术栈

- **小程序端**：微信原生开发（WXML/WXSS/JS），`wx.scanCode` API
- **服务器**：Node.js + `ws` 库，单文件无外部依赖
- **网页接收端**：纯 HTML/JS，localStorage 持久化，Wake Lock API
- **桌面打包**：`pkg` 编译 Node.js 为单文件 exe（约 37MB）

## 微信审核注意事项

1. **权限声明**：仅申请 `scope.camera`（扫码用），无蓝牙/位置等敏感权限
2. **隐私合规**：不收集用户个人信息，扫码数据仅本地存储
3. **服务类目**：建议选择「工具 > 效率」
4. **服务器域名**：如使用云端部署，需在小程序后台配置 `wss://` 域名白名单
5. **本地调试**：开发阶段可在开发者工具中勾选「不校验合法域名」

## 许可证

MIT License

## 致谢

- [Binary Eye](https://github.com/markusfisch/BinaryEye) — 原始灵感来源
- [ws](https://github.com/websockets/ws) — Node.js WebSocket 库
- [pkg](https://github.com/vercel/pkg) — Node.js 打包工具
- 微信小程序 `wx.scanCode` API
