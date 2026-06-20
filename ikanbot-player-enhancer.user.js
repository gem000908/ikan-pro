// ==UserScript==
// @name         ikanbot 播放器增强
// @namespace    https://www1.ikanbot.com/
// @version      1.1.0
// @description  为 ikanbot 播放页增加前后 10 秒跳转和按影片保存的观看进度
// @match        https://www1.ikanbot.com/play/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function (globalScope) {
  'use strict';

  const STORAGE_PREFIX = 'ikanbot-player-progress:';
  const MIN_RESUME_SECONDS = 5;
  const END_CLEAR_SECONDS = 30;
  const SAVE_INTERVAL_MS = 5000;
  const BUTTON_ATTRIBUTE = 'data-ikanbot-seek';

  function isKnownAdText(value) {
    if (typeof value !== 'string') return false;
    return value.replace(/\s+/g, '').toLowerCase().includes('60323.com');
  }

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

  function getPageId(urlValue) {
    try {
      const url = new URL(urlValue);
      if (url.protocol !== 'https:' || url.hostname !== 'www1.ikanbot.com') return null;
      if (!url.pathname.startsWith('/play/')) return null;

      const id = url.pathname.slice('/play/'.length).replace(/\/+$/, '');
      return id || null;
    } catch (_error) {
      return null;
    }
  }

  function makeStorageKey(pageId) {
    return `${STORAGE_PREFIX}${encodeURIComponent(pageId)}`;
  }

  function seekBy(video, amount) {
    if (!video || !Number.isFinite(amount)) return null;

    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const upperBound = Number.isFinite(video.duration) && video.duration >= 0
      ? video.duration
      : Number.POSITIVE_INFINITY;
    const nextTime = Math.min(upperBound, Math.max(0, currentTime + amount));

    try {
      video.currentTime = nextTime;
      return nextTime;
    } catch (_error) {
      return null;
    }
  }

  function isEditableTarget(target) {
    if (!target) return false;
    const nodeName = String(target.nodeName || '').toUpperCase();
    if (nodeName === 'INPUT' || nodeName === 'TEXTAREA' || nodeName === 'SELECT') return true;
    if (target.isContentEditable) return true;

    try {
      return typeof target.closest === 'function'
        && Boolean(target.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'));
    } catch (_error) {
      return false;
    }
  }

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

  function shouldClearProgress(video) {
    if (!video) return false;
    if (video.ended) return true;
    if (!Number.isFinite(video.currentTime) || !Number.isFinite(video.duration) || video.duration <= 0) {
      return false;
    }
    return video.duration - video.currentTime < END_CLEAR_SECONDS;
  }

  function readProgress(storage, key) {
    try {
      const rawValue = storage.getItem(key);
      if (rawValue === null) return null;
      const value = JSON.parse(rawValue);
      return value && Number.isFinite(value.time) && value.time >= 0 ? value.time : null;
    } catch (_error) {
      return null;
    }
  }

  function removeProgress(storage, key) {
    try {
      storage.removeItem(key);
    } catch (_error) {
      // localStorage can be unavailable in restricted browser contexts.
    }
  }

  function writeProgress(storage, key, video, now = Date.now()) {
    if (!storage || !video) return 'skipped';
    if (shouldClearProgress(video)) {
      removeProgress(storage, key);
      return 'cleared';
    }
    if (!Number.isFinite(video.currentTime) || video.currentTime < 0) return 'skipped';

    try {
      storage.setItem(key, JSON.stringify({ time: video.currentTime, updatedAt: now }));
      return 'saved';
    } catch (_error) {
      return 'skipped';
    }
  }

  function restoreProgress(storage, key, video) {
    const savedTime = readProgress(storage, key);
    if (savedTime === null || savedTime < MIN_RESUME_SECONDS) return false;

    if (Number.isFinite(video.duration) && video.duration > 0
      && video.duration - savedTime < END_CLEAR_SECONDS) {
      removeProgress(storage, key);
      return false;
    }

    try {
      video.currentTime = savedTime;
      return true;
    } catch (_error) {
      return false;
    }
  }

  function createSeekButton(documentObject, amount, getVideo) {
    const direction = amount < 0 ? '后退' : '前进';
    const button = documentObject.createElement('button');
    button.type = 'button';
    button.className = 'vjs-control vjs-button ikanbot-seek-button';
    button.setAttribute(BUTTON_ATTRIBUTE, String(amount));
    button.setAttribute('aria-label', `${direction} 10 秒`);
    button.title = `${direction} 10 秒`;

    const label = documentObject.createElement('span');
    label.className = 'ikanbot-seek-label';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = amount < 0 ? '−10' : '+10';
    button.appendChild(label);

    const controlText = documentObject.createElement('span');
    controlText.className = 'vjs-control-text';
    controlText.textContent = `${direction} 10 秒`;
    button.appendChild(controlText);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      seekBy(getVideo(), amount);
    });
    return button;
  }

  function bootstrap(windowObject, documentObject) {
    const pageId = getPageId(windowObject.location.href);
    if (!pageId) return null;

    const storageKey = makeStorageKey(pageId);
    const boundVideos = new WeakSet();
    let currentVideo = null;
    let syncQueued = false;

    const saveVideo = (video) => writeProgress(windowObject.localStorage, storageKey, video);
    const saveCurrent = () => currentVideo && saveVideo(currentVideo);

    function bindVideo(video) {
      if (!video) return;
      if (currentVideo && currentVideo !== video) saveVideo(currentVideo);
      currentVideo = video;
      if (boundVideos.has(video)) return;
      boundVideos.add(video);

      video.addEventListener('pause', () => saveVideo(video));
      video.addEventListener('ended', () => removeProgress(windowObject.localStorage, storageKey));

      const restore = () => restoreProgress(windowObject.localStorage, storageKey, video);
      if (video.readyState >= 1 || Number.isFinite(video.duration)) restore();
      else video.addEventListener('loadedmetadata', restore, { once: true });
    }

    function videoForControlBar(controlBar) {
      const player = controlBar.closest('.video-js');
      return player ? player.querySelector('video') : null;
    }

    function ensureButtons(controlBar) {
      const playButton = controlBar.querySelector('.vjs-play-control');
      if (!playButton) return;

      let backButton = controlBar.querySelector(`[${BUTTON_ATTRIBUTE}="-10"]`);
      let forwardButton = controlBar.querySelector(`[${BUTTON_ATTRIBUTE}="10"]`);
      const getVideo = () => videoForControlBar(controlBar) || currentVideo;

      if (!backButton) {
        backButton = createSeekButton(documentObject, -10, getVideo);
        controlBar.insertBefore(backButton, playButton.nextSibling);
      }
      if (!forwardButton) {
        forwardButton = createSeekButton(documentObject, 10, getVideo);
        controlBar.insertBefore(forwardButton, backButton.nextSibling);
      }
      bindVideo(getVideo());
    }

    function syncPlayer() {
      syncQueued = false;
      const controlBars = documentObject.querySelectorAll('.video-js .vjs-control-bar');
      controlBars.forEach(ensureButtons);
      if (!currentVideo || !currentVideo.isConnected) {
        bindVideo(documentObject.querySelector('.video-js video'));
      }
    }

    function scheduleSync() {
      if (syncQueued) return;
      syncQueued = true;
      const enqueue = typeof windowObject.queueMicrotask === 'function'
        ? windowObject.queueMicrotask.bind(windowObject)
        : (callback) => Promise.resolve().then(callback);
      enqueue(syncPlayer);
    }

    function startObserver() {
      const style = documentObject.createElement('style');
      style.setAttribute('data-ikanbot-player-enhancer', '');
      style.textContent = '.ikanbot-seek-button .ikanbot-seek-label{font-size:1.15em;font-weight:600;line-height:1;white-space:nowrap}';
      (documentObject.head || documentObject.documentElement).appendChild(style);

      const observer = new windowObject.MutationObserver(scheduleSync);
      observer.observe(documentObject.documentElement, { childList: true, subtree: true });
      syncPlayer();
    }

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

    documentObject.addEventListener('visibilitychange', () => {
      if (documentObject.visibilityState === 'hidden') saveCurrent();
    });
    windowObject.addEventListener('pagehide', saveCurrent);
    windowObject.addEventListener('beforeunload', saveCurrent);
    windowObject.setInterval(saveCurrent, SAVE_INTERVAL_MS);

    if (documentObject.documentElement) startObserver();
    else documentObject.addEventListener('DOMContentLoaded', startObserver, { once: true });

    return { syncPlayer, saveCurrent };
  }

  const api = {
    getPageId,
    makeStorageKey,
    isKnownAdText,
    isBottomRightAdCandidate,
    seekBy,
    isEditableTarget,
    isInteractiveTarget,
    togglePlayback,
    shouldClearProgress,
    readProgress,
    writeProgress,
    restoreProgress,
    bootstrap,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    bootstrap(window, document);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
