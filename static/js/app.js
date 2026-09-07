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

  // Progress Card Elements
  const progressCard = document.getElementById('progress-card');
  const taskTitle = document.getElementById('task-title');
  const taskStage = document.getElementById('task-stage');
  const taskPercent = document.getElementById('task-percent');
  const taskProgressBar = document.getElementById('task-progress-bar');
  const taskSpeed = document.getElementById('task-speed');
  const taskEta = document.getElementById('task-eta');
  const taskDownloaded = document.getElementById('task-downloaded');
  const taskTotalSize = document.getElementById('task-total-size');
  const taskErrorBox = document.getElementById('task-error-box');
  const taskErrorMsg = document.getElementById('task-error-msg');
  const taskStatusIcon = document.getElementById('task-status-icon');

  // App State
  let currentVideoInfo = null;
  let selectedResolution = 'best';
  let activeEventSource = null;
  let currentTask = null;

  // Initialize
  loadSystemPaths();

  // Helper: Toast Notifications
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgClass = type === 'error' ? 'bg-red-950/90 border-red-500 text-red-100' :
      type === 'success' ? 'bg-emerald-950/90 border-emerald-500 text-emerald-100' :
        'bg-slate-900/90 border-indigo-500 text-white';

    toast.className = `px-4 py-3 rounded-xl border text-xs sm:text-sm shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto flex items-center gap-2.5 ${bgClass}`;

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
    videoCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function createResolutionCard(res, isSelected) {
    const div = document.createElement('div');
    div.dataset.resKey = res.res_key;
    div.className = `p-3.5 rounded-xl border cursor-pointer transition text-left flex flex-col justify-between ${isSelected
      ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-md shadow-indigo-500/10'
      : 'border-slate-800 bg-slate-950/60 hover:bg-slate-900/80 text-slate-300'
      }`;

    div.innerHTML = `
      <div class="flex items-center justify-between mb-1.5">
        <span class="font-bold text-xs sm:text-sm text-white">${res.label}</span>
        ${res.fps_str ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/90 text-indigo-300 font-mono">${res.fps_str}</span>` : ''}
      </div>
      <div class="text-[11px] text-slate-400 flex items-center justify-between">
        <span>${res.size_str}</span>
        <i data-lucide="check-circle-2" class="w-3.5 h-3.5 ${isSelected ? 'text-indigo-400' : 'opacity-0'}"></i>
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
        card.className = 'p-3.5 rounded-xl border cursor-pointer transition text-left flex flex-col justify-between border-indigo-500 bg-indigo-500/20 text-white shadow-md shadow-indigo-500/10';
        if (checkIcon) checkIcon.classList.remove('opacity-0');
      } else {
        card.className = 'p-3.5 rounded-xl border cursor-pointer transition text-left flex flex-col justify-between border-slate-800 bg-slate-950/60 hover:bg-slate-900/80 text-slate-300';
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

  // Start Download and Connect SSE
  async function triggerDownload(payload) {
    try {
      progressCard.classList.remove('hidden');
      taskTitle.textContent = currentVideoInfo?.title || 'Downloading media...';
      taskStage.textContent = 'Queueing download task...';
      taskPercent.textContent = '0%';
      taskProgressBar.style.width = '0%';
      taskProgressBar.className = 'h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 progress-animated-striped transition-all duration-200';
      taskSpeed.textContent = '-- MB/s';
      taskEta.textContent = '--:--';
      taskDownloaded.textContent = '0 MB';
      taskTotalSize.textContent = '-- MB';
      taskErrorBox.classList.add('hidden');
      taskStatusIcon.className = 'p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400';
      taskStatusIcon.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>';
      lucide.createIcons();

      progressCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

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
      currentTask = task_id;
      showToast('Download started in background!', 'info');

      // Listen to SSE progress
      listenToProgress(task_id, payload.save_mode);

    } catch (err) {
      showToast(err.message, 'error');
      taskErrorBox.classList.remove('hidden');
      taskErrorMsg.textContent = err.message;
      taskStage.textContent = 'Failed to start download';
    }
  }

  // SSE Stream Listener
  function listenToProgress(taskId, saveMode) {
    if (activeEventSource) {
      activeEventSource.close();
    }

    activeEventSource = new EventSource(`/api/progress/${taskId}`);

    activeEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        updateProgressUI(data);

        if (data.status === 'completed') {
          activeEventSource.close();
          onDownloadCompleted(data, taskId, saveMode);
        } else if (data.status === 'failed') {
          activeEventSource.close();
          onDownloadFailed(data);
        }
      } catch (e) {
        console.error('Error parsing progress data', e);
      }
    };

    activeEventSource.onerror = (err) => {
      console.warn('SSE stream disconnected, polling status...', err);
    };
  }

  function updateProgressUI(data) {
    if (data.title) taskTitle.textContent = data.title;
    if (data.stage) taskStage.textContent = data.stage;

    const pct = data.progress || 0;
    taskPercent.textContent = `${pct.toFixed(0)}%`;
    taskProgressBar.style.width = `${pct}%`;

    taskSpeed.textContent = data.speed || '-- MB/s';
    taskEta.textContent = data.eta || '--:--';
    taskDownloaded.textContent = formatBytes(data.downloaded_bytes);
    taskTotalSize.textContent = data.total_bytes ? formatBytes(data.total_bytes) : (data.file_size_str || '-- MB');
  }

  function onDownloadCompleted(data, taskId, saveMode) {
    taskPercent.textContent = '100%';
    taskProgressBar.style.width = '100%';
    taskProgressBar.className = 'h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300';
    taskStage.textContent = '✓ Download & Processing Complete!';

    // Replace rotating spinner with static green checkmark icon
    taskStatusIcon.className = 'p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400';
    taskStatusIcon.innerHTML = '<i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-400"></i>';

    taskSpeed.textContent = 'Complete';
    taskEta.textContent = '00:00';

    const finalSize = data.file_size_str || formatBytes(data.file_size || data.total_bytes);
    taskDownloaded.textContent = finalSize;
    taskTotalSize.textContent = finalSize;

    // Trigger automatic browser download
    if (saveMode === 'browser') {
      const a = document.createElement('a');
      a.href = `/api/file/${taskId}`;
      a.setAttribute('download', data.filename || 'video.mp4');
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 300);
      showToast('Download complete! Saving to your device...', 'success');
    } else {
      showToast(`Saved to folder: ${data.final_dest_path || 'Local storage'}`, 'success');
    }

    lucide.createIcons();
  }

  function onDownloadFailed(data) {
    taskStatusIcon.className = 'p-2.5 rounded-xl bg-red-500/20 text-red-400';
    taskStatusIcon.innerHTML = '<i data-lucide="alert-circle" class="w-5 h-5 text-red-400"></i>';
    taskStage.textContent = 'Download failed.';
    taskErrorBox.classList.remove('hidden');
    taskErrorMsg.textContent = data.error || 'An unexpected error occurred during processing.';
    lucide.createIcons();
    showToast(`Error: ${data.error || 'Download failed'}`, 'error');
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

});
