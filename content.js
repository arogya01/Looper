(function() {
  'use strict';

  const SPEED_MIN = 1.0;
  const SPEED_MAX = 3.0;
  const SPEED_STEP = 0.25;
  const SPEEDS = [];
  for (let speed = SPEED_MIN; speed <= SPEED_MAX; speed += SPEED_STEP) {
    SPEEDS.push(speed);
  }

  const videoControls = new Map();
  let activeVideo = null;
  let cachedPosition = null;
  let rafUpdateId = null;

  function getHostname() {
    return window.location.hostname;
  }

  function getStorageKey(hostname) {
    return `speed_${hostname}`;
  }

  function getPositionKey(hostname) {
    return `position_${hostname}`;
  }

  function getClosestSpeed(currentSpeed) {
    return SPEEDS.reduce((prev, curr) => 
      Math.abs(curr - currentSpeed) < Math.abs(prev - currentSpeed) ? curr : prev
    );
  }

  function increaseSpeed(video) {
    const currentSpeed = video.playbackRate;
    const currentIndex = SPEEDS.findIndex(s => s >= currentSpeed);
    const nextIndex = currentIndex === -1 ? SPEEDS.length - 1 : 
                      Math.min(currentIndex + 1, SPEEDS.length - 1);
    video.playbackRate = SPEEDS[nextIndex];
    updateButton(video);
    saveSpeed(video).catch(err => console.warn('[Looper] Speed save ignored:', err));
  }

  function decreaseSpeed(video) {
    const currentSpeed = video.playbackRate;
    const currentIndex = SPEEDS.findIndex(s => s >= currentSpeed);
    const prevIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
    video.playbackRate = SPEEDS[prevIndex];
    updateButton(video);
    saveSpeed(video).catch(err => console.warn('[Looper] Speed save ignored:', err));
  }

  function resetSpeed(video) {
    video.playbackRate = 1.0;
    updateButton(video);
    saveSpeed(video).catch(err => console.warn('[Looper] Speed save ignored:', err));
  }

  async function saveSpeed(video, retryCount = 0, maxRetries = 3) {
    const hostname = getHostname();
    const key = getStorageKey(hostname);
    
    if (!chrome.runtime?.id) {
      console.warn('[Looper] Extension context invalid, skipping save');
      return;
    }
    
    try {
      await chrome.storage.local.set({ [key]: video.playbackRate });
      console.log(`[Looper] Saved speed ${video.playbackRate}x for ${hostname}`);
    } catch (error) {
      if (retryCount < maxRetries) {
        console.warn(`[Looper] Save failed (attempt ${retryCount + 1}/${maxRetries}), retrying...`, error);
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retryCount)));
        return saveSpeed(video, retryCount + 1, maxRetries);
      } else {
        console.error('[Looper] Failed to save speed after retries:', error);
      }
    }
  }

  async function loadSpeed(video) {
    if (!chrome.runtime?.id) {
      console.warn('[Looper] Extension context invalid, skipping load');
      return;
    }
    
    try {
      const hostname = getHostname();
      const key = getStorageKey(hostname);
      const result = await chrome.storage.local.get([key]);
      if (result[key]) {
        video.playbackRate = result[key];
        console.log(`[Looper] Loaded speed ${result[key]}x for ${hostname}`);
      }
    } catch (error) {
      console.warn('[Looper] Failed to load speed:', error);
    }
  }

  async function savePosition(position) {
    cachedPosition = position;
    if (!chrome.runtime?.id) {
      console.warn('[Looper] Extension context invalid, skipping position save');
      return;
    }

    try {
      const hostname = getHostname();
      const key = getPositionKey(hostname);
      await chrome.storage.local.set({ [key]: position });
      console.log(`[Looper] Saved position for ${hostname}:`, position);
    } catch (error) {
      console.warn('[Looper] Failed to save position:', error);
    }
  }

  async function loadPosition() {
    if (cachedPosition !== null) {
      return cachedPosition;
    }
    if (!chrome.runtime?.id) {
      console.warn('[Looper] Extension context invalid, skipping position load');
      return null;
    }

    try {
      const hostname = getHostname();
      const key = getPositionKey(hostname);
      const result = await chrome.storage.local.get([key]);
      if (result[key]) {
        cachedPosition = result[key];
        console.log(`[Looper] Loaded position for ${hostname}:`, result[key]);
        return result[key];
      }
    } catch (error) {
      console.warn('[Looper] Failed to load position:', error);
    }
    return null;
  }

  function updateButton(video) {
    const control = videoControls.get(video);
    if (control) {
      const speedDisplay = control.querySelector('.speed');
      if (speedDisplay) {
        speedDisplay.textContent = `${video.playbackRate.toFixed(2)}x`;
      }
    }
  }

  function setupDrag(control, video) {
    let isDragging = false;
    let dragStartX, dragStartY;
    let startFixedX, startFixedY;
    let dragPointerId = null;

    control.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('arrow') || e.target.classList.contains('speed')) {
        return;
      }

      isDragging = true;
      dragPointerId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      startFixedX = parseInt(control.style.left) || 0;
      startFixedY = parseInt(control.style.top) || 0;
      control.dataset.dragging = 'true';

      control.style.cursor = 'grabbing';
      control.setPointerCapture(e.pointerId);

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, { capture: true });

    control.addEventListener('pointermove', (e) => {
      if (!isDragging || e.pointerId !== dragPointerId) return;

      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;

      const rect = video.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();

      let newFixedX = startFixedX + deltaX;
      let newFixedY = startFixedY + deltaY;

      const minX = rect.left;
      const minY = rect.top;
      const maxX = rect.right - controlRect.width;
      const maxY = rect.bottom - controlRect.height;

      newFixedX = Math.max(minX, Math.min(newFixedX, maxX));
      newFixedY = Math.max(minY, Math.min(newFixedY, maxY));

      control.style.left = `${newFixedX}px`;
      control.style.top = `${newFixedY}px`;

      e.preventDefault();
      e.stopPropagation();
    }, { capture: true });

    control.addEventListener('pointerup', (e) => {
      if (!isDragging || e.pointerId !== dragPointerId) return;

      isDragging = false;
      dragPointerId = null;
      control.style.cursor = 'move';
      delete control.dataset.dragging;
      control.releasePointerCapture(e.pointerId);

      const rect = video.getBoundingClientRect();
      const position = {
        x: parseInt(control.style.left) - rect.left,
        y: parseInt(control.style.top) - rect.top
      };
      savePosition(position);

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, { capture: true });

    control.addEventListener('pointercancel', (e) => {
      if (!isDragging || e.pointerId !== dragPointerId) return;

      isDragging = false;
      dragPointerId = null;
      control.style.cursor = 'move';
      delete control.dataset.dragging;

      const rect = video.getBoundingClientRect();
      const position = {
        x: parseInt(control.style.left) - rect.left,
        y: parseInt(control.style.top) - rect.top
      };
      savePosition(position);
    }, { capture: true });
  }

  function createSpeedControl(video) {
    if (videoControls.has(video)) {
      return;
    }

    const control = document.createElement('div');
    control.className = 'video-speed-control';
    control.innerHTML = `<span class="arrow left-arrow">&lt;</span><span class="speed">${video.playbackRate.toFixed(2)}x</span><span class="arrow right-arrow">&gt;</span>`;

    const leftArrow = control.querySelector('.left-arrow');
    const rightArrow = control.querySelector('.right-arrow');
    const speedDisplay = control.querySelector('.speed');

    leftArrow.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      decreaseSpeed(video);
    });

    rightArrow.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      increaseSpeed(video);
    });

    speedDisplay.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      resetSpeed(video);
    });

    // Append to body first so we can measure it, then position it
    document.body.appendChild(control);

    loadPosition().then(position => {
      positionControl(control, video, position);
    });

    setupDrag(control, video);

    control.addEventListener('mouseenter', () => {
      activeVideo = video;
      control.style.opacity = '1';
    });

    control.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (activeVideo !== video) {
          control.style.opacity = '0.7';
        }
      }, 3000);
    });

    videoControls.set(video, control);
  }

  function positionControl(control, video, position = null) {
    if (control.dataset.dragging === 'true') return;

    const rect = video.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      control.style.display = 'flex';

      const controlRect = control.getBoundingClientRect();

      let fixedX, fixedY;

      if (position) {
        fixedX = rect.left + position.x;
        fixedY = rect.top + position.y;
      } else {
        fixedX = rect.right - controlRect.width - 10;
        fixedY = rect.top + 10;
      }

      const minX = rect.left;
      const minY = rect.top;
      const maxX = rect.right - controlRect.width;
      const maxY = rect.bottom - controlRect.height;

      fixedX = Math.max(minX, Math.min(fixedX, maxX));
      fixedY = Math.max(minY, Math.min(fixedY, maxY));

      control.style.left = `${fixedX}px`;
      control.style.top = `${fixedY}px`;
      control.style.right = 'auto';
    }
  }

  function removeSpeedControl(video) {
    const control = videoControls.get(video);
    if (control) {
      control.remove();
      videoControls.delete(video);
    }
    const observer = videoObservers.get(video);
    if (observer) {
      observer.disconnect();
      videoObservers.delete(video);
    }
    try {
      videoIntersectionObserver.unobserve(video);
    } catch (e) {
      // ignore
    }
  }

  const videoObservers = new WeakMap();

  function setupVideo(video) {
    if (videoControls.has(video)) {
      return;
    }

    videoIntersectionObserver.observe(video);

    video.playbackRate = getClosestSpeed(video.playbackRate);

    loadSpeed(video).then(() => {
      createSpeedControl(video);
      if (!rafUpdateId) {
        startPositionUpdates();
      }
    });

    if (!videoObservers.has(video)) {
      const resizeObserver = new ResizeObserver(() => {
        const control = videoControls.get(video);
        if (control) {
          loadPosition().then(position => {
            positionControl(control, video, position);
          });
        }
      });
      resizeObserver.observe(video);
      videoObservers.set(video, resizeObserver);
    }
  }

  function getAllVideos(root = document) {
    const videos = [];
    try {
      videos.push(...root.getElementsByTagName('video'));
    } catch (e) {
      // root might not support getElementsByTagName
    }

    // Search inside shadow DOMs
    const allElements = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const el of allElements) {
      if (el.shadowRoot) {
        videos.push(...getAllVideos(el.shadowRoot));
      }
    }

    return videos;
  }

  function getAllIframes() {
    const iframes = [];
    try {
      const frames = document.querySelectorAll('iframe');
      for (const frame of frames) {
        try {
          if (frame.contentDocument) {
            iframes.push(frame.contentDocument);
          }
        } catch (e) {
          // Cross-origin iframe, can't access
        }
      }
    } catch (e) {
      // ignore
    }
    return iframes;
  }

  function updateAllControlPositions() {
    for (const [video, control] of videoControls) {
      if (document.contains(video)) {
        positionControl(control, video, cachedPosition);
      }
    }
  }

  function startPositionUpdates() {
    if (rafUpdateId) return;
    function tick() {
      if (videoControls.size === 0) {
        stopPositionUpdates();
        return;
      }
      updateAllControlPositions();
      rafUpdateId = requestAnimationFrame(tick);
    }
    rafUpdateId = requestAnimationFrame(tick);
  }

  function stopPositionUpdates() {
    if (rafUpdateId) {
      cancelAnimationFrame(rafUpdateId);
      rafUpdateId = null;
    }
  }

  // Track which video is visible for keyboard shortcuts
  const videoIntersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        activeVideo = entry.target;
      }
    }
  }, { threshold: 0.5 });

  window.addEventListener('scroll', updateAllControlPositions, { passive: true });
  window.addEventListener('resize', updateAllControlPositions, { passive: true });

  function scanForVideos() {
    const videos = getAllVideos();

    // Also scan inside accessible iframes
    for (const iframeDoc of getAllIframes()) {
      videos.push(...getAllVideos(iframeDoc));
    }

    const processedVideos = new Set(videoControls.keys());
    const currentVideos = new Set(videos);

    for (const video of videos) {
      if (!processedVideos.has(video)) {
        setupVideo(video);
      }
    }

    for (const video of processedVideos) {
      if (!currentVideos.has(video) || !document.contains(video)) {
        removeSpeedControl(video);
      }
    }
  }

  let scanTimeout = null;
  const observer = new MutationObserver((mutations) => {
    // Debounce scans to avoid performance issues on rapid DOM changes
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      scanForVideos();
    }, 100);

    // Watch for shadow roots being attached
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.shadowRoot) {
            scanForVideos();
          }
          const shadowHosts = node.querySelectorAll ? node.querySelectorAll('*') : [];
          for (const el of shadowHosts) {
            if (el.shadowRoot) {
              scanForVideos();
              break;
            }
          }
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    let video = activeVideo;
    if (!video) {
      const videos = getAllVideos();
      for (const v of videos) {
        const rect = v.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0) {
          video = v;
          break;
        }
      }
    }

    if (!video) {
      return;
    }

    if (e.key === '[' || e.key === '-') {
      e.preventDefault();
      decreaseSpeed(video);
    } else if (e.key === ']' || e.key === '+') {
      e.preventDefault();
      increaseSpeed(video);
    } else if (e.key === '0') {
      e.preventDefault();
      resetSpeed(video);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanForVideos);
  } else {
    scanForVideos();
  }
})();