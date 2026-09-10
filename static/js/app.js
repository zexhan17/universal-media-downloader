/**
 * Universal Video Downloader - Frontend Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const urlForm = document.getElementById('url-form');
  const videoUrlInput = document.getElementById('video-url');
  const btnPaste = document.getElementById('btn-paste');
  const btnFetch = document.getElementById('btn-fetch');
  const btnFetchSpinner = document.getElementById('btn-fetch-spinner');
  const btnFetchIcon = document.getElementById('btn-fetch-icon');
  const btnFetchText = document.getElementById('btn-fetch-text');

  // Video Preview Elements
  const videoCard = document.getElementById('video-card');
  const videoThumb = document.getElementById('video-thumb');
  const videoDuration = document.getElementById('video-duration');
  const videoTitle = document.getElementById('video-title');
  const videoChannel = document.getElementById('video-channel');
  const videoViews = document.getElementById('video-views');
  const videoViewsContainer = document.getElementById('video-views-container');
  const videoMaxRes = document.getElementById('video-max-res');
  const platformBadge = document.getElementById('platform-badge');
  const platformName = document.getElementById('platform-name');
  const btnQuickDownload = document.getElementById('btn-quick-download');
  const btnToggleOptions = document.getElementById('btn-toggle-options');
  const optionsPanel = document.getElementById('options-panel');
  const optionsChevron = document.getElementById('options-chevron');

  // Custom Options Elements
  const resolutionsGrid = document.getElementById('resolutions-grid');
  const selectContainer = document.getElementById('select-container');
  const audioQualityBox = document.getElementById('audio-quality-box');
  const selectAudioBitrate = document.getElementById('select-audio-bitrate');

  // Subtitles Elements
  const toggleSubtitles = document.getElementById('toggle-subtitles');
  const subtitleOptionsSection = document.getElementById('subtitle-options-section');
  const selectSubLang = document.getElementById('select-sub-lang');
  const selectSubMode = document.getElementById('select-sub-mode');
  const chkAutoSubs = document.getElementById('chk-auto-subs');

  // Destination Elements
  const saveModeRadios = document.querySelectorAll('input[name="save_mode"]');
  const localPathSection = document.getElementById('local-path-section');
  const customDestPath = document.getElementById('custom-dest-path');
  const btnValidatePath = document.getElementById('btn-validate-path');
  const pathFeedback = document.getElementById('path-feedback');
  const presetPathsContainer = document.getElementById('preset-paths-container');
  const btnStartCustomDownload = document.getElementById('btn-start-custom-download');

  // Downloads Manager Elements
  const downloadsManager = document.getElementById('downloads-manager');
  const tasksList = document.getElementById('tasks-list');
  const tasksCountBadge = document.getElementById('tasks-count-badge');
  const btnClearFinished = document.getElementById('btn-clear-finished');

  // App State
  let currentVideoInfo = null;
  let selectedResolution = 'best';
  const taskConnections = new Map(); // taskId -> { eventSource, status }

  // Initialize
  loadSystemPaths();

  // Helper: Toast Notifications
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgClass = type === 'error' ? 'bg-red-950/90 border-red-500 text-red-100' :
      type === 'success' ? 'bg-emerald-950/90 border-emerald-500 text-emerald-100' :
        'bg-slate-900/90 border-indigo-500 text-white';

    toast.className = `px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border text-xs sm:text-sm shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto flex items-center gap-2.5 ${bgClass}`;

    const iconName = type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle-2' : 'info';
    toast.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i><span>${message}</span>`;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Helper: Smooth Scroll to Element with Sticky Header Offset
  function scrollToElement(el) {
    if (!el) return;
    const header = document.querySelector('header');
    const headerHeight = header ? header.offsetHeight : 64;
    const targetY = el.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16;
    window.scrollTo({
      top: Math.max(0, targetY),
      behavior: 'smooth'
    });
  }

  // Paste from Clipboard
  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        videoUrlInput.value = text.trim();
        fetchVideoInfo(text.trim());
      }
    } catch (err) {
      showToast('Clipboard access denied. Please paste manually.', 'error');
    }
  });

  // URL Form Submit
  urlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = videoUrlInput.value.trim();
    if (url) {
      fetchVideoInfo(url);
    }
  });

  // Auto fetch on paste
  videoUrlInput.addEventListener('paste', (e) => {
    setTimeout(() => {
      const url = videoUrlInput.value.trim();
      if (url && url.startsWith('http')) {
        fetchVideoInfo(url);
      }
    }, 100);
  });

  // Toggle Options Accordion
  btnToggleOptions.addEventListener('click', () => {
    optionsPanel.classList.toggle('hidden');
    optionsChevron.classList.toggle('rotate-180');
  });

  // Toggle Container type
  selectContainer.addEventListener('change', () => {
    const isAudio = ['mp3', 'm4a', 'wav'].includes(selectContainer.value);
    if (isAudio) {
      audioQualityBox.classList.remove('hidden');
      selectedResolution = 'audio_only';
      highlightSelectedResolution('audio_only');
    } else {
      audioQualityBox.classList.add('hidden');
      if (selectedResolution === 'audio_only') {
        selectedResolution = currentVideoInfo?.default_resolution || 'best';
        highlightSelectedResolution(selectedResolution);
      }
    }
  });

  // Toggle Subtitles Section
  toggleSubtitles.addEventListener('change', () => {
    if (toggleSubtitles.checked) {
      subtitleOptionsSection.classList.remove('hidden');
    } else {
      subtitleOptionsSection.classList.add('hidden');
    }
  });

  // Save Mode Radios
  saveModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'local_folder') {
        localPathSection.classList.remove('hidden');
      } else {
        localPathSection.classList.add('hidden');
      }
    });
  });

  // Validate Path Button
  btnValidatePath.addEventListener('click', async () => {
    const path = customDestPath.value.trim();
    if (!path) {
      pathFeedback.innerHTML = '<span class="text-amber-400">Please enter a directory path.</span>';
      return;
    }
    try {
      const res = await fetch('/api/validate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (data.valid) {
        pathFeedback.innerHTML = `<span class="text-emerald-400 flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i> ${data.message} (${data.path})</span>`;
      } else {
        pathFeedback.innerHTML = `<span class="text-red-400 flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> ${data.message}</span>`;
      }
      lucide.createIcons();
    } catch (err) {
      pathFeedback.innerHTML = '<span class="text-red-400">Failed to validate path.</span>';
    }
  });

  // Fetch Video Info Function
  async function fetchVideoInfo(url) {
    btnFetchSpinner.classList.remove('hidden');
    btnFetchIcon.classList.add('hidden');
    btnFetchText.textContent = 'Extracting...';
    btnFetch.disabled = true;

    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to extract video information');
      }

      const data = await response.json();
      currentVideoInfo = data;
      renderVideoInfo(data);
      showToast('Video information extracted successfully!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnFetchSpinner.classList.add('hidden');
      btnFetchIcon.classList.remove('hidden');
      btnFetchText.textContent = 'Fetch Video';
      btnFetch.disabled = false;
    }
  }

  // Render Video Metadata in UI
  function renderVideoInfo(info) {
    videoCard.classList.remove('hidden');
    videoThumb.src = info.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=60';
    videoDuration.textContent = info.duration_str || '00:00';
    videoTitle.textContent = info.title;
    videoChannel.textContent = info.channel;

    // Platform Badge
    if (info.platform) {
      platformName.textContent = info.platform.name || 'Web Video';
      platformBadge.innerHTML = `<i data-lucide="${info.platform.icon || 'video'}" class="w-3.5 h-3.5 ${info.platform.color || 'text-indigo-400'}"></i><span>${info.platform.name}</span>`;
    }

    if (info.view_count) {
      videoViews.textContent = info.view_count;
      videoViewsContainer.classList.remove('hidden');
    } else {
      videoViewsContainer.classList.add('hidden');
    }

    // Top resolution badge
    const topRes = info.resolutions && info.resolutions.length > 0 ? info.resolutions[0].label : 'HD';
    videoMaxRes.textContent = `${topRes} Available`;

    // Render Resolutions Grid
    resolutionsGrid.innerHTML = '';

    // Auto / Best Option
    const autoCard = createResolutionCard({
      res_key: 'best',
      label: 'Auto (Best Quality)',
      fps_str: 'Max Quality',
      size_str: 'Highest Available'
    }, true);
    resolutionsGrid.appendChild(autoCard);
    selectedResolution = 'best';

    // List individual resolutions
    info.resolutions.forEach(res => {
      const card = createResolutionCard(res, false);
      resolutionsGrid.appendChild(card);
    });

    // Audio Only Card
    const audioCard = createResolutionCard({
      res_key: 'audio_only',
      label: 'Audio Only (MP3)',
      fps_str: '320 kbps',
      size_str: 'Audio Only'
    }, false);
    resolutionsGrid.appendChild(audioCard);

    // Populate Subtitle Languages
    selectSubLang.innerHTML = '';
    if (info.subtitles && info.subtitles.length > 0) {
      info.subtitles.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.code;
        opt.textContent = sub.display;
        selectSubLang.appendChild(opt);
      });
      if (info.default_sub_lang) {
        selectSubLang.value = info.default_sub_lang;
      }
      toggleSubtitles.checked = true;
      subtitleOptionsSection.classList.remove('hidden');
    } else {
      const opt = document.createElement('option');
      opt.value = 'en';
      opt.textContent = 'English (Auto-caption fallback)';
      selectSubLang.appendChild(opt);
      toggleSubtitles.checked = info.has_subtitles || false;
      if (!info.has_subtitles) {
        subtitleOptionsSection.classList.add('hidden');
      }
    }

    lucide.createIcons();
    scrollToElement(videoCard);
  }

  function createResolutionCard(res, isSelected) {
    const div = document.createElement('div');
    div.dataset.resKey = res.res_key;
    div.className = `p-3 sm:p-3.5 rounded-xl border cursor-pointer transition text-left flex flex-col justify-between min-h-[64px] ${isSelected
      ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-md shadow-indigo-500/10'
      : 'border-slate-800 bg-slate-950/60 hover:bg-slate-900/80 text-slate-300'
      }`;

    div.innerHTML = `
      <div class="flex items-center justify-between gap-1 mb-1 sm:mb-1.5">
        <span class="font-bold text-xs sm:text-sm text-white truncate">${res.label}</span>
        ${res.fps_str ? `<span class="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-slate-800/90 text-indigo-300 font-mono shrink-0">${res.fps_str}</span>` : ''}
      </div>
      <div class="text-[10px] sm:text-[11px] text-slate-400 flex items-center justify-between gap-1">
        <span class="truncate">${res.size_str}</span>
        <i data-lucide="check-circle-2" class="w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'opacity-0'}"></i>
      </div>
    `;

    div.addEventListener('click', () => {
      selectedResolution = res.res_key;
      highlightSelectedResolution(res.res_key);
      if (res.res_key === 'audio_only') {
        selectContainer.value = 'mp3';
        audioQualityBox.classList.remove('hidden');
      } else if (['mp3', 'm4a', 'wav'].includes(selectContainer.value)) {
        selectContainer.value = 'mp4';
        audioQualityBox.classList.add('hidden');
      }
    });

    return div;
  }

  function highlightSelectedResolution(resKey) {
    const cards = resolutionsGrid.querySelectorAll('[data-res-key]');
    cards.forEach(card => {
      const isMatch = card.dataset.resKey === resKey;
      const checkIcon = card.querySelector('i');
      if (isMatch) {
        card.className = 'p-3 sm:p-3.5 rounded-xl border cursor-pointer transition text-left flex flex-col justify-between min-h-[64px] border-indigo-500 bg-indigo-500/20 text-white shadow-md shadow-indigo-500/10';
        if (checkIcon) checkIcon.classList.remove('opacity-0');
      } else {
        card.className = 'p-3 sm:p-3.5 rounded-xl border cursor-pointer transition text-left flex flex-col justify-between min-h-[64px] border-slate-800 bg-slate-950/60 hover:bg-slate-900/80 text-slate-300';
        if (checkIcon) checkIcon.classList.add('opacity-0');
      }
    });
  }

  // Load System Preset Paths
  async function loadSystemPaths() {
    try {
      const res = await fetch('/api/system-paths');
      const paths = await res.json();
      presetPathsContainer.innerHTML = '';
      paths.forEach((p, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 font-mono transition';
        btn.textContent = p.label;
        btn.title = p.path;
        btn.addEventListener('click', () => {
          customDestPath.value = p.path;
          btnValidatePath.click();
        });
        presetPathsContainer.appendChild(btn);

        if (idx === 0 && !customDestPath.value) {
          customDestPath.value = p.path;
        }
      });
    } catch (err) {
      console.error('Failed to load system paths', err);
    }
  }

  // Quick Download Button Handler
  btnQuickDownload.addEventListener('click', () => {
    if (!currentVideoInfo) return;
    const saveMode = document.querySelector('input[name="save_mode"]:checked')?.value || 'browser';

    const payload = {
      url: currentVideoInfo.url,
      quality: 'best',
      container: 'mp4',
      subtitles_enabled: toggleSubtitles.checked,
      subtitle_langs: toggleSubtitles.checked ? [selectSubLang.value || 'en'] : [],
      subtitle_mode: 'embed',
      include_auto_subs: chkAutoSubs.checked,
      save_mode: saveMode,
      custom_save_path: saveMode === 'local_folder' ? customDestPath.value.trim() : ''
    };

    triggerDownload(payload);
  });

  // Custom Download Button Handler
  btnStartCustomDownload.addEventListener('click', () => {
    if (!currentVideoInfo) return;
    const saveMode = document.querySelector('input[name="save_mode"]:checked')?.value || 'browser';
    const isSubEnabled = toggleSubtitles.checked;
    const subLangs = isSubEnabled ? [selectSubLang.value] : [];

    const payload = {
      url: currentVideoInfo.url,
      quality: selectedResolution,
      container: selectContainer.value,
      audio_quality: selectAudioBitrate.value,
      subtitles_enabled: isSubEnabled,
      subtitle_langs: subLangs,
      subtitle_mode: selectSubMode.value,
      include_auto_subs: chkAutoSubs.checked,
      save_mode: saveMode,
      custom_save_path: saveMode === 'local_folder' ? customDestPath.value.trim() : ''
    };

    triggerDownload(payload);
  });

  // Start Download and Append to Queue
  async function triggerDownload(payload) {
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Could not start download');
      }

      const { task_id } = await response.json();
      downloadsManager.classList.remove('hidden');

      // Create Dynamic Task Card in Task List
      const card = createTaskCard(task_id, currentVideoInfo, payload);
      updateTasksBadge();

      showToast('Download started in background! You can start another in parallel.', 'success');

      // Listen to SSE progress
      listenToTaskProgress(task_id, payload.save_mode);

      // Dismiss mobile keyboard if open
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }

      // Auto scroll directly to the newly started downloading task card
      setTimeout(() => {
        scrollToElement(card);
        card.classList.add('new-task-highlight');
        setTimeout(() => {
          card.classList.remove('new-task-highlight');
        }, 2400);
      }, 60);

      // Keep top form ready for parallel video downloads
      videoUrlInput.value = '';

    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Create Task Card DOM
  function createTaskCard(taskId, info, payload) {
    const card = document.createElement('div');
    card.id = `task-card-${taskId}`;
    card.className = 'pro-card rounded-2xl p-4 sm:p-5 md:p-6 space-y-3.5 sm:space-y-4 border-indigo-500/30 transition-all duration-300 scroll-mt-20';
    card.dataset.status = 'queued';

    const qualityLabel = payload.quality === 'best' ? 'Auto Max' : (payload.quality === 'audio_only' ? 'MP3 Audio' : payload.quality);
    const containerLabel = (payload.container || 'mp4').toUpperCase();
    const modeLabel = payload.save_mode === 'local_folder' ? 'Local Disk' : 'Browser Download';

    card.innerHTML = `
      <!-- Header Row -->
      <div class="flex items-start justify-between gap-2.5 sm:gap-3">
        <div class="flex items-start space-x-2.5 sm:space-x-3 min-w-0 flex-1">
          <div id="status-icon-${taskId}" class="p-2 sm:p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
            <i data-lucide="loader-2" class="w-4 h-4 sm:w-5 sm:h-5 animate-spin"></i>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1 sm:gap-1.5 mb-1">
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-indigo-300 font-mono tracking-wide border border-slate-700">
                ${qualityLabel} • ${containerLabel}
              </span>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-900 text-slate-400 border border-slate-800">
                ${modeLabel}
              </span>
            </div>
            <h4 id="title-${taskId}" class="text-xs sm:text-sm md:text-base font-bold text-white line-clamp-2 leading-snug break-words">
              ${info?.title || 'Downloading media stream...'}
            </h4>
            <p id="stage-${taskId}" class="text-[11px] sm:text-xs text-indigo-400 font-medium mt-0.5">
              Connecting to media source...
            </p>
          </div>
        </div>

        <!-- Right Action Controls -->
        <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span id="percent-${taskId}" class="text-base sm:text-2xl font-black font-mono text-indigo-400">0%</span>
          <button type="button" id="btn-cancel-${taskId}" title="Stop download and remove temporary files"
            class="px-2 sm:px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition active:scale-95">
            <i data-lucide="square" class="w-3.5 h-3.5 fill-red-400"></i>
            <span class="hidden sm:inline">Stop</span>
          </button>
          <button type="button" id="btn-dismiss-${taskId}" title="Dismiss card"
            class="hidden px-2 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-xs transition active:scale-95">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="w-full bg-slate-900 rounded-full h-2.5 sm:h-3 p-0.5 overflow-hidden border border-slate-800">
        <div id="bar-${taskId}"
          class="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 progress-animated-striped transition-all duration-200"
          style="width: 0%"></div>
      </div>

      <!-- Stats Grid -->
      <div id="stats-${taskId}" class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 text-xs font-mono">
        <div class="bg-slate-950/70 p-2 sm:p-2.5 rounded-lg border border-slate-800">
          <span class="text-slate-400 block text-[9px] uppercase font-sans font-medium tracking-wide">Speed</span>
          <span id="speed-${taskId}" class="text-slate-200 font-semibold text-[11px] sm:text-xs truncate block">-- MB/s</span>
        </div>
        <div class="bg-slate-950/70 p-2 sm:p-2.5 rounded-lg border border-slate-800">
          <span class="text-slate-400 block text-[9px] uppercase font-sans font-medium tracking-wide">ETA</span>
          <span id="eta-${taskId}" class="text-slate-200 font-semibold text-[11px] sm:text-xs truncate block">--:--</span>
        </div>
        <div class="bg-slate-950/70 p-2 sm:p-2.5 rounded-lg border border-slate-800">
          <span class="text-slate-400 block text-[9px] uppercase font-sans font-medium tracking-wide">Downloaded</span>
          <span id="downloaded-${taskId}" class="text-slate-200 font-semibold text-[11px] sm:text-xs truncate block">0 MB</span>
        </div>
        <div class="bg-slate-950/70 p-2 sm:p-2.5 rounded-lg border border-slate-800">
          <span class="text-slate-400 block text-[9px] uppercase font-sans font-medium tracking-wide">Total Size</span>
          <span id="total-size-${taskId}" class="text-slate-200 font-semibold text-[11px] sm:text-xs truncate block">-- MB</span>
        </div>
      </div>

      <!-- Completion Action Area (Revealed on Complete) -->
      <div id="completion-box-${taskId}" class="hidden space-y-2.5 sm:space-y-3 pt-3 border-t border-slate-800/80">
        <div class="p-3 sm:p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
          <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"></i>
          <div class="flex-1 min-w-0">
            <p id="completion-title-${taskId}" class="font-semibold text-white">Media Ready!</p>
            <p id="completion-desc-${taskId}" class="text-slate-300 text-[11px] sm:text-xs mt-0.5">Your file has finished processing.</p>
          </div>
        </div>

        <div id="path-box-${taskId}" class="hidden bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 text-xs flex flex-col xs:flex-row items-stretch xs:items-center justify-between gap-2">
          <code id="path-text-${taskId}" class="text-indigo-300 font-mono text-[11px] truncate flex-1 select-all break-all"></code>
          <button type="button" id="btn-copy-path-${taskId}" class="shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center justify-center gap-1 transition active:scale-95">
            <i data-lucide="copy" class="w-3 h-3"></i>
            <span id="copy-text-${taskId}">Copy Path</span>
          </button>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 pt-1">
          <a id="btn-download-${taskId}" href="/api/file/${taskId}" download
            class="btn-primary-action w-full sm:flex-1 py-3 sm:py-2.5 px-4 rounded-xl font-bold text-white text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-md shadow-indigo-500/20 active:scale-[0.98]">
            <i data-lucide="download" class="w-4 h-4"></i>
            <span id="btn-download-text-${taskId}">Download File Now</span>
          </a>
          <button type="button" id="btn-open-folder-${taskId}" class="hidden btn-secondary w-full sm:w-auto py-3 sm:py-2.5 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-[0.98]">
            <i data-lucide="folder" class="w-3.5 h-3.5 text-slate-300"></i>
            <span>Open Folder</span>
          </button>
        </div>
      </div>

      <!-- Error / Canceled Notice Area -->
      <div id="notice-box-${taskId}" class="hidden p-3 rounded-xl text-xs flex items-start gap-2.5">
        <i id="notice-icon-${taskId}" data-lucide="alert-circle" class="w-4 h-4 shrink-0 mt-0.5"></i>
        <div class="flex-1 min-w-0">
          <p id="notice-title-${taskId}" class="font-semibold"></p>
          <p id="notice-desc-${taskId}" class="text-slate-300 text-xs mt-0.5"></p>
        </div>
      </div>
    `;

    tasksList.prepend(card);
    lucide.createIcons();

    // Attach Stop / Cancel Button Event
    const btnCancel = card.querySelector(`#btn-cancel-${taskId}`);
    btnCancel.addEventListener('click', () => {
      cancelTaskDownload(taskId);
    });

    // Attach Dismiss Button Event
    const btnDismiss = card.querySelector(`#btn-dismiss-${taskId}`);
    btnDismiss.addEventListener('click', () => {
      removeTaskCard(taskId);
    });

    // Attach Copy Path Button Event
    const btnCopyPath = card.querySelector(`#btn-copy-path-${taskId}`);
    const pathText = card.querySelector(`#path-text-${taskId}`);
    const copyText = card.querySelector(`#copy-text-${taskId}`);
    if (btnCopyPath) {
      btnCopyPath.addEventListener('click', async () => {
        if (!pathText.textContent) return;
        try {
          await navigator.clipboard.writeText(pathText.textContent);
          copyText.textContent = 'Copied!';
          showToast('File path copied to clipboard!', 'info');
          setTimeout(() => { copyText.textContent = 'Copy Path'; }, 2000);
        } catch (e) {
          showToast('Failed to copy path', 'error');
        }
      });
    }

    // Attach Open Folder Event
    const btnOpenFolder = card.querySelector(`#btn-open-folder-${taskId}`);
    if (btnOpenFolder) {
      btnOpenFolder.addEventListener('click', async () => {
        const path = btnOpenFolder.dataset.folderPath;
        if (!path) return;
        try {
          const res = await fetch('/api/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
          });
          const result = await res.json();
          if (result.success) {
            showToast('Opened folder in file manager', 'success');
          } else {
            showToast(result.message || 'Could not launch file manager', 'error');
          }
        } catch (err) {
          showToast('Failed to open folder', 'error');
        }
      });
    }

    // Attach Download feedback
    const btnDownload = card.querySelector(`#btn-download-${taskId}`);
    if (btnDownload) {
      btnDownload.addEventListener('click', () => {
        showToast('Starting browser file download...', 'info');
      });
    }

    return card;
  }

  // SSE Stream Listener for Specific Task
  function listenToTaskProgress(taskId, saveMode) {
    if (taskConnections.has(taskId)) {
      taskConnections.get(taskId).eventSource?.close();
    }

    const eventSource = new EventSource(`/api/progress/${taskId}`);
    taskConnections.set(taskId, { eventSource, status: 'running' });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        updateTaskUI(taskId, data, saveMode);

        if (data.status === 'completed') {
          eventSource.close();
          taskConnections.set(taskId, { eventSource: null, status: 'completed' });
          onTaskCompleted(taskId, data, saveMode);
          updateTasksBadge();
        } else if (data.status === 'canceled') {
          eventSource.close();
          taskConnections.set(taskId, { eventSource: null, status: 'canceled' });
          onTaskCanceled(taskId, data);
          updateTasksBadge();
        } else if (data.status === 'failed') {
          eventSource.close();
          taskConnections.set(taskId, { eventSource: null, status: 'failed' });
          onTaskFailed(taskId, data);
          updateTasksBadge();
        }
      } catch (e) {
        console.error('Error parsing progress data', e);
      }
    };

    eventSource.onerror = (err) => {
      console.warn(`SSE stream disconnected for task ${taskId}`, err);
    };
  }

  // Update Task UI
  function updateTaskUI(taskId, data, saveMode) {
    const card = document.getElementById(`task-card-${taskId}`);
    if (!card) return;

    card.dataset.status = 'running';
    const titleEl = card.querySelector(`#title-${taskId}`);
    const stageEl = card.querySelector(`#stage-${taskId}`);
    const percentEl = card.querySelector(`#percent-${taskId}`);
    const barEl = card.querySelector(`#bar-${taskId}`);
    const speedEl = card.querySelector(`#speed-${taskId}`);
    const etaEl = card.querySelector(`#eta-${taskId}`);
    const downloadedEl = card.querySelector(`#downloaded-${taskId}`);
    const totalSizeEl = card.querySelector(`#total-size-${taskId}`);

    if (data.title && titleEl) titleEl.textContent = data.title;
    if (data.stage && stageEl) stageEl.textContent = data.stage;

    const pct = data.progress || 0;
    if (percentEl) percentEl.textContent = `${pct.toFixed(0)}%`;
    if (barEl) barEl.style.width = `${pct}%`;

    if (speedEl) speedEl.textContent = data.speed || '-- MB/s';
    if (etaEl) etaEl.textContent = data.eta || '--:--';
    if (downloadedEl) downloadedEl.textContent = formatBytes(data.downloaded_bytes);
    if (totalSizeEl) totalSizeEl.textContent = data.total_bytes ? formatBytes(data.total_bytes) : (data.file_size_str || '-- MB');
  }

  // Task Completed Handler
  function onTaskCompleted(taskId, data, saveMode) {
    const card = document.getElementById(`task-card-${taskId}`);
    if (!card) return;

    card.dataset.status = 'completed';
    card.classList.remove('border-indigo-500/30');
    card.classList.add('border-emerald-500/40');

    const statusIcon = card.querySelector(`#status-icon-${taskId}`);
    if (statusIcon) {
      statusIcon.className = 'p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5';
      statusIcon.innerHTML = '<i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-400"></i>';
    }

    const stageEl = card.querySelector(`#stage-${taskId}`);
    if (stageEl) stageEl.textContent = '✓ Download & Processing Complete!';

    const percentEl = card.querySelector(`#percent-${taskId}`);
    if (percentEl) {
      percentEl.textContent = '100%';
      percentEl.className = 'text-lg sm:text-2xl font-black font-mono text-emerald-400';
    }

    const barEl = card.querySelector(`#bar-${taskId}`);
    if (barEl) {
      barEl.style.width = '100%';
      barEl.className = 'h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300';
    }

    const speedEl = card.querySelector(`#speed-${taskId}`);
    if (speedEl) speedEl.textContent = 'Complete';
    const etaEl = card.querySelector(`#eta-${taskId}`);
    if (etaEl) etaEl.textContent = '00:00';

    const finalSize = data.file_size_str || formatBytes(data.file_size || data.total_bytes);
    const downloadedEl = card.querySelector(`#downloaded-${taskId}`);
    if (downloadedEl) downloadedEl.textContent = finalSize;
    const totalSizeEl = card.querySelector(`#total-size-${taskId}`);
    if (totalSizeEl) totalSizeEl.textContent = finalSize;

    // Toggle buttons: hide Stop, show Dismiss
    const btnCancel = card.querySelector(`#btn-cancel-${taskId}`);
    if (btnCancel) btnCancel.classList.add('hidden');
    const btnDismiss = card.querySelector(`#btn-dismiss-${taskId}`);
    if (btnDismiss) btnDismiss.classList.remove('hidden');

    // Configure completion box
    const completionBox = card.querySelector(`#completion-box-${taskId}`);
    const completionTitle = card.querySelector(`#completion-title-${taskId}`);
    const completionDesc = card.querySelector(`#completion-desc-${taskId}`);
    const pathBox = card.querySelector(`#path-box-${taskId}`);
    const pathText = card.querySelector(`#path-text-${taskId}`);
    const btnDownload = card.querySelector(`#btn-download-${taskId}`);
    const btnDownloadText = card.querySelector(`#btn-download-text-${taskId}`);
    const btnOpenFolder = card.querySelector(`#btn-open-folder-${taskId}`);

    if (btnDownload) {
      btnDownload.href = `/api/file/${taskId}`;
      btnDownload.setAttribute('download', data.filename || 'video.mp4');
    }
    if (btnDownloadText) {
      btnDownloadText.textContent = `Download File (${finalSize})`;
    }

    if (saveMode === 'local_folder') {
      const destPath = data.final_dest_path || data.custom_save_path || '';
      if (completionTitle) completionTitle.textContent = 'Saved to Local Folder!';
      if (completionDesc) completionDesc.textContent = 'File written to disk. Click below to download a browser copy or open the directory.';
      if (pathBox) pathBox.classList.remove('hidden');
      if (pathText) pathText.textContent = destPath;

      if (btnOpenFolder) {
        const folderPath = destPath.includes('/') ? destPath.substring(0, destPath.lastIndexOf('/')) || '/' : destPath;
        btnOpenFolder.dataset.folderPath = folderPath || destPath;
        btnOpenFolder.classList.remove('hidden');
      }
      showToast(`Saved to folder: ${destPath}`, 'success');
    } else {
      if (completionTitle) completionTitle.textContent = 'Media Ready for Download!';
      if (completionDesc) completionDesc.textContent = 'If the download did not start automatically, click Download File below.';
      if (pathBox) pathBox.classList.add('hidden');
      if (btnOpenFolder) btnOpenFolder.classList.add('hidden');

      // Auto download attempt
      try {
        const a = document.createElement('a');
        a.href = `/api/file/${taskId}`;
        a.setAttribute('download', data.filename || 'video.mp4');
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 400);
        showToast('Download complete! Saving to your device...', 'success');
      } catch (e) {
        console.warn('Auto download error', e);
      }
    }

    if (completionBox) completionBox.classList.remove('hidden');
    lucide.createIcons();
  }

  // Task Canceled Handler
  function onTaskCanceled(taskId, data) {
    const card = document.getElementById(`task-card-${taskId}`);
    if (!card) return;

    card.dataset.status = 'canceled';
    card.classList.remove('border-indigo-500/30', 'border-emerald-500/40');
    card.classList.add('border-slate-800');

    const statusIcon = card.querySelector(`#status-icon-${taskId}`);
    if (statusIcon) {
      statusIcon.className = 'p-2.5 rounded-xl bg-slate-800 text-slate-400 shrink-0 mt-0.5';
      statusIcon.innerHTML = '<i data-lucide="square" class="w-5 h-5 text-slate-400"></i>';
    }

    const stageEl = card.querySelector(`#stage-${taskId}`);
    if (stageEl) {
      stageEl.textContent = 'Download canceled and temporary files deleted.';
      stageEl.className = 'text-xs text-slate-400 font-medium mt-0.5';
    }

    const percentEl = card.querySelector(`#percent-${taskId}`);
    if (percentEl) {
      percentEl.textContent = 'Canceled';
      percentEl.className = 'text-sm sm:text-base font-bold text-slate-400';
    }

    const barEl = card.querySelector(`#bar-${taskId}`);
    if (barEl) {
      barEl.className = 'h-full rounded-full bg-slate-700 transition-all duration-300';
    }

    // Toggle buttons: hide Stop, show Dismiss
    const btnCancel = card.querySelector(`#btn-cancel-${taskId}`);
    if (btnCancel) btnCancel.classList.add('hidden');
    const btnDismiss = card.querySelector(`#btn-dismiss-${taskId}`);
    if (btnDismiss) btnDismiss.classList.remove('hidden');

    // Hide completion box
    const completionBox = card.querySelector(`#completion-box-${taskId}`);
    if (completionBox) completionBox.classList.add('hidden');

    // Show notice box
    const noticeBox = card.querySelector(`#notice-box-${taskId}`);
    const noticeTitle = card.querySelector(`#notice-title-${taskId}`);
    const noticeDesc = card.querySelector(`#notice-desc-${taskId}`);
    const noticeIcon = card.querySelector(`#notice-icon-${taskId}`);

    if (noticeBox) {
      noticeBox.className = 'p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs flex items-start gap-2.5';
      noticeBox.classList.remove('hidden');
    }
    if (noticeIcon) noticeIcon.outerHTML = '<i data-lucide="check" class="w-4 h-4 text-slate-400 shrink-0 mt-0.5"></i>';
    if (noticeTitle) noticeTitle.textContent = 'Download Stopped';
    if (noticeDesc) noticeDesc.textContent = 'The download was stopped and all partial / incomplete files were cleanly deleted.';

    lucide.createIcons();
  }

  // Task Failed Handler
  function onTaskFailed(taskId, data) {
    const card = document.getElementById(`task-card-${taskId}`);
    if (!card) return;

    card.dataset.status = 'failed';
    card.classList.remove('border-indigo-500/30');
    card.classList.add('border-red-500/40');

    const statusIcon = card.querySelector(`#status-icon-${taskId}`);
    if (statusIcon) {
      statusIcon.className = 'p-2.5 rounded-xl bg-red-500/20 text-red-400 shrink-0 mt-0.5';
      statusIcon.innerHTML = '<i data-lucide="alert-circle" class="w-5 h-5 text-red-400"></i>';
    }

    const stageEl = card.querySelector(`#stage-${taskId}`);
    if (stageEl) {
      stageEl.textContent = 'Download failed.';
      stageEl.className = 'text-xs text-red-400 font-medium mt-0.5';
    }

    const percentEl = card.querySelector(`#percent-${taskId}`);
    if (percentEl) {
      percentEl.textContent = 'Failed';
      percentEl.className = 'text-sm sm:text-base font-bold text-red-400';
    }

    const barEl = card.querySelector(`#bar-${taskId}`);
    if (barEl) {
      barEl.className = 'h-full rounded-full bg-red-500/60 transition-all duration-300';
    }

    // Toggle buttons
    const btnCancel = card.querySelector(`#btn-cancel-${taskId}`);
    if (btnCancel) btnCancel.classList.add('hidden');
    const btnDismiss = card.querySelector(`#btn-dismiss-${taskId}`);
    if (btnDismiss) btnDismiss.classList.remove('hidden');

    // Show error notice
    const noticeBox = card.querySelector(`#notice-box-${taskId}`);
    const noticeTitle = card.querySelector(`#notice-title-${taskId}`);
    const noticeDesc = card.querySelector(`#notice-desc-${taskId}`);

    if (noticeBox) {
      noticeBox.className = 'p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5';
      noticeBox.classList.remove('hidden');
    }
    if (noticeTitle) noticeTitle.textContent = 'Download Error';
    if (noticeDesc) noticeDesc.textContent = data.error || 'An unexpected error occurred during download.';

    lucide.createIcons();
    showToast(`Error: ${data.error || 'Download failed'}`, 'error');
  }

  // Cancel Task API Trigger
  async function cancelTaskDownload(taskId) {
    showToast('Stopping download and deleting files...', 'info');
    try {
      const conn = taskConnections.get(taskId);
      if (conn?.eventSource) {
        conn.eventSource.close();
      }

      await fetch(`/api/task/${taskId}/cancel`, {
        method: 'POST',
      });
      onTaskCanceled(taskId, { error: 'Download canceled by user.' });
      updateTasksBadge();
      showToast('Download stopped. All partial files were cleanly deleted.', 'info');
    } catch (err) {
      showToast('Failed to cancel task: ' + err.message, 'error');
    }
  }

  // Remove Task Card
  function removeTaskCard(taskId) {
    const card = document.getElementById(`task-card-${taskId}`);
    if (card) {
      card.classList.add('opacity-0', 'scale-95');
      setTimeout(() => {
        card.remove();
        taskConnections.delete(taskId);
        updateTasksBadge();
      }, 250);
    }
  }

  // Clear Finished Button
  btnClearFinished.addEventListener('click', () => {
    const finishedCards = tasksList.querySelectorAll('[data-status="completed"], [data-status="canceled"], [data-status="failed"]');
    finishedCards.forEach(card => {
      const taskId = card.id.replace('task-card-', '');
      removeTaskCard(taskId);
    });
    showToast('Cleared completed and canceled tasks', 'info');
  });

  // Update Tasks Count Badge
  function updateTasksBadge() {
    const total = tasksList.children.length;
    let active = 0;
    tasksList.querySelectorAll('[data-status]').forEach(card => {
      if (card.dataset.status === 'running' || card.dataset.status === 'queued') {
        active++;
      }
    });

    if (total === 0) {
      downloadsManager.classList.add('hidden');
    } else {
      downloadsManager.classList.remove('hidden');
      if (active > 0) {
        tasksCountBadge.textContent = `${active} Active`;
        tasksCountBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
      } else {
        tasksCountBadge.textContent = `${total} Finished`;
        tasksCountBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      }
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

});
