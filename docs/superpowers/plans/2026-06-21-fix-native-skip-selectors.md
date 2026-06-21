# Fix Native Skip Selectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide Video.js 8 built-in skip-backward and skip-forward controls while preserving the userscript controls.

**Architecture:** Extend the injected control-bar CSS to cover Video.js built-in skip class families and retain the legacy plugin selector. Protect userscript-owned controls with the existing `data-ikanbot-seek` marker and bump the release version so Tampermonkey detects the fix.

**Tech Stack:** Tampermonkey userscript, Video.js CSS, JavaScript, Node.js built-in test runner

---

### Task 1: Cover Video.js built-in skip controls

**Files:**
- Modify: `test/ikanbot-player-enhancer.test.js`
- Modify: `ikanbot-player-enhancer.user.js`

- [ ] **Step 1: Update regression tests first**

Change the metadata assertion to version `1.2.2`. Extend the existing injected-style assertion to require all three protected selector targets:

```js
assert.match(source, /^\/\/ @version\s+1\.2\.2$/m);

assert.match(
  appendedStyle.textContent,
  /\.video-js \.vjs-control-bar \[class\*="vjs-skip-backward-"\]:not\(\[data-ikanbot-seek\]\)/,
);
assert.match(
  appendedStyle.textContent,
  /\.video-js \.vjs-control-bar \[class\*="vjs-skip-forward-"\]:not\(\[data-ikanbot-seek\]\)/,
);
assert.match(
  appendedStyle.textContent,
  /\.video-js \.vjs-control-bar \.vjs-seek-button:not\(\[data-ikanbot-seek\]\)/,
);
```

- [ ] **Step 2: Verify the focused tests fail**

```powershell
node --test --test-isolation=none --test-name-pattern="versioned GitHub update metadata|player synchronization" test/ikanbot-player-enhancer.test.js
```

Expected: FAIL because the script is still `1.2.1` and the injected CSS lacks Video.js built-in skip selectors.

- [ ] **Step 3: Implement the minimal CSS and version change**

Set the metadata version to:

```js
// @version      1.2.2
```

Replace the single legacy hide rule with a comma-separated rule:

```js
'.video-js .vjs-control-bar [class*="vjs-skip-backward-"]:not([data-ikanbot-seek]),.video-js .vjs-control-bar [class*="vjs-skip-forward-"]:not([data-ikanbot-seek]),.video-js .vjs-control-bar .vjs-seek-button:not([data-ikanbot-seek]){display:none!important}',
```

- [ ] **Step 4: Run complete verification**

```powershell
node --test --test-isolation=none
node --check ikanbot-player-enhancer.user.js
git diff --check
```

Expected: 34 tests pass, syntax check exits 0, and no whitespace errors are reported.

- [ ] **Step 5: Commit**

```powershell
git add ikanbot-player-enhancer.user.js test/ikanbot-player-enhancer.test.js
git commit -m "fix: hide Video.js native skip controls"
```

