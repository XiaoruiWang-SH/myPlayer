# myPlayer 技术设计文档

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.2（新增 v1.1 转录模块设计，待评审） |
| 日期 | 2026-08-27 |
| 关联文档 | [PRD.md](./PRD.md) |
| 技术栈 | Electron + TypeScript + Vite |

---

## 1. 技术选型

| 决策项 | 选择 | 理由 |
| --- | --- | --- |
| 应用框架 | **Electron**（最新稳定版） | 用户指定。生态成熟，HTML5 音频能力完整，跨平台潜力保留 |
| 音频播放 | **HTML5 `<audio>` 元素** | Chromium 原生解码 MP3，无需引入解码库；`playbackRate`、`seek`、`volume` 均为原生能力。Web Audio API 仅在需要音效处理时才有必要，v1.0 不用 |
| 构建工具 | **electron-vite** | 官方推荐的 Electron + Vite 集成方案，main/preload/renderer 三进程统一构建 |
| 语言 | **TypeScript** | 类型安全，IPC 接口与渲染层共享类型定义 |
| 渲染层 UI | **原生 DOM + TS，无框架** | 界面简单（一个列表 + 控制栏），无框架可保持体积小、依赖少；若后续复杂度上升可平滑迁移到 Preact/Vue |
| 持久化 | **electron-store** | 基于 `app.getPath('userData')` 的 JSON 存储，API 简单，满足设置 + 状态记忆 |
| 打包 | **electron-builder** | 成熟稳定，产出 macOS dmg/zip，支持 arm64/x64 |
| 语音识别（v1.1） | **Deepgram Pre-recorded API**（`nova-3`、`language=en`、`smart_format`） | 用户已有密钥；速度快于实时（1 小时音频约 30–60 秒出结果）；提供词级时间戳，满足逐句同步；按量计费，配合本地缓存重复播放零费用 |

**与备选方案的取舍：** 原生 Swift+SwiftUI 体积与系统集成更优、Tauri 体积更小，但用户选择 Electron，主要换取 Web 技术栈的熟悉度与未来跨平台空间。代价（体积 ~100MB+、内存偏高）已记录在 PRD 非功能需求的预期内。

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────┐
│ Main 进程                                                │
│  ├─ 应用生命周期 / 窗口管理                                │
│  ├─ 文件打开对话框（dialog）                               │
│  ├─ 持久化（electron-store：设置 + 播放状态）              │
│  ├─ 应用菜单（含「设置…」入口）                            │
│  ├─ 媒体键兜底（globalShortcut，备用方案）                 │
│  └─ 转录服务（v1.1：Deepgram 请求 / 缓存 / 密钥加密）      │
└───────────────▲─────────────────────────────────────────┘
                │ IPC（contextBridge 暴露，白名单）
┌───────────────┴─────────────────────────────────────────┐
│ Preload 脚本                                             │
│  └─ contextBridge 暴露受限 API + webUtils.getPathForFile │
└───────────────▲─────────────────────────────────────────┘
                │ window.myPlayer（类型化接口）
┌───────────────┴─────────────────────────────────────────┐
│ Renderer 进程                                            │
│  ├─ Player 核心（封装 <audio>）                          │
│  ├─ Playlist 模型与列表渲染                               │
│  ├─ 快捷键管理器（keydown 分发）                          │
│  ├─ MediaSession（系统媒体键 / 正在播放）                 │
│  ├─ 文稿面板（v1.1：转录展示 / 高亮 / 点击跳转）           │
│  └─ UI（控制栏 / 进度条 / 设置弹窗 / Toast）              │
└──────────────────────────────────────────────────────────┘
```

**状态归属原则：** 播放状态的唯一事实来源在渲染层（`<audio>` 本身就是状态载体）；主进程只负责持久化快照和系统级能力，不参与播放逻辑。

## 3. 模块设计

### 3.1 Player 核心（renderer）

封装单个常驻 `<audio>` 元素：

```ts
class Player {
  play(): void
  pause(): void
  toggle(): void
  seekBy(deltaSec: number): void      // 快进快退，内部钳制到 [0, duration]
  seekTo(timeSec: number): void
  setVolume(v: number): void          // 0–1，步长在调用方处理
  toggleMute(): boolean
  setRate(rate: number): void         // 0.5–2.0
  load(filePath: string): Promise<void>
}
```

- 事件订阅：`timeupdate`（更新进度条，节流 ~250ms）、`ended`（交给循环模式处理）、`error`（提示并跳下一首）、`loadedmetadata`（时长）。
- 文件通过 `media://` 协议 URL 加载（主进程白名单校验，见 §5 安全）。

### 3.2 Playlist 模型（renderer）

```ts
interface Track {
  id: string            // 生成的一次性 id
  path: string          // 绝对路径
  name: string          // 文件名（不含扩展名）
  duration?: number     // 异步探测后填充
}

interface PlaylistState {
  items: Track[]
  currentIndex: number  // -1 表示未选中
  loopMode: 'list' | 'single' | 'sequential'  // 默认 'list'
}
```

- 添加时按 `path` 去重；非 `.mp3` 后缀直接拒绝（大小写不敏感）。
- 时长探测：用一个隐藏 `<audio preload="metadata">` 串行探测，避免同时创建大量元素；探测失败标记为不可播放。
- `ended` 处理逻辑：单曲循环 → 重播当前；列表循环 → 下一首（末尾回绕）；顺序播放 → 下一首，最后一首则停止。

### 3.3 快捷键管理器（renderer）

- 在 `window` 上监听 `keydown`，用映射表分发：

```ts
const SHORTCUTS: Array<{ combo: string; action: Action }> = [
  { combo: 'Space',        action: 'togglePlay' },
  { combo: 'ArrowLeft',    action: 'seekBackward' },
  { combo: 'ArrowRight',   action: 'seekForward' },
  { combo: 'ArrowUp',      action: 'volumeUp' },
  { combo: 'ArrowDown',    action: 'volumeDown' },
  { combo: 'Meta+ArrowLeft',  action: 'prevTrack' },
  { combo: 'Meta+ArrowRight', action: 'nextTrack' },
  { combo: 'KeyM',         action: 'toggleMute' },
  { combo: 'KeyL',         action: 'cycleLoopMode' },
  { combo: 'Meta+KeyO',    action: 'openFiles' },
  { combo: 'Meta+Comma',   action: 'openSettings' },
]
```

- 命中即 `preventDefault()`（防止空格/方向键滚动页面）。
- 焦点在 `<input>`/`<select>`/`<textarea>` 内时，跳过单字符类快捷键（Space、M、L），带修饰键的（⌘O、⌘,）仍生效。

### 3.4 持久化（main）

使用 electron-store，schema：

> electron-store 为 ESM-only 包，主进程产物是 CJS，因此在 `app.whenReady` 阶段用动态 `import()` 完成初始化；同步落盘通道依赖初始化完成后的实例。

```ts
interface PersistedData {
  settings: {
    seekStep: number        // 1–120，默认 5
  }
  secrets: {                // v1.1
    deepgramApiKey?: string // safeStorage 加密后的密文（base64）
  }
  playbackState: {
    playlist: string[]      // 文件路径数组（含顺序）
    currentIndex: number
    currentTime: number
    volume: number          // 0–100
    muted: boolean
    rate: number
    loopMode: 'list' | 'single' | 'sequential'
  }
}
```

**写入时机：**

1. 窗口卸载时（`beforeunload`，覆盖关窗口与 ⌘Q 退出路径）：渲染层经 `sendSync('state:save-sync')` 同步发送完整快照，保证退出前写入完成。
2. 播放中每 5 秒定期落盘一次 `currentTime`（基于 `timeupdate` 节流；崩溃保护，FR-22）。
3. 设置变更、音量/循环模式变更即时落盘。

**恢复流程（启动时）：** 渲染层初始化 → `state:load` 拉取快照 → 过滤失效文件（`fs.access` 校验放在主进程做一次，返回有效列表与被移除项）→ 恢复列表与各项状态 → 加载当前曲目但**保持暂停**。

### 3.5 媒体键与「正在播放」（renderer）

**首选方案：Chromium MediaSession API**

```ts
navigator.mediaSession.metadata = new MediaMetadata({ title: track.name })
navigator.mediaSession.setActionHandler('play', ...)
navigator.mediaSession.setActionHandler('pause', ...)
navigator.mediaSession.setActionHandler('previoustrack', ...)
navigator.mediaSession.setActionHandler('nexttrack', ...)
navigator.mediaSession.setActionHandler('seekto', ...)
// 每次 timeupdate 节流调用 setPositionState
```

MediaSession 激活后，macOS 控制中心「正在播放」会显示曲目信息，系统媒体键路由到本应用。

**兜底方案：** 若实测 Electron 版本下媒体键路由不稳定，改用主进程 `globalShortcut.register('MediaPlayPause' | 'MediaNextTrack' | 'MediaPreviousTrack')`，通过 IPC 转发到渲染层。两条路径不做同时启用，避免双重触发。

### 3.6 文件接入

| 方式 | 实现 |
| --- | --- |
| 打开对话框 | 菜单项 / ⌘O → 主进程 `dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'MP3', extensions: ['mp3'] }] })` → IPC 返回路径数组 → 渲染层加入列表 |
| 拖拽 | 渲染层监听 `dragover`（`preventDefault`）/ `drop` → 遍历 `e.dataTransfer.files` → 通过 preload 的 `webUtils.getPathForFile(file)` 取真实路径 → 过滤 `.mp3` → `allowPaths` 登记白名单 → 加入列表 |

> 注意：Electron 新版已废弃非标准的 `File.path` 属性，必须使用 `webUtils.getPathForFile`。

### 3.7 UI 结构

- `index.html` + 单一 `styles.css`，使用系统色变量（`-apple-system` 字体、`color-scheme: light dark`）自动适配深色模式。
- 模块文件：`ui/player-bar.ts`（控制栏）、`ui/playlist-view.ts`（列表渲染，DOM diff 从简——列表规模小，直接重建可接受）、`ui/settings-dialog.ts`、`ui/toast.ts`；v1.1 新增 `ui/transcript-view.ts`（文稿面板）。
- 布局（v1.1 起）：左右分栏——左侧边栏为播放列表，右侧为转录文稿面板，底部为贯穿全宽的进度条与控制栏；窗口最小尺寸相应提高。

### 3.8 转录文稿（v1.1）

**进程分工：** 网络请求、密钥、缓存全部在主进程（`main/transcript.ts`：Deepgram 的请求、解析、错误映射、缓存读写集中在该模块，未来接入其他 ASR 时在此整体替换）；渲染层只发起请求、消费结果并渲染。

**触发与编排：**

1. 渲染层在开始播放时（用户点击播放、自动切歌；启动恢复的暂停态不触发，待真正开始播放再触发）对当前曲目调用 `getTranscript(path)`。
2. 主进程处理顺序：查缓存 → 命中直接返回；未命中且未配置密钥 → 返回 `no-key`；否则读取文件请求 Deepgram，成功后写缓存并返回。
3. 防竞态：请求携带代际标记（当前曲目的路径），切歌后返回的过期结果直接丢弃；同一文件的进行中请求复用同一 Promise，不重复计费。

**Deepgram 调用：** `POST https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true`，请求头 `Authorization: Token <key>`、`Content-Type: audio/mpeg`，请求体为音频文件内容（目标时长 ≤ 1 小时，整文件读入内存可接受）。取响应 `results.channels[0].alternatives[0].words[]`（`word`/`punctuated_word`/`start`/`end`）。整体超时 5 分钟。

**词 → 句子聚合（shared 纯函数，可单测）：** 顺序累积词语，遇到句末标点（`. ? ! …`）或相邻词时间间隔 > 2 秒时收束为一个片段，产出 `TranscriptSegment { start, end, text }`。

**缓存：** 目录 `userData/transcripts/`；缓存键 = `路径 + 大小 + mtime` 拼接后的 SHA-1，文件名即键；「重新转录」（`force`）跳过读缓存并在成功后覆盖写入。

**密钥存储：** 设置弹窗新增 Deepgram 密钥区（填入/替换/清除，界面仅显示掩码）；`safeStorage.encryptString` 加密后写入 `secrets.deepgramApiKey`，仅在发起请求时解密，永不下发到渲染层。

**错误映射：**

| 情形 | 结果 |
| --- | --- |
| HTTP 401/403 | `unauthorized`：密钥无效，提示去设置检查 |
| HTTP 429 | `quota`：额度/频率受限 |
| 网络异常/超时 | `network` |
| 其他 | `unknown`（附服务端信息） |

所有错误只影响文稿面板（显示错误态 + 重试入口），不影响播放。

## 4. IPC 接口

全部通过 `contextBridge` 暴露在 `window.myPlayer` 上，共享类型定义在 `src/shared/types.ts`：

```ts
interface MyPlayerBridge {
  // invoke（请求-响应）
  openFiles(): Promise<string[]>
  allowPaths(paths: string[]): Promise<void>  // 拖拽路径登记进媒体白名单
  loadState(): Promise<PersistedData>
  saveState(state: PersistedData['playbackState']): Promise<void>
  saveStateSync(state: PersistedData['playbackState']): void  // 窗口卸载时的同步落盘通道
  getSettings(): Promise<PersistedData['settings']>
  setSettings(s: PersistedData['settings']): Promise<void>
  filterExisting(paths: string[]): Promise<{ valid: string[]; missing: string[] }>
  // 转录（v1.1）
  getTranscript(path: string, options?: { force?: boolean }): Promise<TranscriptResult>
  setDeepgramApiKey(key: string): Promise<void>
  clearDeepgramApiKey(): Promise<void>
  getDeepgramApiKeyStatus(): Promise<{ configured: boolean; maskedKey: string | null }>
  // on（主进程 → 渲染层事件）
  onMediaCommand(cb: (cmd: 'play-pause' | 'next' | 'previous') => void): () => void  // 兜底媒体键方案
  onOpenSettings(cb: () => void): () => void  // 菜单「设置…」入口
  // preload 工具
  getPathForFile(file: File): string
}
```

转录相关类型（同置于 `src/shared/types.ts`）：

```ts
interface TranscriptSegment { start: number; end: number; text: string }

type TranscriptResult =
  | { status: 'ok'; segments: TranscriptSegment[]; fromCache: boolean }
  | { status: 'no-key' }
  | { status: 'error'; code: 'unauthorized' | 'quota' | 'network' | 'unknown'; message: string }
```

主进程侧用 `ipcMain.handle` 逐个注册，不开放通用 `fs` 通道。`saveStateSync` 走 `ipcRenderer.sendSync('state:save-sync')`（主进程用 `ipcMain.on` 接收）：渲染层在 `beforeunload` 时调用，保证退出路径上落盘可靠。

## 5. 安全配置

| 配置 | 值 | 说明 |
| --- | --- | --- |
| `contextIsolation` | `true` | 强制 |
| `nodeIntegration` | `false` | 强制 |
| `sandbox` | `false` | preload 需要 `webUtils`/`contextBridge` 完整能力；其余隔离手段已覆盖风险 |
| `webSecurity` | `true` | 默认 |
| 本地文件访问 | `protocol.handle` 注册自定义 `media://` 协议（`app.ready` 前用 `registerSchemesAsPrivileged` 登记 `standard/secure/stream/supportFetchAPI/bypassCSP/corsEnabled` 权限）；处理器解析 Range 后用 `net.fetch` file URL 取切片，再包装为 206 响应（显式 `Content-Range`），保证进度跳转可用 | 渲染层加载音频走白名单协议，替代直接放开 `file://`，缩小暴露面。两处实测约束：权限缺 `standard` 时媒体管道会在重发请求后中断；直接透传 `net.fetch` 的 200 响应会使 `seekable` 失效 |
| `setWindowOpenHandler` | 拒绝所有新窗口 | 防止被内容劫持开窗 |
| 导航 | `will-navigate` 阻止 | 同上 |

v1.0 应用无网络请求；v1.1 起唯一网络出口为主进程在用户已配置密钥时对 `api.deepgram.com` 的转录请求（渲染层无任何直连外网路径）。菜单保留 About/设置…/Quit/编辑菜单（编辑菜单用于输入框）。

## 6. 构建、打包与发布

| 项 | 方案 |
| --- | --- |
| 开发 | `electron-vite dev`，渲染层 HMR |
| 类型检查 | `tsc --noEmit`（CI/提交前） |
| 打包 | `electron-builder`，target：`dmg` + `zip`；arch：`arm64` + `x64` |
| 签名/公证 | v1.0 自用不做；如需分发他人，需 Apple Developer 证书 + notarization（记录为发布前置条件） |
| 自动更新 | v1.0 不做 |

`electron-builder.yml` 关键项：`appId: com.example.myplayer`、`productName: myPlayer`、`mac.category: public.app-category.music`。

## 7. 目录结构

```
myPlayer/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json
├── docs/
│   ├── PRD.md
│   ├── TECHNICAL_DESIGN.md
│   └── PROGRESS.md
├── src/
│   ├── shared/
│   │   ├── types.ts           # 跨进程共享类型（IPC、持久化结构）
│   │   ├── audio-utils.ts     # 纯函数（进度钳制、时间格式化、音量步进）
│   │   ├── playlist-utils.ts  # 纯函数（MP3 过滤、去重键、循环模式前后首计算）
│   │   ├── shortcut-utils.ts  # 纯函数（按键事件 → 快捷键组合串）
│   │   ├── settings-utils.ts  # 纯函数（步长设置校验 1–120）
│   │   ├── transcript-utils.ts # v1.1 纯函数（词→句聚合、缓存键）
│   │   └── *.test.ts          # 以上纯函数的 Vitest 单测
│   ├── main/
│   │   ├── index.ts          # 生命周期、窗口创建
│   │   ├── ipc.ts            # ipcMain.handle 注册
│   │   ├── protocol.ts       # media:// 协议与路径白名单
│   │   ├── store.ts          # electron-store 封装
│   │   ├── menu.ts           # 应用菜单
│   │   ├── media-keys.ts     # globalShortcut 兜底方案（默认关闭）
│   │   └── transcript.ts     # v1.1 Deepgram 请求 / 缓存 / 密钥（唯一网络出口）
│   ├── preload/
│   │   └── index.ts          # contextBridge 暴露 window.myPlayer
│   └── renderer/
│       ├── index.html
│       ├── styles.css
│       └── src/
│           ├── global.d.ts        # window.myPlayer 全局类型声明
│           ├── main.ts            # 启动、列表/播放编排
│           ├── player.ts          # Player 核心
│           ├── playlist.ts        # Playlist 模型
│           ├── duration-prober.ts # 时长串行探测（隐藏 audio + 超时标记不可播）
│           ├── shortcuts.ts       # 快捷键管理器
│           ├── media-session.ts
│           └── ui/
│               ├── player-bar.ts
│               ├── playlist-view.ts
│               ├── settings-dialog.ts
│               ├── toast.ts
│               └── transcript-view.ts  # v1.1 文稿面板
└── resources/                # 应用图标等静态资源
```

## 8. 测试策略

| 层 | 方式 |
| --- | --- |
| 纯逻辑 | Vitest 单元测试：快捷键映射解析、步长钳制（`seekBy` 边界）、循环模式的下一首计算、设置校验（1–120）、词→句聚合（v1.1） |
| 集成 | 手动测试清单，直接对应 PRD §8 验收标准 |
| E2E | v1.0 暂不引入（Playwright + Electron 留作后续），以手动清单覆盖 |

## 9. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| Electron 中 MediaSession 对系统媒体键的支持随版本有差异 | 媒体键功能不可用 | 预留 `globalShortcut` 兜底路径（§3.5），M3 阶段实测决定走哪条 |
| `webUtils.getPathForFile` 在沙箱/新版中的可用性变化 | 拖拽功能失效 | 锁定 Electron 版本并写入 `package.json`；升级时回归拖拽用例 |
| 大列表时长探测慢 | 列表打开卡顿 | 串行 + 懒探测，先展示文件名后补时长 |
| 无签名应用首次打开被 Gatekeeper 拦截 | 自用无碍，分发给他人体验差 | 文档说明「右键打开」绕行；需要分发时补签名公证 |
| 渲染层直接访问本地文件的安全面 | 潜在越权读取 | 自定义 `media://` 协议限定可播放目录来源（仅限用户通过对话框/拖拽显式加入的路径，由主进程维护白名单） |
| Deepgram 服务不可用 / 定价调整（v1.1） | 转录不可用或费用变化 | 转录集中在 `main/transcript.ts`，可整体替换为其他 ASR；转录失败不影响播放 |
| 长音频上传耗时与内存（v1.1） | 1 小时音频约 30–80MB，上传期间有等待 | 目标场景 ≤1 小时，整文件上传可接受；5 分钟超时 + 「正在转录中…」状态 + 缓存消除重复等待 |
| API 密钥泄露（v1.1） | Deepgram 账户被盗用 | `safeStorage` 加密落盘、密钥不进渲染层、支持一键清除；密钥仅用于对 Deepgram 的请求头 |

## 10. 里程碑

| 里程碑 | 内容 | 对应需求 |
| --- | --- | --- |
| M1 脚手架与基础播放 | electron-vite 工程、窗口、`<audio>` 播放/暂停/进度/音量/静音/播放速度 | FR-01~06 |
| M2 播放列表与快捷键 | 列表增删切歌、循环模式、播放结束行为、⌘O/拖拽、全部快捷键 | FR-07、FR-09~15、快捷键表 |
| M3 设置与记忆 | 设置弹窗、步长自定义、状态持久化与恢复、媒体键（含兜底验证） | FR-16~24 |
| M4 打磨与发布 | 错误处理、深色模式、打包 dmg、按验收清单回归 | 全部验收标准 |
| M5 转录文稿（v1.1） | 密钥管理、Deepgram 接入与缓存、左右分栏布局、文稿同步高亮与点击跳转 | FR-25~31 |
