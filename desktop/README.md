# ScanBridge 电脑端 - 使用 & 打包指南

## 快速开始（给最终用户）

### 方式一：直接运行（推荐，无需打包）
1. 双击 `start-server.bat`
2. 自动打开浏览器，显示 6 位配对码
3. 手机小程序配对后即可使用

**前提**：电脑需安装 Node.js（[下载](https://nodejs.org)）

### 方式二：打包为 exe（单文件，更便携）
运行打包脚本，生成 `ScanBridge.exe`：
```cmd
cd desktop
build-pkg.bat
```

成功后 `server/dist/ScanBridge.exe` 即可分发给用户。

---

## 开发者打包

### PKG 打包（推荐，国内可用 ~30MB exe）
```cmd
cd desktop
build-pkg.bat
```
使用 `pkg` 将 Node.js server 编译为单文件 exe。体积约 30MB，双击即用。

如果 PKG 也下载失败（网络问题），备选方案：**直接分发 server 文件夹 + start-server.bat**，用户自行安装 Node.js 即可。

### Electron 打包（可选，带 GUI 窗口 ~150MB exe）
```powershell
cd desktop
powershell -ExecutionPolicy Bypass -File build.ps1
```
需要稳定访问 GitHub 下载 Electron 二进制（国内网络可能失败）。

---

## 分发方式

### 给用户发 exe
1. 将 `server/dist/ScanBridge.exe` 上传到：
   - 公司文件服务器
   - GitHub Releases
   - 网盘（蓝奏云、阿里云盘等）
2. 用户下载后双击运行，浏览器自动打开配对页面

### 给用户发 zip（不需要 exe）
1. 打包以下文件为 zip：
   - `server/` 目录（含 server.js + public/index.html）
   - `desktop/start-server.bat`
2. 用户解压后双击 `start-server.bat`，自动启动服务

### 小程序端下载引导
在小程序设置页 → 「电脑端下载」区域：
- 修改 `settings.js` 中 `copyDownloadGuide()` 的下载链接
- 替换 `[请向管理员获取最新下载链接]` 为实际地址

---

## 文件说明
```
desktop/
├── start-server.bat   # ⭐ 直接运行（无需打包）
├── build-pkg.bat      # PKG 打包为 exe（推荐）
├── build.ps1          # Electron 打包（国内网络可能失败）
├── build.bat          # Electron 打包 CMD 版
├── main.js            # Electron 主进程
├── preload.js         # Electron 预加载
└── package.json       # Electron 依赖配置
```
