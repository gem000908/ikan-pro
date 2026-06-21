'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  getPageId,
  makeStorageKey,
  isKnownAdText,
  isBottomRightAdCandidate,
  findAdContainer,
  hidePlayerAds,
  seekBy,
  isEditableTarget,
  isInteractiveTarget,
  togglePlayback,
  shouldClearProgress,
  readProgress,
  writeProgress,
  restoreProgress,
  bootstrap,
} = require('../ikanbot-player-enhancer.user.js');

test('declares versioned GitHub update metadata', () => {
  const source = readFileSync(join(__dirname, '..', 'ikanbot-player-enhancer.user.js'), 'utf8');

  assert.match(source, /^\/\/ @version\s+1\.2\.1$/m);
  assert.match(source, /^\/\/ @updateURL\s+https:\/\/cdn\.jsdelivr\.net\/gh\/gem000908\/ikan-pro@main\/ikanbot-player-enhancer\.user\.js$/m);
  assert.match(source, /^\/\/ @downloadURL\s+https:\/\/cdn\.jsdelivr\.net\/gh\/gem000908\/ikan-pro@main\/ikanbot-player-enhancer\.user\.js$/m);
});

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function rect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

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

test('extracts the play-page id', () => {
  assert.equal(getPageId('https://www1.ikanbot.com/play/12345.html'), '12345.html');
});

test('rejects URLs outside the exact play-page scope', () => {
  assert.equal(getPageId('https://ikanbot.com/play/12345.html'), null);
  assert.equal(getPageId('https://www1.ikanbot.com/search/12345.html'), null);
});

test('creates an encoded, namespaced storage key', () => {
  assert.equal(makeStorageKey('show/第 1 集'), 'ikanbot-player-progress:show%2F%E7%AC%AC%201%20%E9%9B%86');
});

test('recognizes the known advertisement domain despite whitespace and case', () => {
  assert.equal(isKnownAdText('官网 60323.com 棋牌'), true);
  assert.equal(isKnownAdText('60323 . COM'), true);
});

test('does not treat subtitles or generic advertisement words as known ads', () => {
  assert.equal(isKnownAdText('可最终却为了同族性命选择放弃'), false);
  assert.equal(isKnownAdText('官网 棋牌 电子 บาคาร่า'), false);
  assert.equal(isKnownAdText(null), false);
});

test('accepts a compact candidate in the player lower-right quadrant', () => {
  const player = { getBoundingClientRect: () => rect(0, 100, 1000, 500) };
  const candidate = { getBoundingClientRect: () => rect(700, 400, 250, 150) };
  assert.equal(isBottomRightAdCandidate(candidate, player), true);
});

test('rejects candidates outside the lower-right quadrant or larger than 45 percent', () => {
  const player = { getBoundingClientRect: () => rect(0, 0, 1000, 500) };
  const subtitle = { getBoundingClientRect: () => rect(250, 400, 400, 50) };
  const oversized = { getBoundingClientRect: () => rect(500, 250, 500, 250) };
  assert.equal(isBottomRightAdCandidate(subtitle, player), false);
  assert.equal(isBottomRightAdCandidate(oversized, player), false);
});

test('rejects invalid rectangles without throwing', () => {
  const player = { getBoundingClientRect: () => rect(0, 0, 1000, 500) };
  assert.equal(isBottomRightAdCandidate({ getBoundingClientRect: () => rect(700, 400, 0, 0) }, player), false);
  assert.equal(isBottomRightAdCandidate({}, player), false);
});

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

test('seeks forward by the requested amount', () => {
  const video = { currentTime: 25, duration: 100 };
  assert.equal(seekBy(video, 10), 35);
  assert.equal(video.currentTime, 35);
});

test('clamps backward seeking at zero', () => {
  const video = { currentTime: 4, duration: 100 };
  assert.equal(seekBy(video, -10), 0);
});

test('clamps forward seeking at duration', () => {
  const video = { currentTime: 96, duration: 100 };
  assert.equal(seekBy(video, 10), 100);
});

test('treats form controls as editable targets', () => {
  assert.equal(isEditableTarget({ nodeName: 'INPUT', isContentEditable: false, closest: () => null }), true);
  assert.equal(isEditableTarget({ nodeName: 'TEXTAREA', isContentEditable: false, closest: () => null }), true);
  assert.equal(isEditableTarget({ nodeName: 'SELECT', isContentEditable: false, closest: () => null }), true);
});

test('treats contenteditable descendants as editable targets', () => {
  assert.equal(isEditableTarget({ nodeName: 'SPAN', isContentEditable: false, closest: () => ({}) }), true);
});

test('allows shortcuts from ordinary elements', () => {
  assert.equal(isEditableTarget({ nodeName: 'DIV', isContentEditable: false, closest: () => null }), false);
});

test('clears progress for an ended video', () => {
  assert.equal(shouldClearProgress({ currentTime: 50, duration: 100, ended: true }), true);
});

test('clears progress within 30 seconds of the end', () => {
  assert.equal(shouldClearProgress({ currentTime: 71, duration: 100, ended: false }), true);
});

test('keeps progress when duration is not known yet', () => {
  assert.equal(shouldClearProgress({ currentTime: 71, duration: NaN, ended: false }), false);
});

test('writes time and update timestamp as JSON', () => {
  const storage = memoryStorage();
  assert.equal(writeProgress(storage, 'key', { currentTime: 42, duration: 100, ended: false }, 1234), 'saved');
  assert.deepEqual(JSON.parse(storage.getItem('key')), { time: 42, updatedAt: 1234 });
});

test('removes saved progress near the end', () => {
  const storage = memoryStorage({ key: '{"time":50}' });
  assert.equal(writeProgress(storage, 'key', { currentTime: 80, duration: 100, ended: false }, 1234), 'cleared');
  assert.equal(storage.getItem('key'), null);
});

test('ignores malformed saved progress', () => {
  assert.equal(readProgress(memoryStorage({ key: 'not-json' }), 'key'), null);
  assert.equal(readProgress(memoryStorage({ key: '{"time":-2}' }), 'key'), null);
});

test('restores eligible saved progress', () => {
  const storage = memoryStorage({ key: '{"time":42,"updatedAt":1234}' });
  const video = { currentTime: 0, duration: 100, ended: false };
  assert.equal(restoreProgress(storage, 'key', video), true);
  assert.equal(video.currentTime, 42);
});

test('does not restore progress below five seconds', () => {
  const storage = memoryStorage({ key: '{"time":4.9,"updatedAt":1234}' });
  const video = { currentTime: 0, duration: 100, ended: false };
  assert.equal(restoreProgress(storage, 'key', video), false);
  assert.equal(video.currentTime, 0);
});

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

test('player synchronization does not mutate an already enhanced control bar', () => {
  const microtasks = [];
  let mutationCallback = null;
  let insertionCount = 0;
  let appendedStyle = null;

  const controlBar = {
    children: [],
    querySelector(selector) {
      if (selector === '.vjs-play-control') return this.children.find(node => node.className === 'vjs-play-control') || null;
      const match = selector.match(/^\[data-ikanbot-seek="(-?10)"\]$/);
      return match
        ? this.children.find(node => node.attributes['data-ikanbot-seek'] === match[1]) || null
        : null;
    },
    closest(selector) {
      return selector === '.video-js' ? player : null;
    },
    insertBefore(node, referenceNode) {
      let adjustedReference = referenceNode;
      if (adjustedReference === node) adjustedReference = node.nextSibling;
      const existingIndex = this.children.indexOf(node);
      if (existingIndex >= 0) this.children.splice(existingIndex, 1);
      const referenceIndex = adjustedReference ? this.children.indexOf(adjustedReference) : -1;
      this.children.splice(referenceIndex >= 0 ? referenceIndex : this.children.length, 0, node);
      node.parentNode = this;
      insertionCount += 1;
      if (mutationCallback) mutationCallback();
    },
  };

  function makeElement(tagName) {
    const element = {
      tagName: tagName.toUpperCase(),
      className: '',
      attributes: {},
      children: [],
      setAttribute(name, value) { this.attributes[name] = String(value); },
      appendChild(child) { this.children.push(child); child.parentNode = this; },
      addEventListener() {},
    };
    Object.defineProperty(element, 'nextSibling', {
      get() {
        if (!this.parentNode) return null;
        const index = this.parentNode.children.indexOf(this);
        return this.parentNode.children[index + 1] || null;
      },
    });
    return element;
  }

  const playButton = makeElement('button');
  playButton.className = 'vjs-play-control';
  playButton.parentNode = controlBar;
  controlBar.children.push(playButton);

  const video = {
    currentTime: 0,
    duration: Number.NaN,
    readyState: 0,
    isConnected: true,
    addEventListener() {},
  };
  const player = { querySelector: selector => selector === 'video' ? video : null };
  const documentObject = {
    documentElement: {},
    head: { appendChild(node) { appendedStyle = node; } },
    visibilityState: 'visible',
    createElement: makeElement,
    addEventListener() {},
    querySelectorAll: selector => selector === '.video-js .vjs-control-bar' ? [controlBar] : [],
    querySelector: selector => selector === '.video-js video' ? video : null,
  };
  const windowObject = {
    location: { href: 'https://www1.ikanbot.com/play/repro' },
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
  assert.match(
    appendedStyle.textContent,
    /\.video-js \.vjs-control-bar \.vjs-seek-button:not\(\[data-ikanbot-seek\]\)\{display:none!important\}/,
  );
  assert.equal(insertionCount, 2);
  assert.equal(microtasks.length, 1);

  microtasks.shift()();

  assert.equal(insertionCount, 2);
  assert.equal(microtasks.length, 0);
});

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
