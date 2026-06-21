# Hide Native Seek Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide Video.js's original circular 10-second seek buttons while preserving the userscript's `−10` and `+10` buttons and keyboard seeking.

**Architecture:** Extend the existing stylesheet injected by `bootstrap()` with one control-bar-scoped rule. Target native `.vjs-seek-button` elements and exclude any element carrying the userscript's `data-ikanbot-seek` marker, so dynamic control-bar rebuilds remain covered without DOM mutation.

**Tech Stack:** Tampermonkey userscript, JavaScript, Node.js built-in test runner

---

## File Structure

- Modify `test/ikanbot-player-enhancer.test.js`: capture the injected style and assert the native-only selector is present.
- Modify `ikanbot-player-enhancer.user.js`: add the native seek-button hiding rule to the existing injected stylesheet.

### Task 1: Hide only the native seek controls

**Files:**
- Modify: `test/ikanbot-player-enhancer.test.js:242-334`
- Modify: `ikanbot-player-enhancer.user.js:348-355`

- [ ] **Step 1: Write the failing style regression assertion**

In the existing `player synchronization does not mutate an already enhanced control bar` test, capture the style appended to `documentObject.head`:

```js
let appendedStyle = null;

const documentObject = {
  documentElement: {},
  head: { appendChild(node) { appendedStyle = node; } },
  // Existing test fields remain unchanged.
};
```

After calling `bootstrap(windowObject, documentObject)`, assert that the injected CSS hides native seek buttons and excludes script-owned buttons:

```js
assert.match(
  appendedStyle.textContent,
  /\.video-js \.vjs-control-bar \.vjs-seek-button:not\(\[data-ikanbot-seek\]\)\{display:none!important\}/,
);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node --test --test-isolation=none --test-name-pattern="player synchronization" test/ikanbot-player-enhancer.test.js
```

Expected: FAIL because the injected stylesheet does not yet contain the native seek-button rule.

- [ ] **Step 3: Add the minimal scoped CSS rule**

Add this entry to the `style.textContent` array in `startObserver()`:

```js
'.video-js .vjs-control-bar .vjs-seek-button:not([data-ikanbot-seek]){display:none!important}',
```

Keep the existing custom label and hidden-ad rules unchanged. This selector leaves both `[data-ikanbot-seek="-10"]` and `[data-ikanbot-seek="10"]` available and applies automatically to dynamically rebuilt controls.

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
node --test --test-isolation=none --test-name-pattern="player synchronization" test/ikanbot-player-enhancer.test.js
npm test
node --check ikanbot-player-enhancer.user.js
```

Expected: focused test passes, complete test suite passes with zero failures, and syntax check exits with code 0.

- [ ] **Step 5: Review the final diff**

Run:

```powershell
git diff --check
git diff -- ikanbot-player-enhancer.user.js test/ikanbot-player-enhancer.test.js
```

Expected: no whitespace errors; the diff contains only the style regression assertion, test capture plumbing, and one scoped CSS rule.

