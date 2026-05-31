// YouTube Translation Sidebar - Content Script v2
(function() {
  'use strict';

  const SIDEBAR_ID = 'yt-translate-sidebar';
  const TOOLTIP_ID = 'yt-translate-tooltip';
  const SIDEBAR_WIDTH = 310;

  let sidebar = null;
  let isVisible = true;
  let history = [];
  let tooltip = null;
  let settings = { engine: 'google' };
  let observer = null;

  console.log('[翻译侧边栏] 内容脚本已加载');

  // ── Init ──────────────────────────────────────────────
  function init() {
    loadSettings();
    loadHistory();
    startObserver();
    tryInject();

    document.addEventListener('yt-navigate-finish', () => {
      console.log('[翻译侧边栏] YouTube 导航完成:', window.location.pathname);
      removeSidebar();
      hideTooltip();
      setTimeout(tryInject, 500);
      setTimeout(tryInject, 1500);
      setTimeout(tryInject, 3000);
    });

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
  }

  function loadSettings() {
    chrome.storage.sync.get({ engine: 'google' }, s => { settings = s; });
  }

  function loadHistory() {
    chrome.storage.local.get({ ytHistory: [] }, r => {
      history = r.ytHistory || [];
    });
  }

  function saveHistory() {
    chrome.storage.local.set({ ytHistory: history.slice(-50) });
  }

  // ── Observer: watch for DOM changes ────────────────────
  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      if (isWatchPage() && !document.getElementById(SIDEBAR_ID)) {
        tryInject();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Injection ──────────────────────────────────────────
  function isWatchPage() {
    return window.location.pathname === '/watch';
  }

  function tryInject() {
    if (!isWatchPage()) {
      console.log('[翻译侧边栏] 非视频页面，跳过注入');
      return;
    }
    if (document.getElementById(SIDEBAR_ID)) {
      console.log('[翻译侧边栏] 侧边栏已存在');
      return;
    }

    // YouTube's watch page structure: ytd-watch-flexy > #columns > #primary + #secondary
    const columns = document.querySelector('#columns');
    if (columns) {
      console.log('[翻译侧边栏] 找到 #columns，注入侧边栏');
      injectSidebar();
      return;
    }

    // Alternative: try ytd-watch-flexy directly
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy) {
      console.log('[翻译侧边栏] 找到 ytd-watch-flexy（但无 #columns），稍后重试');
    } else {
      console.log('[翻译侧边栏] 未找到 YouTube 视频布局元素，稍后重试');
    }
  }

  function injectSidebar() {
    if (document.getElementById(SIDEBAR_ID)) return;

    console.log('[翻译侧边栏] 正在创建侧边栏...');

    sidebar = document.createElement('div');
    sidebar.id = SIDEBAR_ID;
    sidebar.innerHTML = getSidebarHTML();
    document.body.appendChild(sidebar);

    injectLayoutStyles();
    bindSidebarEvents();
    renderHistory();

    console.log('[翻译侧边栏] 侧边栏已创建并添加到页面');
  }

  function getSidebarHTML() {
    return `
      <div class="yts-header">
        <span class="yts-title"><span class="yts-logo">译</span>翻译助手</span>
        <div class="yts-header-actions">
          <button class="yts-btn-icon" id="yts-btn-history" title="历史记录">📋</button>
          <button class="yts-btn-icon" id="yts-btn-toggle" title="收起侧边栏">◀</button>
        </div>
      </div>
      <div class="yts-body">
        <div class="yts-input-area">
          <textarea id="yts-input" class="yts-input" placeholder="输入英文单词或句子后按 Enter 翻译..." rows="2"></textarea>
          <div class="yts-lang-row">
            <select id="yts-from" class="yts-select">
              <option value="auto">自动检测</option>
              <option value="en">英语</option>
              <option value="zh-CN">中文</option>
              <option value="ja">日语</option>
              <option value="ko">韩语</option>
            </select>
            <span class="yts-arrow">→</span>
            <select id="yts-to" class="yts-select">
              <option value="zh-CN">中文</option>
              <option value="en">英语</option>
              <option value="ja">日语</option>
              <option value="ko">韩语</option>
            </select>
          </div>
          <button id="yts-btn-translate" class="yts-btn-primary">翻译</button>
        </div>
        <div id="yts-result" class="yts-result">
          <div class="yts-placeholder">
            <div class="yts-placeholder-icon">🔍</div>
            <div class="yts-placeholder-text">选中页面上的英文文本</div>
            <div class="yts-placeholder-sub">即可自动翻译</div>
          </div>
        </div>
        <div id="yts-history-panel" class="yts-history-panel" style="display:none">
          <div class="yts-history-header">
            <span>翻译历史</span>
            <button id="yts-btn-clear" class="yts-btn-text">清空</button>
          </div>
          <div id="yts-history-list" class="yts-history-list"></div>
        </div>
      </div>
    `;
  }

  function injectLayoutStyles() {
    if (document.getElementById('yts-layout-style')) return;
    const style = document.createElement('style');
    style.id = 'yts-layout-style';
    style.textContent = `
      /* Make room for translation sidebar */
      ytd-watch-flexy {
        margin-right: ${SIDEBAR_WIDTH}px !important;
      }
      @media (max-width: 1300px) {
        ytd-watch-flexy {
          margin-right: 0 !important;
        }
        #${SIDEBAR_ID} {
          width: 280px !important;
          min-width: 280px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function removeSidebar() {
    const el = document.getElementById(SIDEBAR_ID);
    if (el) { el.remove(); console.log('[翻译侧边栏] 侧边栏已移除'); }
    const st = document.getElementById('yts-layout-style');
    if (st) st.remove();
    sidebar = null;
    hideTooltip();
  }

  // ── Sidebar Events ────────────────────────────────────
  function bindSidebarEvents() {
    const input = document.getElementById('yts-input');
    const btn = document.getElementById('yts-btn-translate');
    const btnToggle = document.getElementById('yts-btn-toggle');
    const btnHistory = document.getElementById('yts-btn-history');
    const btnClear = document.getElementById('yts-btn-clear');

    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          doTranslate();
        }
      });
      input.addEventListener('paste', () => {
        setTimeout(() => { if (input.value.trim()) doTranslate(); }, 100);
      });
    }

    if (btn) btn.addEventListener('click', doTranslate);
    if (btnToggle) btnToggle.addEventListener('click', toggleSidebar);
    if (btnHistory) btnHistory.addEventListener('click', toggleHistory);
    if (btnClear) btnClear.addEventListener('click', clearHistory);
  }

  function toggleSidebar() {
    const body = sidebar.querySelector('.yts-body');
    const btn = sidebar.querySelector('#yts-btn-toggle');
    isVisible = !isVisible;
    if (isVisible) {
      body.style.display = '';
      btn.textContent = '◀';
      btn.title = '收起侧边栏';
      sidebar.style.width = SIDEBAR_WIDTH + 'px';
      sidebar.style.minWidth = SIDEBAR_WIDTH + 'px';
    } else {
      body.style.display = 'none';
      btn.textContent = '▶';
      btn.title = '展开侧边栏';
      sidebar.style.width = '44px';
      sidebar.style.minWidth = '44px';
    }
  }

  function toggleHistory() {
    const panel = document.getElementById('yts-history-panel');
    const result = document.getElementById('yts-result');
    if (!panel || !result) return;
    if (panel.style.display === 'none') {
      panel.style.display = '';
      result.style.display = 'none';
      renderHistory();
    } else {
      panel.style.display = 'none';
      result.style.display = '';
    }
  }

  function clearHistory() {
    history = [];
    saveHistory();
    renderHistory();
  }

  // ── Translation ───────────────────────────────────────
  async function doTranslate(text) {
    const input = document.getElementById('yts-input');
    const query = text || (input ? input.value.trim() : '');
    if (!query) return;

    const fromEl = document.getElementById('yts-from');
    const toEl = document.getElementById('yts-to');
    const from = fromEl ? fromEl.value : 'auto';
    const to = toEl ? toEl.value : 'zh-CN';

    showLoading();

    try {
      const result = await sendMessage({
        action: 'translate',
        text: query,
        from: from,
        to: to
      });

      if (result && result.success) {
        showResult(query, result.translation, result.source);
        addToHistory(query, result.translation, result.source);
      } else {
        showError((result && result.error) || '翻译失败');
      }
    } catch (e) {
      console.error('[翻译侧边栏] 翻译错误:', e);
      showError('翻译服务连接失败，请检查网络或刷新页面');
    }
  }

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function showLoading() {
    const result = document.getElementById('yts-result');
    if (result) {
      result.innerHTML = '<div class="yts-loading"><span class="yts-spinner"></span>翻译中...</div>';
    }
  }

  function showResult(original, translation, source) {
    const result = document.getElementById('yts-result');
    const panel = document.getElementById('yts-history-panel');
    if (panel) panel.style.display = 'none';
    if (!result) return;

    const sourceLabel = { google: 'Google', mymemory: 'MyMemory', youdao: '有道' }[source] || source;

    result.innerHTML = `
      <div class="yts-result-card">
        <div class="yts-result-original">
          <div class="yts-result-label">原文</div>
          <div class="yts-result-text">${escapeHtml(original)}</div>
        </div>
        <div class="yts-result-translation">
          <div class="yts-result-label">译文 <span class="yts-result-source">${sourceLabel}</span></div>
          <div class="yts-result-text yts-result-text-tr">${escapeHtml(translation)}</div>
        </div>
        <button class="yts-btn-copy" id="yts-copy-btn">📋 复制</button>
      </div>
    `;

    const copyBtn = document.getElementById('yts-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(translation).then(() => {
          copyBtn.textContent = '✓ 已复制';
          setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 1500);
        });
      });
    }
  }

  function showError(msg) {
    const result = document.getElementById('yts-result');
    if (result) {
      result.innerHTML = `<div class="yts-error">⚠ ${escapeHtml(msg)}</div>`;
    }
  }

  function addToHistory(original, translation, source) {
    history.unshift({ original, translation, source, time: Date.now() });
    if (history.length > 50) history.pop();
    saveHistory();
  }

  function renderHistory() {
    const list = document.getElementById('yts-history-list');
    if (!list) return;

    if (history.length === 0) {
      list.innerHTML = '<div class="yts-history-empty">暂无翻译记录</div>';
      return;
    }

    list.innerHTML = history.slice(0, 30).map((item, i) => `
      <div class="yts-history-item" data-index="${i}">
        <div class="yts-history-orig">${escapeHtml(item.original)}</div>
        <div class="yts-history-trans">${escapeHtml(item.translation)}</div>
        <div class="yts-history-meta">${escapeHtml(item.source || '')} · ${timeAgo(item.time)}</div>
        <button class="yts-history-delete" data-index="${i}">×</button>
      </div>
    `).join('');

    list.querySelectorAll('.yts-history-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.classList.contains('yts-history-delete')) return;
        const idx = parseInt(el.dataset.index);
        if (history[idx]) {
          const input = document.getElementById('yts-input');
          if (input) input.value = history[idx].original;
          showResult(history[idx].original, history[idx].translation, history[idx].source);
          toggleHistory();
        }
      });
    });

    list.querySelectorAll('.yts-history-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        history.splice(idx, 1);
        saveHistory();
        renderHistory();
      });
    });
  }

  // ── Select-to-Translate ───────────────────────────────
  function onMouseUp(e) {
    if (e.target.closest('#' + SIDEBAR_ID) || e.target.closest('#' + TOOLTIP_ID)) return;

    clearTimeout(window.__ytsTooltipTimer);
    window.__ytsTooltipTimer = setTimeout(() => {
      const sel = window.getSelection();
      const text = (sel || '').toString().trim();
      if (!text || text.length < 1 || text.length > 500) {
        hideTooltip();
        return;
      }
      if (!/[a-zA-Z]/.test(text) && !isCJK(text)) return;
      showSelectionTooltip(text, sel);
    }, 200);
  }

  function isCJK(text) {
    return /[一-鿿぀-ゟ゠-ヿ가-힯]/.test(text);
  }

  function onMouseDown(e) {
    if (tooltip && !e.target.closest('#' + TOOLTIP_ID)) {
      hideTooltip();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') hideTooltip();
  }

  async function showSelectionTooltip(text, sel) {
    hideTooltip();

    tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.className = 'yts-tooltip';
    tooltip.innerHTML = `
      <div class="yts-tooltip-original">${escapeHtml(text.length > 100 ? text.slice(0, 100) + '...' : text)}</div>
      <div class="yts-tooltip-result">翻译中...</div>
      <div class="yts-tooltip-actions">
        <button class="yts-tooltip-btn" id="yts-tooltip-send">发送到侧边栏</button>
        <button class="yts-tooltip-close">×</button>
      </div>
    `;
    document.body.appendChild(tooltip);

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    positionTooltip(rect);

    tooltip.querySelector('.yts-tooltip-close').addEventListener('click', hideTooltip);
    tooltip.querySelector('#yts-tooltip-send').addEventListener('click', () => {
      const input = document.getElementById('yts-input');
      if (input) {
        input.value = text;
        doTranslate(text);
      }
      hideTooltip();
    });

    // Translate
    try {
      const result = await sendMessage({
        action: 'translate',
        text: text,
        from: 'auto',
        to: 'zh-CN'
      });
      if (result && result.success) {
        const resultEl = tooltip.querySelector('.yts-tooltip-result');
        if (resultEl) {
          resultEl.textContent = result.translation;
        }
      }
    } catch (e) {
      const resultEl = tooltip.querySelector('.yts-tooltip-result');
      if (resultEl) resultEl.textContent = '翻译失败';
    }
  }

  function positionTooltip(rect) {
    if (!tooltip) return;

    const tipHeight = tooltip.offsetHeight || 120;
    const tipWidth = 300;

    let top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - tipWidth / 2;

    if (top + tipHeight > window.innerHeight - 10) {
      top = rect.top - tipHeight - 8;
    }
    if (left < 10) left = 10;
    if (left + tipWidth > window.innerWidth - 10) {
      left = window.innerWidth - tipWidth - 10;
    }
    if (top < 10) top = 10;

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
  }

  // ── Helpers ───────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function timeAgo(ts) {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return '刚刚';
    if (sec < 3600) return Math.floor(sec / 60) + '分钟前';
    if (sec < 86400) return Math.floor(sec / 3600) + '小时前';
    return Math.floor(sec / 86400) + '天前';
  }

  // ── Start ─────────────────────────────────────────────
  init();
})();
