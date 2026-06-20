# Player Ad Hiding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide only the known `60323.com` DOM advertisement in the lower-right area of ikanbot's Video.js player.

**Architecture:** Add small pure helpers for text and geometry checks, then locate the safest matching container without crossing the player root. Reuse the existing player synchronization and mutation observer to mark matching containers with a CSS-hidden data attribute after initial load and later DOM rebuilds.

**Tech Stack:** Tampermonkey userscript, browser DOM APIs, Node.js built-in test runner, `node:assert/strict`

---

## File Structure

- Modify `ikanbot-player-enhancer.user.js`: add advertisement predicates, safe container selection, hiding, synchronization, style, exports, and metadata update.
- Modify `test/ikanbot-player-enhancer.test.js`: add unit and integration coverage using the repository's existing DOM-object test doubles.
- Modify `README.md`: document that the script hides the recognized lower-right DOM advertisement and does not alter video-frame watermarks.

### Task 1: Advertisement Text and Geometry Predicates

**Files:**
- Modify: `test/ikanbot-player-enhancer.test.js`
- Modify: `ikanbot-player-enhancer.user.js`

- [ ] **Step 1: Write failing tests for strict advertisement text recognition**

Add `isKnownAdText` to the destructured imports and add:

```js
test('recognizes the known advertisement domain despite whitespace and case', () => {
  assert.equal(isKnownAdText('官网 60323.com 棋牌'), true);
  assert.equal(isKnownAdText('60323 . COM'), true);
});

test('does not treat subtitles or generic advertisement words as known ads', () => {
  assert.equal(isKnownAdText('可最终却为了同族性命选择放弃'), false);
  assert.equal(isKnownAdText('官网 棋牌 电子 百家乐'), false);
  assert.equal(isKnownAdText(null), false);
});
```

- [ ] **Step 2: Run the text tests and verify RED**

Run: `node --test --test-isolation=none --test-name-pattern="known advertisement|known ads"`

Expected: FAIL because `isKnownAdText` is not exported or defined.

- [ ] **Step 3: Implement minimal strict text recognition**

Add near the constants and URL helpers, then export it from `api`:

```js
function isKnownAdText(value) {
  if (typeof value !== 'string') return false;
  return value.replace(/\s+/g, '').toLowerCase().includes('60323.com');
}
```

- [ ] **Step 4: Run the text tests and verify GREEN**

Run: `node --test --test-isolation=none --test-name-pattern="known advertisement|known ads"`

Expected: 2 tests pass and 0 fail.

- [ ] **Step 5: Write failing tests for lower-right geometry**

Add `isBottomRightAdCandidate` to the imports and define this test helper near `memoryStorage`:

```js
function rect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}
```

Add:

```js
test('accepts a compact candidate in the player lower-right quadrant', () => {
  const player = { getBoundingClientRect: () => rect(0, 100, 1000, 500) };
  const candidate = { getBoundingClientRect: () => rect(700, 400, 250, 150) };
  assert.equal(isBottomRightAdCandidate(candidate, player), true);
});

test('rejects candidates outside the lower-right quadrant or larger than 45 percent', () => {
  const player = { getBoundingClientRect: () => rect(0, 0, 1000, 500) };
  const subtitle = { getBoundingClientRect: () => rect(300, 400, 400, 50) };
  const oversized = { getBoundingClientRect: () => rect(500, 250, 500, 250) };
  assert.equal(isBottomRightAdCandidate(subtitle, player), false);
  assert.equal(isBottomRightAdCandidate(oversized, player), false);
});

test('rejects invalid rectangles without throwing', () => {
  const player = { getBoundingClientRect: () => rect(0, 0, 1000, 500) };
  assert.equal(isBottomRightAdCandidate({ getBoundingClientRect: () => rect(700, 400, 0, 0) }, player), false);
  assert.equal(isBottomRightAdCandidate({}, player), false);
});
```

- [ ] **Step 6: Run the geometry tests and verify RED**

Run: `node --test --test-isolation=none --test-name-pattern="lower-right|45 percent|invalid rectangles"`

Expected: FAIL because `isBottomRightAdCandidate` is not exported or defined.

- [ ] **Step 7: Implement rectangle normalization and geometry checking**

Add and export `isBottomRightAdCandidate`:

```js
function readRect(element) {
  try {
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    const value = element.getBoundingClientRect();
    const left = Number(value.left);
    const top = Number(value.top);
    const width = Number(value.width);
    const height = Number(value.height);
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { left, top, width, height };
  } catch (_error) {
    return null;
  }
}

function isBottomRightAdCandidate(element, player) {
  const candidateRect = readRect(element);
  const playerRect = readRect(player);
  if (!candidateRect || !playerRect) return false;
  if (candidateRect.width > playerRect.width * 0.45
    || candidateRect.height > playerRect.height * 0.45) return false;

  const centerX = candidateRect.left + candidateRect.width / 2;
  const centerY = candidateRect.top + candidateRect.height / 2;
  return centerX >= playerRect.left + playerRect.width / 2
    && centerY >= playerRect.top + playerRect.height / 2;
}
```

- [ ] **Step 8: Run the geometry tests and verify GREEN**

Run: `node --test --test-isolation=none --test-name-pattern="lower-right|45 percent|invalid rectangles"`

Expected: 3 tests pass and 0 fail.

- [ ] **Step 9: Run the full suite and commit Task 1**

Run: `npm test`

Expected: all tests pass.

```powershell
git add -- ikanbot-player-enhancer.user.js test/ikanbot-player-enhancer.test.js
git commit -m "feat: detect lower-right player ads"
```

### Task 2: Safe Advertisement Container Selection and Hiding

**Files:**
- Modify: `test/ikanbot-player-enhancer.test.js`
- Modify: `ikanbot-player-enhancer.user.js`

- [ ] **Step 1: Add a focused DOM test-double helper**

Add near the `rect` helper:

```js
function adElement({ text = '', box, tagName = 'DIV', protectedChild = false } = {}) {
  return {
    textContent: text,
    tagName,
    parentElement: null,
    attributes: {},
    getBoundingClientRect: () => box,
    querySelector(selector) {
      return protectedChild && selector === 'video, .vjs-control-bar' ? {} : null;
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
  };
}
```

- [ ] **Step 2: Write failing tests for safe container selection**

Add `findAdContainer` to the imports and add:

```js
test('selects the outermost compact matching ad container below the player root', () => {
  const player = adElement({ text: '60323.com', box: rect(0, 0, 1000, 500) });
  const outer = adElement({ text: '官网 60323.com 棋牌', box: rect(650, 300, 320, 180) });
  const inner = adElement({ text: '60323.com', box: rect(720, 340, 180, 60) });
  inner.parentElement = outer;
  outer.parentElement = player;
  assert.equal(findAdContainer(inner, player), outer);
});

test('does not select the player root or a container with protected player content', () => {
  const player = adElement({ text: '60323.com', box: rect(0, 0, 1000, 500) });
  const protectedContainer = adElement({
    text: '60323.com',
    box: rect(650, 300, 320, 180),
    protectedChild: true,
  });
  const inner = adElement({ text: '60323.com', box: rect(720, 340, 180, 60) });
  inner.parentElement = protectedContainer;
  protectedContainer.parentElement = player;
  assert.equal(findAdContainer(inner, player), inner);
  assert.equal(findAdContainer(player, player), null);
});
```

- [ ] **Step 3: Run container-selection tests and verify RED**

Run: `node --test --test-isolation=none --test-name-pattern="outermost compact|protected player"`

Expected: FAIL because `findAdContainer` is not exported or defined.

- [ ] **Step 4: Implement protected-content and container selection**

Add and export `findAdContainer`:

```js
function containsProtectedPlayerContent(element) {
  const tagName = String(element && element.tagName || '').toUpperCase();
  if (tagName === 'VIDEO') return true;
  try {
    return typeof element.querySelector === 'function'
      && Boolean(element.querySelector('video, .vjs-control-bar'));
  } catch (_error) {
    return true;
  }
}

function isSafeAdContainer(element, player) {
  return element && element !== player
    && isKnownAdText(element.textContent)
    && isBottomRightAdCandidate(element, player)
    && !containsProtectedPlayerContent(element);
}

function findAdContainer(element, player) {
  if (!isSafeAdContainer(element, player)) return null;
  let target = element;
  let parent = element.parentElement;
  while (parent && parent !== player && isSafeAdContainer(parent, player)) {
    target = parent;
    parent = parent.parentElement;
  }
  return target;
}
```

- [ ] **Step 5: Run container-selection tests and verify GREEN**

Run: `node --test --test-isolation=none --test-name-pattern="outermost compact|protected player"`

Expected: 2 tests pass and 0 fail.

- [ ] **Step 6: Write failing tests for idempotent hiding**

Add `hidePlayerAds` to the imports and add:

```js
test('marks only a known lower-right ad and is idempotent', () => {
  const player = adElement({ text: '', box: rect(0, 0, 1000, 500) });
  const ad = adElement({ text: '官网 60323.com 棋牌', box: rect(650, 300, 320, 180) });
  const subtitle = adElement({ text: '可最终却为了同族性命选择放弃', box: rect(300, 400, 400, 50) });
  ad.parentElement = player;
  subtitle.parentElement = player;
  player.querySelectorAll = selector => selector === '*' ? [ad, subtitle] : [];

  assert.equal(hidePlayerAds(player), 1);
  assert.equal(ad.hasAttribute('data-ikanbot-hidden-ad'), true);
  assert.equal(subtitle.hasAttribute('data-ikanbot-hidden-ad'), false);
  assert.equal(hidePlayerAds(player), 0);
});

test('does nothing when a player cannot be scanned', () => {
  assert.equal(hidePlayerAds(null), 0);
  assert.equal(hidePlayerAds({}), 0);
});
```

- [ ] **Step 7: Run hiding tests and verify RED**

Run: `node --test --test-isolation=none --test-name-pattern="idempotent|cannot be scanned"`

Expected: FAIL because `hidePlayerAds` is not exported or defined.

- [ ] **Step 8: Implement idempotent hiding**

Add the constant and function, then export `hidePlayerAds`:

```js
const HIDDEN_AD_ATTRIBUTE = 'data-ikanbot-hidden-ad';

function hidePlayerAds(player) {
  if (!player || typeof player.querySelectorAll !== 'function') return 0;
  let hiddenCount = 0;
  let elements;
  try {
    elements = player.querySelectorAll('*');
  } catch (_error) {
    return 0;
  }

  elements.forEach((element) => {
    if (!isKnownAdText(element.textContent)) return;
    const target = findAdContainer(element, player);
    if (!target || (typeof target.hasAttribute === 'function'
      && target.hasAttribute(HIDDEN_AD_ATTRIBUTE))) return;
    try {
      target.setAttribute(HIDDEN_AD_ATTRIBUTE, '');
      hiddenCount += 1;
    } catch (_error) {
      // Ignore individual malformed or inaccessible nodes.
    }
  });
  return hiddenCount;
}
```

- [ ] **Step 9: Run hiding tests, then full suite, and commit Task 2**

Run: `node --test --test-isolation=none --test-name-pattern="idempotent|cannot be scanned"`

Expected: 2 tests pass and 0 fail.

Run: `npm test`

Expected: all tests pass.

```powershell
git add -- ikanbot-player-enhancer.user.js test/ikanbot-player-enhancer.test.js
git commit -m "feat: hide matching player ad containers"
```

### Task 3: Dynamic Player Synchronization and Documentation

**Files:**
- Modify: `test/ikanbot-player-enhancer.test.js`
- Modify: `ikanbot-player-enhancer.user.js`
- Modify: `README.md`

- [ ] **Step 1: Write a failing bootstrap integration test**

Add a test using the existing bootstrap test-double conventions:

```js
test('bootstrap hides a matching ad during initial and mutation-driven synchronization', () => {
  const microtasks = [];
  let mutationCallback = null;
  const player = adElement({ text: '', box: rect(0, 0, 1000, 500) });
  const firstAd = adElement({ text: '60323.com', box: rect(700, 320, 200, 100) });
  firstAd.parentElement = player;
  const candidates = [firstAd];
  player.querySelectorAll = selector => selector === '*' ? candidates : [];
  player.querySelector = () => null;

  const documentObject = {
    documentElement: {},
    head: { appendChild() {} },
    visibilityState: 'visible',
    createElement() {
      return { setAttribute() {}, textContent: '' };
    },
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector === '.video-js') return [player];
      return [];
    },
    querySelector() { return null; },
  };
  const windowObject = {
    location: { href: 'https://www1.ikanbot.com/play/ad-test' },
    localStorage: memoryStorage(),
    MutationObserver: class {
      constructor(callback) { mutationCallback = callback; }
      observe() {}
    },
    queueMicrotask: callback => microtasks.push(callback),
    addEventListener() {},
    setInterval() {},
  };

  bootstrap(windowObject, documentObject);
  assert.equal(firstAd.hasAttribute('data-ikanbot-hidden-ad'), true);

  const secondAd = adElement({ text: '官网 60323.com', box: rect(680, 300, 240, 120) });
  secondAd.parentElement = player;
  candidates.push(secondAd);
  mutationCallback();
  microtasks.shift()();
  assert.equal(secondAd.hasAttribute('data-ikanbot-hidden-ad'), true);
});
```

- [ ] **Step 2: Run the bootstrap ad test and verify RED**

Run: `node --test --test-isolation=none --test-name-pattern="mutation-driven synchronization"`

Expected: FAIL because `syncPlayer()` does not call `hidePlayerAds`.

- [ ] **Step 3: Integrate ad hiding into synchronization and CSS**

Update `syncPlayer()` before control-bar synchronization:

```js
const players = documentObject.querySelectorAll('.video-js');
players.forEach(hidePlayerAds);
```

Extend the injected stylesheet without removing the seek-button rule:

```js
style.textContent = [
  '.ikanbot-seek-button .ikanbot-seek-label{font-size:1.15em;font-weight:600;line-height:1;white-space:nowrap}',
  `[${HIDDEN_AD_ATTRIBUTE}]{display:none!important}`,
].join('');
```

- [ ] **Step 4: Run the bootstrap ad test and verify GREEN**

Run: `node --test --test-isolation=none --test-name-pattern="mutation-driven synchronization"`

Expected: 1 test passes and 0 fail.

- [ ] **Step 5: Update userscript metadata and README**

Change metadata to:

```js
// @version      1.2.0
// @description  增强 ikanbot 播放控制、观看进度，并隐藏已识别的播放器右下角广告
```

Add this item under README's feature list:

```markdown
- 自动隐藏播放器右下角包含 `60323.com` 的 DOM 广告覆盖层；不会裁剪或遮挡视频画面，也无法处理烧录进视频帧的水印。
```

- [ ] **Step 6: Run fresh full verification**

Run: `npm test`

Expected: all tests pass with 0 failures.

Run: `node --check ikanbot-player-enhancer.user.js`

Expected: exit code 0 with no syntax errors.

Run: `git diff --check`

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 7: Commit integration and documentation**

```powershell
git add -- ikanbot-player-enhancer.user.js test/ikanbot-player-enhancer.test.js README.md
git commit -m "feat: hide dynamic lower-right player ads"
```

- [ ] **Step 8: Confirm final repository state**

Run: `git status --short`

Expected: no unexpected modified or untracked files. Any pre-existing unrelated user changes remain untouched and are reported separately.
