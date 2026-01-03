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

  function getHostname() {
    return window.location.hostname;
  }

  function getStorageKey(hostname) {
    return `speed_${hostname}`;
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

  function updateButton(video) {
    const control = videoControls.get(video);
    if (control) {
      const speedDisplay = control.querySelector('.speed');
      if (speedDisplay) {
        speedDisplay.textContent = `${video.playbackRate.toFixed(2)}x`;
      }
    }
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
      decreaseSpeed(video);
    });

    rightArrow.addEventListener('click', (e) => {
      e.stopPropagation();
      increaseSpeed(video);
    });

    speedDisplay.addEventListener('click', (e) => {
      e.stopPropagation();
      resetSpeed(video);
    });

    positionControl(control, video);

    video.addEventListener('click', () => {
      activeVideo = video;
    });

    video.addEventListener('mouseenter', () => {
      activeVideo = video;
      control.style.opacity = '1';
    });

    video.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (activeVideo !== video) {
          control.style.opacity = '0.7';
        }
      }, 3000);
    });

    control.addEventListener('mouseenter', () => {
      activeVideo = video;
    });

    let parentElement = video.parentElement;
    if (parentElement && parentElement.style.position !== 'relative' && 
        parentElement.style.position !== 'absolute' &&
        parentElement.style.position !== 'fixed') {
      parentElement.style.position = 'relative';
    }

    if (parentElement) {
      parentElement.appendChild(control);
    }

    videoControls.set(video, control);
  }

  function positionControl(control, video) {
    const rect = video.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      control.style.display = 'flex';
    }
  }

  function removeSpeedControl(video) {
    const control = videoControls.get(video);
    if (control) {
      control.remove();
      videoControls.delete(video);
    }
  }

  function setupVideo(video) {
    if (videoControls.has(video)) {
      return;
    }

    video.playbackRate = getClosestSpeed(video.playbackRate);
    
    loadSpeed(video).then(() => {
      createSpeedControl(video);
    });
  }

  function scanForVideos() {
    const videos = document.getElementsByTagName('video');
    const processedVideos = new Set(videoControls.keys());
    const currentVideos = new Set(videos);

    for (const video of videos) {
      if (!processedVideos.has(video)) {
        setupVideo(video);
      }
    }

    for (const video of processedVideos) {
      if (!currentVideos.has(video)) {
        removeSpeedControl(video);
      }
    }
  }

  const observer = new MutationObserver(() => {
    scanForVideos();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    let video = activeVideo;
    if (!video) {
      const videos = document.getElementsByTagName('video');
      if (videos.length > 0) {
        video = videos[0];
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