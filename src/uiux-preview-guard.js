/**
 * GudangAI RUDY — UI/UX Preview safety guard.
 * Enabled only when VITE_UIUX_PREVIEW=true in the isolated Cloudflare Preview build.
 * Reads from Apps Script are allowed; every non-read request to Apps Script is blocked.
 */
const enabled = import.meta.env?.VITE_UIUX_PREVIEW === 'true';

if (enabled && typeof window !== 'undefined') {
  if (!window.__GUDANGAI_UIUX_PREVIEW_GUARD__) {
    window.__GUDANGAI_UIUX_PREVIEW_GUARD__ = true;
    window.__GUDANGAI_UIUX_PREVIEW__ = true;

    const isAppsScriptHost = (hostname) => {
      const host = String(hostname || '').toLowerCase();
      return host === 'script.google.com' || host === 'script.googleusercontent.com';
    };

    const requestDetails = (input, init = {}) => {
      const rawUrl = typeof input === 'string' ? input : input?.url;
      const requestMethod = init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET');
      try {
        const url = new URL(rawUrl, window.location.href);
        return { url, method: String(requestMethod || 'GET').toUpperCase() };
      } catch (_) {
        return { url: null, method: String(requestMethod || 'GET').toUpperCase() };
      }
    };

    const isBlockedWrite = (input, init = {}) => {
      const { url, method } = requestDetails(input, init);
      return Boolean(url && isAppsScriptHost(url.hostname) && !['GET', 'HEAD', 'OPTIONS'].includes(method));
    };

    const blockedResponse = () => new Response(JSON.stringify({
      success: false,
      preview: true,
      writeBlocked: true,
      code: 'UIUX_PREVIEW_READ_ONLY',
      message: 'Transaksi dinonaktifkan pada UI/UX Preview. Tidak ada perubahan yang dikirim ke spreadsheet produksi.',
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      if (isBlockedWrite(input, init)) {
        window.dispatchEvent(new CustomEvent('gudangai-preview-write-blocked'));
        return Promise.resolve(blockedResponse());
      }
      return originalFetch(input, init);
    };

    // Guard legacy XHR callers as well as fetch callers.
    const xhrMeta = new WeakMap();
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      xhrMeta.set(this, { method: String(method || 'GET').toUpperCase(), url: String(url || '') });
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (body) {
      const meta = xhrMeta.get(this);
      if (meta && isBlockedWrite(meta.url, { method: meta.method })) {
        window.dispatchEvent(new CustomEvent('gudangai-preview-write-blocked'));
        this.abort();
        throw new Error('UIUX_PREVIEW_READ_ONLY: Apps Script writes are blocked.');
      }
      return originalSend.call(this, body);
    };

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const originalSendBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url, data) => {
        if (isBlockedWrite(url, { method: 'POST' })) {
          window.dispatchEvent(new CustomEvent('gudangai-preview-write-blocked'));
          return false;
        }
        return originalSendBeacon(url, data);
      };
    }

    const showPreviewBanner = () => {
      if (document.getElementById('gudangai-uiux-preview-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'gudangai-uiux-preview-banner';
      banner.textContent = 'PREVIEW · READ ONLY · TRANSAKSI PRODUKSI DINONAKTIFKAN';
      Object.assign(banner.style, {
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        right: '8px',
        zIndex: '2147483647',
        maxWidth: 'calc(100vw - 16px)',
        padding: '6px 10px',
        border: '1px solid #e9c46a',
        borderRadius: '999px',
        background: '#fff4ce',
        color: '#704800',
        boxShadow: '0 2px 10px rgba(0,0,0,.16)',
        font: '700 10px/1.2 Inter, system-ui, sans-serif',
        letterSpacing: '.04em',
        pointerEvents: 'none',
        textAlign: 'center',
      });
      document.documentElement.appendChild(banner);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showPreviewBanner, { once: true });
    } else {
      showPreviewBanner();
    }
  }
}
