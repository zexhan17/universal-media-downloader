/**
 * Universal Media Downloader - Background Service Worker
 * Sniffs network media requests (.m3u8, .mpd, .mp4, .webm) across all frames and coordinates with popup
 */

// In-memory store: tabId -> Array of detected media items
const tabMediaMap = new Map();

// Helper: Determine stream type from URL
function detectStreamType(url) {
  const clean = url.toLowerCase().split('?')[0];
  if (clean.endsWith('.m3u8') || url.includes('.m3u8')) return 'HLS Stream (.m3u8)';
  if (clean.endsWith('.mpd') || url.includes('.mpd')) return 'DASH Stream (.mpd)';
  if (clean.endsWith('.mp4') || url.includes('.mp4')) return 'Direct MP4';
  if (clean.endsWith('.webm') || url.includes('.webm')) return 'Direct WebM';
  if (clean.endsWith('.m4a') || url.includes('.m4a')) return 'Audio M4A';
  return 'Media Stream';
}

// Helper: Check if URL is a media stream we care about
function isMediaUrl(url) {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return false;

  const lower = url.toLowerCase();
  // Exclude common ad networks, tracking, or images
  if (lower.includes('doubleclick') || lower.includes('googleads') || lower.includes('analytics')) return false;
  if (lower.endsWith('.jpg') || lower.endsWith('.png') || lower.endsWith('.gif') || lower.endsWith('.svg') || lower.endsWith('.vtt')) return false;

  // Match media extensions or query patterns
  if (lower.includes('.m3u8') || lower.includes('.mpd')) return true;
  if (/\.(mp4|webm|m4a|mkv|flv)($|\?)/i.test(url)) return true;
  if (lower.includes('/master.') || lower.includes('/playlist.') || lower.includes('/manifest.')) return true;

  return false;
}

// Compute stream grouping key to prevent duplicate cards for sub-playlists of the same video
function getStreamKey(url) {
  try {
    const u = new URL(url);
    // Ignore cache busters
    const pathname = u.pathname;
    const lastSlash = pathname.lastIndexOf('/');
    const dir = lastSlash > 0 ? pathname.substring(0, lastSlash) : pathname;
    return `${u.origin}${dir}`;
  } catch (e) {
    return url.split('?')[0];
  }
}

// Listen to network requests (HLS, DASH, MP4 streams across all frames)
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { tabId, url, initiator, documentUrl } = details;
    if (tabId < 0 || !isMediaUrl(url)) return;

    addMediaToTab(tabId, {
      url: url,
      type: detectStreamType(url),
      referer: initiator || documentUrl || '',
      source: 'network'
    });
  },
  { urls: ['<all_urls>'] }
);

// Add media item to tab list with smart deduplication
function addMediaToTab(tabId, item) {
  let list = tabMediaMap.get(tabId);
  if (!list) {
    list = [];
    tabMediaMap.set(tabId, list);
  }

  const streamKey = getStreamKey(item.url);
  const existingIdx = list.findIndex(existing => getStreamKey(existing.url) === streamKey);

  const entry = {
    ...item,
    streamKey,
    id: 'stream_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    timestamp: Date.now()
  };

  if (chrome.tabs && chrome.tabs.get && tabId > 0) {
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError && tab) {
        if (!entry.title || entry.title === 'Web Video') {
          entry.title = tab.title || '';
        }
        if (!entry.referer) {
          entry.referer = tab.url || '';
        }
        entry.pageUrl = tab.url || '';
      }
    });
  }

  if (existingIdx === -1) {
    // New unique stream
    list.push(entry);
    updateBadge(tabId, list.length);
  } else {
    // If the new request is master.m3u8, upgrade existing sub-playlist to master
    const existing = list[existingIdx];
    if (item.url.includes('master') && !existing.url.includes('master')) {
      entry.id = existing.id;
      list[existingIdx] = entry;
    }
  }
}

// Update toolbar badge
function updateBadge(tabId, count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count), tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1', tabId }); // Indigo
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabMediaMap.delete(tabId);
});

// Reset badge and media on full page refresh
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabMediaMap.delete(tabId);
    updateBadge(tabId, 0);
  }
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId || (sender.tab && sender.tab.id);

  if (message.type === 'DOM_MEDIA_FOUND') {
    if (tabId && message.items && Array.isArray(message.items)) {
      message.items.forEach(item => addMediaToTab(tabId, item));
      sendResponse({ status: 'ok', count: (tabMediaMap.get(tabId) || []).length });
    }
    return true;
  }

  if (message.type === 'GET_TAB_MEDIA') {
    const media = tabMediaMap.get(tabId) || [];
    sendResponse({ media });
    return true;
  }

  if (message.type === 'CLEAR_TAB_MEDIA') {
    tabMediaMap.delete(tabId);
    updateBadge(tabId, 0);
    sendResponse({ status: 'cleared' });
    return true;
  }
});
