'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPageId,
  makeStorageKey,
  seekBy,
  isEditableTarget,
  shouldClearProgress,
  readProgress,
  writeProgress,
  restoreProgress,
  bootstrap,
} = require('../ikanbot-player-enhancer.user.js');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
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

test('player synchronization does not mutate an already enhanced control bar', () => {
  const microtasks = [];
  let mutationCallback = null;
  let insertionCount = 0;

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
    head: { appendChild() {} },
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
  assert.equal(insertionCount, 2);
  assert.equal(microtasks.length, 1);

  microtasks.shift()();

  assert.equal(insertionCount, 2);
  assert.equal(microtasks.length, 0);
});
