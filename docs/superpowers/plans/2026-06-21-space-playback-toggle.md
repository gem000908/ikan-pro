# Space Playback Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ikanbot 用户脚本增加空格键播放/暂停，并保留输入和交互控件的原生空格行为。

**Architecture:** 在单文件用户脚本中新增两个纯函数：`isInteractiveTarget(target)` 识别按钮/链接，`togglePlayback(video)` 封装播放状态切换。现有 `keydown` 监听继续负责找到当前 video，并分别路由方向键和空格键；所有新增纯函数通过 CommonJS 导出给 Node 内置测试。

**Tech Stack:** JavaScript ES2020、Tampermonkey DOM/Media API、Node.js `node:test`

---

### Task 1: 播放切换纯函数

**Files:**
- Modify: `test/ikanbot-player-enhancer.test.js`
- Modify: `ikanbot-player-enhancer.user.js`

- [ ] **Step 1: 写入失败测试**

在测试文件导入列表增加 `isInteractiveTarget` 和 `togglePlayback`，并追加：

```javascript
test('treats buttons, links, and button roles as interactive targets', () => {
  assert.equal(isInteractiveTarget({ nodeName: 'BUTTON', closest: () => null }), true);
  assert.equal(isInteractiveTarget({ nodeName: 'A', closest: () => null }), true);
  assert.equal(isInteractiveTarget({ nodeName: 'DIV', closest: () => ({}) }), true);
  assert.equal(isInteractiveTarget({ nodeName: 'DIV', closest: () => null }), false);
});

test('pauses a playing video', () => {
  let pauseCalls = 0;
  const video = { paused: false, ended: false, pause() { pauseCalls += 1; } };
  assert.equal(togglePlayback(video), true);
  assert.equal(pauseCalls, 1);
});

test('plays a paused or ended video', () => {
  let playCalls = 0;
  const video = { paused: true, ended: false, play() { playCalls += 1; } };
  assert.equal(togglePlayback(video), true);
  assert.equal(playCalls, 1);
});

test('handles rejected play promises without an unhandled rejection', async () => {
  const video = { paused: true, ended: false, play() { return Promise.reject(new Error('blocked')); } };
  assert.equal(togglePlayback(video), true);
  await new Promise((resolve) => setImmediate(resolve));
});

test('ignores an invalid playback target', () => {
  assert.equal(togglePlayback(null), false);
  assert.equal(togglePlayback({ paused: true }), false);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
& 'C:\Users\NoFuckingWay\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none test\ikanbot-player-enhancer.test.js
```

Expected: FAIL，提示 `isInteractiveTarget` 或 `togglePlayback` 不是函数。

- [ ] **Step 3: 实现最小纯函数**

在 `isEditableTarget` 后加入：

```javascript
function isInteractiveTarget(target) {
  if (!target) return false;
  const nodeName = String(target.nodeName || '').toUpperCase();
  if (nodeName === 'BUTTON' || nodeName === 'A') return true;
  try {
    return typeof target.closest === 'function'
      && Boolean(target.closest('button, a, [role="button"]'));
  } catch (_error) {
    return false;
  }
}

function togglePlayback(video) {
  if (!video) return false;
  try {
    if (!video.paused && !video.ended) {
      if (typeof video.pause !== 'function') return false;
      video.pause();
      return true;
    }
    if (typeof video.play !== 'function') return false;
    const playResult = video.play();
    if (playResult && typeof playResult.catch === 'function') playResult.catch(() => {});
    return true;
  } catch (_error) {
    return false;
  }
}
```

将两个函数加入 `api` 导出对象。

- [ ] **Step 4: 运行测试并确认 GREEN**

运行 Step 2 命令，预期全部测试通过且无未处理 Promise 拒绝。

### Task 2: 空格键事件路由

**Files:**
- Modify: `ikanbot-player-enhancer.user.js`

- [ ] **Step 1: 扩展现有 keydown 监听**

将监听器替换为以下路由逻辑：

```javascript
documentObject.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

  const isArrowKey = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
  const isSpaceKey = event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
  if (!isArrowKey && !isSpaceKey) return;
  if (isEditableTarget(event.target)) return;
  if (isSpaceKey && isInteractiveTarget(event.target)) return;

  const video = currentVideo && currentVideo.isConnected
    ? currentVideo
    : documentObject.querySelector('.video-js video');
  if (!video) return;

  event.preventDefault();
  if (isSpaceKey) togglePlayback(video);
  else seekBy(video, event.key === 'ArrowLeft' ? -10 : 10);
});
```

- [ ] **Step 2: 运行完整回归测试**

运行 Task 1 Step 2 命令，预期原有 18 项和新增 5 项共 23 项全部通过。

### Task 3: 版本、说明和最终验证

**Files:**
- Modify: `ikanbot-player-enhancer.user.js`
- Modify: `README.md`

- [ ] **Step 1: 更新版本和说明**

将 userscript `@version` 从 `1.0.0` 改为 `1.1.0`。在 README 功能列表加入：

```markdown
- 普通页面区域按空格键播放或暂停；输入和交互控件聚焦时保留原生行为。
```

- [ ] **Step 2: 执行语法检查**

```powershell
& 'C:\Users\NoFuckingWay\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check ikanbot-player-enhancer.user.js
```

Expected: exit code 0，无输出。

- [ ] **Step 3: 执行静态安全扫描**

确认源码不存在 `fetch(`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`sendBeacon`、GM 网络 API、`currentSrc`、`.src`、`createObjectURL`、`.m3u8` 或 `.mpd`。

- [ ] **Step 4: 执行最终测试**

运行 Task 1 Step 2 命令，预期 23 项测试全部通过、0 失败。

本目录不是 Git 仓库，因此本计划不包含提交步骤。
