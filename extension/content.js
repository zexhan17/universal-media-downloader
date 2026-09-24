/**
 * Universal Media Downloader - Content Script
 * Scans page DOM for HTML5 video, audio, source tags, and iframe embeds
 */

function scanForVideos() {
  const found = [];
  const currentUrl = window.location.href;
  const pageTitle = document.title || 'Web Video';

  // 1. Scan all <video> and <audio> elements
  const mediaElements = document.querySelectorAll('video, audio');
  mediaElements.forEach((el, index) => {
    // Check direct src
    const directSrc = el.currentSrc || el.getAttribute('src');
    if (directSrc && !directSrc.startsWith('blob:') && directSrc.startsWith('http')) {
      found.push({
        url: directSrc,
        type: directSrc.includes('.m3u8') ? 'HLS Stream (.m3u8)' : 'Direct Video',
        title: `${pageTitle} (Player #${index + 1})`,
        referer: currentUrl,
        source: 'dom'
      });
    }

    // Check child <source> elements (Crucial for HLS m3u8 playlists!)
    const sources = el.querySelectorAll('source');
    sources.forEach(srcEl => {
      const srcUrl = srcEl.getAttribute('src');
      if (srcUrl && !srcUrl.startsWith('blob:') && srcUrl.startsWith('http')) {
        const typeAttr = srcEl.getAttribute('type') || '';
        const isHls = typeAttr.includes('mpegurl') || srcUrl.includes('.m3u8');
        found.push({
          url: srcUrl,
          type: isHls ? 'HLS Stream (.m3u8)' : 'Direct Video',
          title: `${pageTitle} (Source #${index + 1})`,
          referer: currentUrl,
          source: 'dom'
        });
      }
    });

    // Check common data attributes (e.g. data-src, data-video-url)
    ['data-src', 'data-video', 'data-url', 'data-mp4', 'data-m3u8'].forEach(attr => {
      const val = el.getAttribute(attr);
      if (val && !val.startsWith('blob:') && val.startsWith('http')) {
        found.push({
          url: val,
          type: val.includes('.m3u8') ? 'HLS Stream (.m3u8)' : 'Direct Video',
          title: pageTitle,
          referer: currentUrl,
          source: 'dom'
        });
      }
    });
  });

  // 2. Scan Performance Resource Timing entries (Catches Hls.js fetch requests!)
  try {
    if (window.performance && performance.getEntriesByType) {
      const resources = performance.getEntriesByType('resource');
      resources.forEach(res => {
        const resUrl = res.name || '';
        if (resUrl.startsWith('http') && !resUrl.startsWith('blob:')) {
          const lower = resUrl.toLowerCase();
          if (lower.includes('.m3u8') || lower.includes('/master.') || lower.includes('/playlist.') || lower.includes('.mpd')) {
            found.push({
              url: resUrl,
              type: lower.includes('.mpd') ? 'DASH Stream (.mpd)' : 'HLS Stream (.m3u8)',
              title: pageTitle,
              referer: currentUrl,
              source: 'network_cache'
            });
          }
        }
      });
    }
  } catch (e) { }

  return found;
}

// Initial scan when page loads
const initialItems = scanForVideos();
if (initialItems.length > 0) {
  try {
    chrome.runtime.sendMessage({
      type: 'DOM_MEDIA_FOUND',
      items: initialItems
    });
  } catch (e) {
    // Extension context might be invalid on certain pages
  }
}

// Listen for explicit scan requests from extension popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SCAN_DOM') {
    const items = scanForVideos();
    sendResponse({ items, pageUrl: window.location.href, pageTitle: document.title });
    return true;
  }
});

