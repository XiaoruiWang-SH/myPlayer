# myPlayer

macOS 本地音频播放器 —— 打开即播、键盘友好、没有多余功能。

只播放本地 MP3 文件：无账号、无网络依赖、无在线曲库。适合边工作边听音乐、播客或有声书，所有高频操作都能仅靠键盘完成。

## 功能特性

- **播放核心**：播放/暂停、进度拖拽跳转、音量、静音、播放速度（0.5x–2.0x）
- **播放列表**：添加/删除/清空、点击切歌、上一首/下一首、三档循环模式（列表循环 / 单曲循环 / 顺序播放）
- **文件接入**：⌘O 打开文件对话框、拖拽 MP3 进窗口
- **自定义步长**：快进/快退步长可在设置中调整（1–120 秒，默认 5 秒）
- **状态记忆**：退出时记住播放列表、曲目、进度、音量、速度、循环模式，下次启动自动恢复；播放中定期落盘，异常退出也能大致恢复
- **媒体键**：响应键盘/耳机媒体键，接入 macOS「正在播放」（控制中心/锁屏可见）
- **纯本地**：不发起任何网络请求，不采集任何数据

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `空格` | 播放 / 暂停 |
| `←` / `→` | 快退 / 快进（步长 = 设置值，默认 5 秒） |
| `↑` / `↓` | 音量 +5% / −5% |
| `⌘←` / `⌘→` | 上一首 / 下一首 |
| `M` | 静音开关 |
| `L` | 切换循环模式 |
| `⌘O` | 打开文件添加到列表 |
| `⌘,` | 打开设置 |

## 技术栈

- **Electron** + **TypeScript**
- **electron-vite**：main / preload / renderer 三进程统一构建
- **HTML5 `<audio>`**：Chromium 原生解码 MP3，无需额外解码库
- **原生 DOM 渲染**：无 UI 框架，保持体积小、依赖少
- **electron-store**：设置与播放状态持久化
- **electron-builder**：打包 macOS dmg/zip（arm64 + x64）

## 开发

```bash
npm install
npm run dev        # electron-vite dev，渲染层 HMR
npm run typecheck  # tsc --noEmit
npm run test       # Vitest 单元测试
npm run build      # electron-vite 构建
npm run dist       # 构建并用 electron-builder 打包
```

要求 macOS 12 Monterey 及以上，同时支持 Apple Silicon 与 Intel。

## 项目结构

```
myPlayer/
├── docs/
│   ├── PRD.md               # 产品需求文档
│   └── TECHNICAL_DESIGN.md  # 技术设计文档
└── src/
    ├── shared/              # 跨进程共享类型
    ├── main/                # 主进程：生命周期、IPC、持久化、菜单
    ├── preload/             # contextBridge 暴露受限 API
    └── renderer/            # 渲染层：播放器核心、列表、快捷键、UI
```

详细架构设计见 [docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md)。

## 当前状态

v1.0 已发布（2026-08-27）：功能完整，PRD §8 验收全部通过。`npm run dist` 产出安装包于 `release/`（dmg + zip，arm64 + x64）；应用未签名，首次打开请右键 → 打开。

## 路线图

| 版本 | 内容 |
| --- | --- |
| v1.0 | 本地 MP3 播放 + 简单播放列表 + 快捷键 + 步长设置 + 状态记忆 + 媒体键 |
| v1.1（候选） | 列表拖拽排序、更多格式（M4A/AAC）、自定义快捷键、音量步长设置 |
| v2.0（候选） | 文件夹曲库、菜单栏常驻、歌词显示 |
