# Userscript Auto Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tampermonkey detect and download future releases from the repository's `main` branch.

**Architecture:** Keep update behavior entirely in the userscript metadata block. Use jsDelivr because it is reachable in the target environment while `raw.githubusercontent.com` is not. Add a source-level regression test that reads the actual `.user.js` file so version and remote URLs cannot drift unnoticed.

**Tech Stack:** Tampermonkey metadata, JavaScript, Node.js built-in test runner

---

## File Structure

- Modify `test/ikanbot-player-enhancer.test.js`: read the userscript source and validate update metadata.
- Modify `ikanbot-player-enhancer.user.js`: bump `@version` and add the two GitHub Raw URLs.

### Task 1: Add automatic update metadata

**Files:**
- Modify: `test/ikanbot-player-enhancer.test.js:1-24`
- Modify: `ikanbot-player-enhancer.user.js:1-10`

- [ ] **Step 1: Write the failing metadata test**

Add Node filesystem and path imports:

```js
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
```

Add this test before the functional tests:

```js
test('declares versioned GitHub update metadata', () => {
  const source = readFileSync(join(__dirname, '..', 'ikanbot-player-enhancer.user.js'), 'utf8');

  assert.match(source, /^\/\/ @version\s+1\.2\.1$/m);
  assert.match(source, /^\/\/ @updateURL\s+https:\/\/cdn\.jsdelivr\.net\/gh\/gem000908\/ikan-pro@main\/ikanbot-player-enhancer\.user\.js$/m);
  assert.match(source, /^\/\/ @downloadURL\s+https:\/\/cdn\.jsdelivr\.net\/gh\/gem000908\/ikan-pro@main\/ikanbot-player-enhancer\.user\.js$/m);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node --test --test-isolation=none --test-name-pattern="versioned GitHub update metadata" test/ikanbot-player-enhancer.test.js
```

Expected: FAIL because the source still declares version `1.2.0` and has no update URLs.

- [ ] **Step 3: Add the minimal metadata entries**

Update the userscript header to include:

```js
// @version      1.2.1
// @updateURL    https://cdn.jsdelivr.net/gh/gem000908/ikan-pro@main/ikanbot-player-enhancer.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/gem000908/ikan-pro@main/ikanbot-player-enhancer.user.js
```

Keep `@grant`, `@match`, and all runtime code unchanged.

- [ ] **Step 4: Run focused and complete verification**

Run:

```powershell
node --test --test-isolation=none --test-name-pattern="versioned GitHub update metadata" test/ikanbot-player-enhancer.test.js
node --test --test-isolation=none
node --check ikanbot-player-enhancer.user.js
git diff --check
```

Expected: the focused test passes, the complete suite has zero failures, and both checks exit with code 0.

- [ ] **Step 5: Commit the implementation**

```powershell
git add ikanbot-player-enhancer.user.js test/ikanbot-player-enhancer.test.js
git commit -m "feat: enable userscript auto updates"
```
