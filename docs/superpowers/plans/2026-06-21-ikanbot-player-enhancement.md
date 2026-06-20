# ikanbot Player Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成可直接安装的 ikanbot Video.js 播放器增强用户脚本，并以 Node 内置测试验证核心行为。

**Architecture:** 单个用户脚本包含无副作用的规则函数和浏览器启动器。启动器通过 MutationObserver 对延迟/重建 DOM 做幂等同步，通过 localStorage 按页面 ID 保存进度；纯规则函数在 Node 中导出供测试使用。

**Tech Stack:** JavaScript ES2020、Tampermonkey、DOM/Video API、Node.js `node:test`

---

### Task 1: 核心规则测试

**Files:**
- Create: `test/ikanbot-player-enhancer.test.js`
- Create: `package.json`

- [ ] 编写 17 项测试，覆盖页面 ID、跳转、可编辑焦点、保存、清除和恢复。
- [ ] 运行 `node --test`，确认因 `ikanbot-player-enhancer.user.js` 尚不存在而失败。

### Task 2: 用户脚本实现

**Files:**
- Create: `ikanbot-player-enhancer.user.js`

- [ ] 添加严格的 userscript 元数据，只匹配目标播放页且不申请特权。
- [ ] 实现页面 ID、存储读写、片尾清除、跳转和焦点过滤函数。
- [ ] 实现幂等 Video.js 按钮挂载、方向键处理和播放器替换处理。
- [ ] 实现 5 秒定时保存以及 pause、ended、visibilitychange、pagehide、beforeunload 保存。
- [ ] 运行 `node --test`，确认全部测试通过。

### Task 3: 安装说明和静态验证

**Files:**
- Create: `README.md`

- [ ] 写明 Chrome/Edge + Tampermonkey 安装、功能、数据位置和限制。
- [ ] 运行 `node --check ikanbot-player-enhancer.user.js`。
- [ ] 扫描 `fetch`、XHR、WebSocket、sendBeacon、GM 网络 API 和媒体地址读取模式，确认实现中不存在网络行为。
- [ ] 再次运行 `npm test`，确认最终状态通过。
