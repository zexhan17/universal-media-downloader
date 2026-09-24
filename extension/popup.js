/**
 * Universal Media Downloader - Popup Logic
 * Communicates with background worker, active tab content script, and local FastAPI server
 */

const SERVER_BASE = 'http://localhost:8000';
let activeTab = null;
let detectedItems = [];
let pendingDownloadItem = null;
let pollTasksInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupEventListeners();

  // Initial server ping
  await checkServerHealth();

  // Get active tab and scan for media
  await initActiveTabScan();

  // Start polling tasks
  startTasksPolling();
});

// -----------------------------------------------------------------------------
// Server Health Check
// -----------------------------------------------------------------------------
async function checkServerHealth() {
  const statusBadge = document.getElementById('server-status');
  const statusText = document.getElementById('server-status-text');
  const offlineAlert = document.getElementById('offline-alert');

  try {
    const res = await fetch(`${SERVER_BASE}/api/tasks`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (res.ok) {
      statusBadge.className = 'status-badge status-online';
      statusText.textContent = 'Server Online';
      offlineAlert.classList.add('hidden');
      return true;
    } else {
      throw new Error(`Server returned ${res.status}`);
    }
  } catch (err) {
    statusBadge.className = 'status-badge status-offline';
    statusText.textContent = 'Server Offline';
    offlineAlert.classList.remove('hidden');
    return false;
  }
}

// -----------------------------------------------------------------------------
// Tab Scanning & Media Detection
// -----------------------------------------------------------------------------
async function initActiveTabScan() {
  const container = document.getElementById('detected-streams-container');
  const emptyState = document.getElementById('no-media-detected');
  const countBadge = document.getElementById('badge-detected-count');

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) return;
    activeTab = tabs[0];

    // Request sniffed media from background service worker
    chrome.runtime.sendMessage({ type: 'GET_TAB_MEDIA', tabId: activeTab.id }, (bgResponse) => {
      const bgMedia = (bgResponse && bgResponse.media) ? bgResponse.media : [];

      // Request DOM scanned media from content script
      chrome.tabs.sendMessage(activeTab.id, { action: 'SCAN_DOM' }, (contentResponse) => {
        // Handle runtime error (e.g. on chrome:// or restricted pages)
        if (chrome.runtime.lastError) {
          // Fall back to just background media
          renderDetectedList(bgMedia);
          return;
        }

        const domMedia = (contentResponse && contentResponse.items) ? contentResponse.items : [];

        // Merge & deduplicate
        const merged = [...bgMedia];
        domMedia.forEach(item => {
          if (!merged.some(m => m.url === item.url)) {
            merged.push(item);
          }
        });

        renderDetectedList(merged);
      });
    });
  } catch (e) {
    console.error('Scan error:', e);
  }
}

// Helper: Group variants under the same stream base path
function getStreamGroupKey(url) {
  try {
    const u = new URL(url);
    const pathname = u.pathname;
    const lastSlash = pathname.lastIndexOf('/');
    const dir = lastSlash > 0 ? pathname.substring(0, lastSlash) : pathname;
    return `${u.origin}${dir}`;
  } catch (e) {
    return url.split('?')[0];
  }
}

// Render the list of detected streams
function renderDetectedList(items) {
  // Deduplicate streams belonging to the same video/folder
  const uniqueItems = [];
  items.forEach(item => {
    const key = getStreamGroupKey(item.url);
    const existingIdx = uniqueItems.findIndex(u => getStreamGroupKey(u.url) === key);
    if (existingIdx === -1) {
      uniqueItems.push(item);
    } else if (item.url.includes('master') && !uniqueItems[existingIdx].url.includes('master')) {
      // Prefer master playlist over sub-variant playlists
      uniqueItems[existingIdx] = item;
    }
  });

  detectedItems = uniqueItems;
  const container = document.getElementById('detected-streams-container');
  const emptyState = document.getElementById('no-media-detected');
  const countBadge = document.getElementById('badge-detected-count');

  container.innerHTML = '';
  countBadge.textContent = String(detectedItems.length);

  // Check if current tab is a recognized platform (YouTube, TikTok, Twitter/X, etc.)
  const isPlatform = isRecognizedPlatform(activeTab ? activeTab.url : '');

  if (detectedItems.length === 0 && !isPlatform) {
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  // If on YouTube or similar platform, show top card to fetch full video formats
  if (isPlatform) {
    const platformCard = createPlatformCard(activeTab.url, activeTab.title);
    container.appendChild(platformCard);
  }

  // If multiple streams detected, offer a 1-click Copy All JSON action
  if (items.length > 1) {
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px;';
    toolbar.innerHTML = `
      <button id="btn-copy-all-json" class="btn-xs" style="background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.4);display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
        <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        Copy All (${items.length}) as JSON
      </button>
    `;
    container.appendChild(toolbar);
    toolbar.querySelector('#btn-copy-all-json').addEventListener('click', async () => {
      const allStreams = items.map(d => ({
        title: d.title || (activeTab ? activeTab.title : 'Web Video'),
        url: d.url,
        referer: d.referer || (activeTab ? activeTab.url : ''),
        type: d.type || 'Media Stream'
      }));
      try {
        await navigator.clipboard.writeText(JSON.stringify(allStreams, null, 2));
        showToast(`Copied all ${allStreams.length} streams to clipboard!`);
      } catch (e) {
        showToast('Failed to copy', 'error');
      }
    });
  }

  // Render individual detected streams (.m3u8, direct mp4, etc.)
  items.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'stream-item';

    const isHls = item.url.includes('.m3u8') || (item.type && item.type.includes('HLS'));
    const badgeClass = isHls ? 'badge-hls' : 'badge-direct';
    const badgeLabel = isHls ? 'HLS Stream (.m3u8)' : (item.type || 'Direct Stream');

    // Clean display title
    const displayTitle = item.title || (activeTab ? activeTab.title : `Media Stream #${index + 1}`);
    const sourceLabel = item.source === 'network' ? 'Network Sniffer' : (item.source === 'network_cache' ? 'Hls.js Cache' : 'Page Player');
    const refererHtml = item.referer ? `
      <div class="stream-referer-preview" title="${escapeHtml(item.referer)}">
        <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        <span>Referer: ${escapeHtml(item.referer)}</span>
      </div>
    ` : '';

    card.innerHTML = `
      <div class="stream-header">
        <span class="stream-badge ${badgeClass}">${badgeLabel}</span>
        <span class="stream-source-tag">${sourceLabel}</span>
      </div>
      <div class="stream-title">${escapeHtml(displayTitle)}</div>
      <div class="stream-url-preview" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</div>
      ${refererHtml}
      <div class="stream-actions">
        <button class="btn-primary btn-sm btn-open-webapp" data-index="${index}" title="Open directly in full web app with referer and metadata loaded">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          Open in Web App
        </button>
        <button class="btn-secondary btn-sm btn-copy-json" data-index="${index}" title="Copy structured JSON with URL and headers to clipboard">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Copy JSON
        </button>
        <button class="btn-secondary btn-sm btn-copy-url" data-url="${escapeHtml(item.url)}" title="Copy raw stream URL">
          Copy Link
        </button>
        <button class="btn-secondary btn-sm btn-download-stream" data-index="${index}" title="Quick download in background">
          Quick DL
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  // Attach event handlers
  container.querySelectorAll('.btn-open-webapp').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      const stream = detectedItems[idx];
      if (stream) openStreamInWebApp(stream);
    });
  });

  container.querySelectorAll('.btn-copy-json').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      const stream = detectedItems[idx];
      if (stream) copyStreamJson(stream);
    });
  });

  container.querySelectorAll('.btn-download-stream').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      const stream = detectedItems[idx];
      if (stream) promptDownloadItem(stream);
    });
  });

  container.querySelectorAll('.btn-copy-url').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.url);
        showToast('Stream link copied to clipboard!');
      } catch (err) {
        showToast('Failed to copy', 'error');
      }
    });
  });
}

// Open stream directly in full web app tab
function openStreamInWebApp(stream) {
  const displayTitle = stream.title || (activeTab ? activeTab.title : 'Web Video');
  const streamData = {
    title: displayTitle,
    url: stream.url,
    referer: stream.referer || (activeTab ? activeTab.url : ''),
    pageUrl: activeTab ? activeTab.url : '',
    type: stream.type || 'Media Stream'
  };

  const targetUrl = `${SERVER_BASE}/?stream_data=${encodeURIComponent(JSON.stringify(streamData))}`;

  if (chrome.tabs && chrome.tabs.create) {
    chrome.tabs.query({ url: '*://localhost:8000/*' }, (existingTabs) => {
      if (existingTabs && existingTabs.length > 0) {
        chrome.tabs.update(existingTabs[0].id, { url: targetUrl, active: true });
      } else {
        chrome.tabs.create({ url: targetUrl });
      }
    });
  } else {
    window.open(targetUrl, '_blank');
  }
}

// Copy clean structured JSON with all metadata to clipboard
async function copyStreamJson(stream) {
  const displayTitle = stream.title || (activeTab ? activeTab.title : 'Web Video');
  const streamData = {
    title: displayTitle,
    url: stream.url,
    referer: stream.referer || (activeTab ? activeTab.url : ''),
    pageUrl: activeTab ? activeTab.url : '',
    type: stream.type || 'Media Stream',
    userAgent: navigator.userAgent,
    extractedAt: new Date().toISOString()
  };

  try {
    await navigator.clipboard.writeText(JSON.stringify(streamData, null, 2));
    showToast('Copied structured JSON! You can paste it into the Web App.');
  } catch (err) {
    showToast('Failed to copy JSON to clipboard', 'error');
  }
}

// Card for recognized platforms
function createPlatformCard(url, title) {
  const div = document.createElement('div');
  div.className = 'stream-item';
  div.style.borderColor = '#6366f1';
  div.innerHTML = `
    <div class="stream-header">
      <span class="stream-badge" style="background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.4)">Web Page Video</span>
      <span class="stream-source-tag">Supported Platform</span>
    </div>
    <div class="stream-title">${escapeHtml(title || 'Current Webpage Video')}</div>
    <div class="stream-url-preview">${escapeHtml(url)}</div>
    <div class="stream-actions">
      <button class="btn-primary btn-sm btn-platform-open-webapp">
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        Open in Web App
      </button>
      <button class="btn-secondary btn-sm btn-platform-copy-json">
        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        Copy JSON
      </button>
      <button class="btn-secondary btn-sm btn-fetch-platform-info">
        Quick DL
      </button>
    </div>
  `;

  div.querySelector('.btn-platform-open-webapp').addEventListener('click', () => {
    openStreamInWebApp({ url, title, referer: url, type: 'Page Video' });
  });

  div.querySelector('.btn-platform-copy-json').addEventListener('click', () => {
    copyStreamJson({ url, title, referer: url, type: 'Page Video' });
  });

  div.querySelector('.btn-fetch-platform-info').addEventListener('click', () => {
    promptDownloadItem({
      url: url,
      title: title,
      referer: url,
      type: 'Page Video'
    });
  });

  return div;
}

function isRecognizedPlatform(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.includes('youtube.com/watch') || u.includes('youtu.be/') ||
    u.includes('twitter.com') || u.includes('x.com') ||
    u.includes('instagram.com') || u.includes('tiktok.com') ||
    u.includes('reddit.com') || u.includes('vimeo.com') ||
    u.includes('dailymotion.com') || u.includes('facebook.com');
}

// -----------------------------------------------------------------------------
// Download Flow & Options
// -----------------------------------------------------------------------------
function promptDownloadItem(item) {
  pendingDownloadItem = item;
  const optionsCard = document.getElementById('video-options-card');
  const optTitle = document.getElementById('opt-title');
  const optThumb = document.getElementById('opt-thumb');
  const optDuration = document.getElementById('opt-duration');
  const optPlatform = document.getElementById('opt-platform');

  optTitle.textContent = item.title || 'Selected Media Stream';
  optDuration.textContent = item.type || 'Stream';
  optPlatform.textContent = (item.url.includes('.m3u8')) ? 'HLS Stream' : 'Video';
  optThumb.src = item.thumbnail || 'icons/icon128.png';

  optionsCard.classList.remove('hidden');
  optionsCard.scrollIntoView({ behavior: 'smooth' });
}

async function triggerDownload(downloadPayload) {
  try {
    showToast('Sending download task to local server...');
    const res = await fetch(`${SERVER_BASE}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(downloadPayload)
    });

    const data = await res.json();
    if (res.ok && data.task_id) {
      showToast('Download started successfully!');
      // Switch to tasks tab
      switchTab('tasks');
      fetchTasks();
    } else {
      showToast(`Download failed: ${data.detail || 'Server error'}`, 'error');
    }
  } catch (err) {
    showToast(`Error connecting to server: ${err.message}`, 'error');
  }
}

// -----------------------------------------------------------------------------
// Active Tasks Polling & Management
// -----------------------------------------------------------------------------
function startTasksPolling() {
  fetchTasks();
  if (pollTasksInterval) clearInterval(pollTasksInterval);
  pollTasksInterval = setInterval(fetchTasks, 2000);
}

async function fetchTasks() {
  try {
    const res = await fetch(`${SERVER_BASE}/api/tasks`);
    if (!res.ok) return;
    const tasks = await res.json();

    const tasksList = document.getElementById('tasks-list');
    const noTasksState = document.getElementById('no-tasks-state');
    const tasksCountBadge = document.getElementById('badge-tasks-count');

    const activeCount = tasks.filter(t => t.status === 'downloading' || t.status === 'processing' || t.status === 'queued').length;
    if (activeCount > 0) {
      tasksCountBadge.textContent = String(activeCount);
      tasksCountBadge.classList.remove('hidden');
    } else {
      tasksCountBadge.classList.add('hidden');
    }

    if (tasks.length === 0) {
      tasksList.innerHTML = '';
      noTasksState.classList.remove('hidden');
      return;
    }

    noTasksState.classList.add('hidden');
    tasksList.innerHTML = '';

    tasks.slice(0, 10).forEach(task => {
      const isRunning = (task.status === 'downloading' || task.status === 'processing' || task.status === 'queued');
      const isCompleted = task.status === 'completed';
      const isFailed = task.status === 'failed';
      const isCanceled = task.status === 'canceled';

      let statusColor = '#6366f1';
      let statusBadge = '';

      if (isRunning) {
        statusColor = '#6366f1';
        statusBadge = `<span class="badge-status badge-running"><span class="pulse-dot"></span>${escapeHtml(task.stage || 'Downloading')}</span>`;
      } else if (isCompleted) {
        statusColor = '#10b981';
        statusBadge = `<span class="badge-status badge-success">✓ Completed</span>`;
      } else if (isCanceled) {
        statusColor = '#ef4444';
        statusBadge = `<span class="badge-status badge-canceled">✕ Canceled</span>`;
      } else {
        statusColor = '#ef4444';
        statusBadge = `<span class="badge-status badge-failed">✕ Failed</span>`;
      }

      // Actions row
      let actionsHtml = '';
      if (isRunning) {
        actionsHtml = `
          <div class="task-actions-row">
            <button class="btn-cancel-task btn-xs-danger" data-id="${task.task_id}">
              <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              Cancel Download
            </button>
          </div>
        `;
      } else if (isCompleted) {
        actionsHtml = `
          <div class="task-actions-row">
            <button class="btn-save-browser btn-xs-success" data-id="${task.task_id}" data-filename="${escapeHtml(task.filename || 'video.mp4')}">
              <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Save to Browser
            </button>
            <button class="btn-open-folder btn-xs-secondary" data-path="${escapeHtml(task.final_dest_path || task.filepath || '')}">
              <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              Show in Folder
            </button>
            <button class="btn-dismiss-task btn-xs-secondary" data-id="${task.task_id}">Dismiss</button>
          </div>
        `;
      } else {
        actionsHtml = `
          <div class="task-actions-row">
            <button class="btn-dismiss-task btn-xs-secondary" data-id="${task.task_id}">Dismiss</button>
          </div>
        `;
      }

      // Meta details row
      let metaDetails = '';
      if (isRunning) {
        metaDetails = `<span>${task.progress || 0}% | ${task.speed || ''} ${task.eta ? ' | ETA: ' + task.eta : ''}</span>`;
      } else if (isCompleted) {
        const sizeText = task.file_size_str ? `Size: ${task.file_size_str}` : '100%';
        metaDetails = `<span>${sizeText} | Ready to save</span>`;
      } else {
        metaDetails = `<span>${escapeHtml(task.error || 'Stopped')}</span>`;
      }

      const taskDiv = document.createElement('div');
      taskDiv.className = 'task-item';
      taskDiv.innerHTML = `
        <div class="task-item-header">
          <div class="task-title" title="${escapeHtml(task.title || 'Video')}">${escapeHtml(task.title || 'Video')}</div>
          ${statusBadge}
        </div>
        <div class="task-progress-bar-bg">
          <div class="task-progress-bar-fill" style="width: ${task.progress || 0}%; background: ${statusColor}"></div>
        </div>
        <div class="task-meta-row">
          ${metaDetails}
          <span>${task.save_mode === 'local_folder' ? 'Local Disk' : 'Browser Mode'}</span>
        </div>
        ${actionsHtml}
      `;
      tasksList.appendChild(taskDiv);
    });

    // Attach Task Event Handlers
    attachTaskActionHandlers();

  } catch (e) {
    // server might be offline
  }
}

function attachTaskActionHandlers() {
  // Cancel Task
  document.querySelectorAll('.btn-cancel-task').forEach(btn => {
    btn.addEventListener('click', async () => {
      const taskId = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = 'Canceling...';
      try {
        const res = await fetch(`${SERVER_BASE}/api/task/${taskId}/cancel`, { method: 'POST' });
        if (res.ok) {
          showToast('Download canceled and partial files deleted.');
          fetchTasks();
        } else {
          showToast('Could not cancel task', 'error');
        }
      } catch (err) {
        showToast('Error canceling task', 'error');
      }
    });
  });

  // Save File to Browser Downloads
  document.querySelectorAll('.btn-save-browser').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.id;
      const filename = btn.dataset.filename || 'video.mp4';
      const fileUrl = `${SERVER_BASE}/api/file/${taskId}`;

      if (chrome.downloads && chrome.downloads.download) {
        chrome.downloads.download({
          url: fileUrl,
          filename: filename,
          saveAs: false
        }, () => {
          showToast('File download started in browser!');
        });
      } else {
        // Fallback: trigger download link
        const a = document.createElement('a');
        a.href = fileUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('File download triggered!');
      }
    });
  });

  // Show in Folder
  document.querySelectorAll('.btn-open-folder').forEach(btn => {
    btn.addEventListener('click', async () => {
      const path = btn.dataset.path;
      try {
        const res = await fetch(`${SERVER_BASE}/api/open-folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: path || '.' })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast('Opened folder in file manager!');
        } else {
          showToast('Could not open folder on host', 'error');
        }
      } catch (err) {
        showToast('Error requesting folder open', 'error');
      }
    });
  });

  // Dismiss Task
  document.querySelectorAll('.btn-dismiss-task').forEach(btn => {
    btn.addEventListener('click', async () => {
      const taskId = btn.dataset.id;
      try {
        await fetch(`${SERVER_BASE}/api/task/${taskId}`, { method: 'DELETE' });
        fetchTasks();
      } catch (err) {
        // ignore
      }
    });
  });
}

// -----------------------------------------------------------------------------
// UI Event Handlers & Tab Navigation
// -----------------------------------------------------------------------------
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabId}`);
  });
}

function setupEventListeners() {
  // Refresh & Rescan button
  document.getElementById('btn-refresh').addEventListener('click', async () => {
    showToast('Refreshing...');
    await checkServerHealth();
    await initActiveTabScan();
    await fetchTasks();
  });

  // Retry server connection
  document.getElementById('btn-retry-server').addEventListener('click', async () => {
    const online = await checkServerHealth();
    if (online) showToast('Connected to local server!');
  });

  // Rescan Page Button in empty state
  document.getElementById('btn-rescan-page').addEventListener('click', async () => {
    await initActiveTabScan();
  });

  // Download Page URL Button in empty state
  document.getElementById('btn-download-page-url').addEventListener('click', () => {
    if (activeTab && activeTab.url) {
      promptDownloadItem({
        url: activeTab.url,
        title: activeTab.title || 'Page Video',
        referer: activeTab.url,
        type: 'Page URL'
      });
    }
  });

  // Confirm download from options modal
  document.getElementById('btn-confirm-download').addEventListener('click', () => {
    if (!pendingDownloadItem) return;

    const quality = document.getElementById('opt-quality').value;
    const container = document.getElementById('opt-container').value;
    const saveMode = document.getElementById('opt-save-mode').value;

    const payload = {
      url: pendingDownloadItem.url,
      referer: pendingDownloadItem.referer || (activeTab ? activeTab.url : ''),
      quality: quality,
      container: container,
      save_mode: saveMode
    };

    document.getElementById('video-options-card').classList.add('hidden');
    triggerDownload(payload);
  });

  // Cancel options modal
  document.getElementById('btn-cancel-options').addEventListener('click', () => {
    document.getElementById('video-options-card').classList.add('hidden');
    pendingDownloadItem = null;
  });

  // Quick Download / Paste submit
  document.getElementById('btn-paste-download').addEventListener('click', () => {
    const rawInput = document.getElementById('input-custom-url').value.trim();
    if (!rawInput) {
      showToast('Please enter a video URL or paste HTML tag', 'error');
      return;
    }

    const quality = document.getElementById('paste-quality').value;
    const saveMode = document.getElementById('paste-save-mode').value;

    const payload = {
      url: rawInput,
      quality: quality,
      save_mode: saveMode,
      referer: activeTab ? activeTab.url : ''
    };

    triggerDownload(payload);
  });
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.borderColor = (type === 'error') ? '#ef4444' : '#6366f1';
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

