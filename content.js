// magnifier
let lens = null;
let lensCreated = false;
let lensContentWrapper = null;

let currentSettings = null;

let lastMouse = { clientX: 0, clientY: 0, pageX: 0, pageY: 0 };
let rafPending = false;

const LENS_SIZE = 150;

function createLens() {
  const size = LENS_SIZE;

  lens = document.createElement("div");
  lens.style.cssText = `
    position: fixed;
    width: ${size}px;
    height: ${size}px;
    overflow: hidden;
    pointer-events: none;
    z-index: 999999;
    border: 3px solid #91b8ff;
    box-shadow: 0 0 15px rgba(102,126,234,0.4);
    display: none;
    left: 0px;
    top: 0px;
    ${currentSettings?.magnifierShape === "circle" ? "border-radius: 50%;" : "border-radius: 8px;"}
    background: rgba(255,255,255,0.06);
    backdrop-filter: blur(2px);
  `;

  lensContentWrapper = document.createElement("div");
  lensContentWrapper.style.cssText = `
    position: absolute;
    width: 100%;
    height: 100%;
    transform-origin: 0 0;
  `;

  const clone = document.body.cloneNode(true);
  clone.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    margin: 0;
    padding: 0;
    pointer-events: none;
  `;

  lensContentWrapper.appendChild(clone);
  lens.appendChild(lensContentWrapper);
  document.documentElement.appendChild(lens);
}

function removeLens() {
  if (lens) {
    lens.remove();
    lens = null;
  }
}

function attachListeners() {
  document.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
}

function detachListeners() {
  document.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", onResize);
}

function onMouseMove(e) {
  lastMouse = {
    clientX: e.clientX,
    clientY: e.clientY,
    pageX: e.pageX,
    pageY: e.pageY
  };
  scheduleRedraw();
}

function onScroll() {
  scheduleRedraw();
}

function onResize() {
  if (currentSettings?.magnifyEnabled) {
    takeScreenshot().then(scheduleRedraw);
  }
}

function scheduleRedraw() {
  if (rafPending) return;
  rafPending = true;

  requestAnimationFrame(() => {
    rafPending = false;
    redrawLens(lastMouse);
  });
}

function redrawLens(pos) {
  if (!lens || !currentSettings?.magnifyEnabled) return;

  const size = LENS_SIZE;
  const zoom = Number(currentSettings.zoomScale || 2);

  lens.style.display = "block";
  lens.style.left = `${pos.clientX - size / 2}px`;
  lens.style.top = `${pos.clientY - size / 2}px`;

  const centerOffset = size / 2; 
  
  lensContentWrapper.style.transform = `scale(${zoom})`;
  
  const clonedBody = lensContentWrapper.firstElementChild;
  if (clonedBody) {
    clonedBody.style.left = `${centerOffset / zoom - pos.pageX}px`;
    clonedBody.style.top = `${centerOffset / zoom - pos.pageY}px`;
  }
}

async function enableMagnifier() {
  if (!lensCreated) {
    createLens();
    attachListeners();
    lensCreated = true;
  }
  scheduleRedraw();
}

function disableMagnifier() {
  if (lens) lens.style.display = "none";
  if (lensCreated) {
    detachListeners();
    removeLens();
    lensCreated = false;
  }
}

function safeStorageGet(defaults) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(defaults, (settings) => resolve(settings));
    } catch (e) {
      console.warn("[magnifier] storage.get failed", e);
      resolve({ ...defaults });
    }
  });
}

function setupRuntimeListener() {
  try {
    chrome.runtime.onMessage.addListener((request) => {
      if (request?.action !== "updateMagnifier") return;

      currentSettings = request.settings;
      console.log("[magnifier] settings (updated):", currentSettings);

      if (currentSettings?.magnifyEnabled) {
        if (!lensCreated) {
          enableMagnifier();
        } else {
          if (lens) {
            lens.style.borderRadius = currentSettings?.magnifierShape === "circle" ? "50%" : "8px";
          }
          scheduleRedraw();
        }
      } else {
        disableMagnifier();
      }
    });
  } catch (e) {
    console.warn("[magnifier] runtime listener failed", e);
  }
}

async function initializeMagnifier() {
  const settings = await safeStorageGet({
    magnifyEnabled: false,
    zoomScale: 2,
    magnifierShape: "circle"
  });

  currentSettings = settings;
  console.log("[magnifier] initialized. settings:", currentSettings);

  if (currentSettings?.magnifyEnabled) {
    enableMagnifier();
  } else {
    disableMagnifier();
  }
}

setupRuntimeListener();

window.addEventListener("load", () => {
  setTimeout(() => {
    initializeMagnifier();
  }, 300);
});


// speech 
let quickSpeakBubble = null;

function createQuickSpeakBubble(x, y, selectedText) {
  try {
    if (quickSpeakBubble) {
      if (quickSpeakBubble._hideTimeout) clearTimeout(quickSpeakBubble._hideTimeout);
      quickSpeakBubble.remove();
      quickSpeakBubble = null;
    }
  } catch (e) {}

  quickSpeakBubble = document.createElement('div');
  quickSpeakBubble.className = 'kindsight-tts-bubble kindsight-bubble-animate-in';
  quickSpeakBubble.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y - 50}px;
    z-index: 999999;
    pointer-events: auto;
  `;

  quickSpeakBubble.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" style="fill: #ffaacb;">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
      <path d="M17 16.91c-1.48 1.45-3.5 2.32-5.7 2.32-2.2 0-4.22-.87-5.7-2.32M19 12h2c0 2.96-1.54 5.55-3.85 7M5 12H3c0 2.96 1.54 5.55 3.85 7"/>
    </svg>
  `;

  quickSpeakBubble.style.backgroundColor = '#a2d1e8';
  quickSpeakBubble.style.borderRadius = '20px';
  quickSpeakBubble.style.padding = '10px 15px';
  quickSpeakBubble.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  quickSpeakBubble.style.cursor = 'pointer';
  quickSpeakBubble.style.display = 'flex';
  quickSpeakBubble.style.alignItems = 'center';
  quickSpeakBubble.style.gap = '8px';
  quickSpeakBubble.style.transition = 'all 0.2s ease';

  let hideTimeout;

  function hideQuickSpeakBubble() {
    if (quickSpeakBubble) {
      quickSpeakBubble.classList.remove('kindsight-bubble-animate-in');
      quickSpeakBubble.classList.add('kindsight-bubble-animate-out');

      try { clearQuickHighlight(); } catch (e) {}

      setTimeout(() => {
        if (quickSpeakBubble) {
          quickSpeakBubble.remove();
          quickSpeakBubble = null;
        }
      }, 300);
    }
  }

  quickSpeakBubble.addEventListener('mouseenter', () => {
    quickSpeakBubble.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
    quickSpeakBubble.style.transform = 'scale(1.05)';
    clearTimeout(hideTimeout);
  });

  quickSpeakBubble.addEventListener('mouseleave', () => {
    quickSpeakBubble.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    quickSpeakBubble.style.transform = 'scale(1)';
    hideTimeout = setTimeout(hideQuickSpeakBubble, 3000);
    quickSpeakBubble._hideTimeout = hideTimeout;
  });

  quickSpeakBubble.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'tts_speak',
      text: selectedText
    });

    quickSpeakBubble.classList.remove('kindsight-bubble-animate-in');
    quickSpeakBubble.classList.add('kindsight-bubble-animate-out');
    setTimeout(() => {
      if (quickSpeakBubble) {
        quickSpeakBubble.remove();
        quickSpeakBubble = null;
      }
    }, 300);
  });

  try {
    const wrapper = wrapSelectionWithHighlight();
    if (wrapper) readerState.quickWrapper = wrapper;
  } catch (e) {}

  document.body.appendChild(quickSpeakBubble);

  hideTimeout = setTimeout(hideQuickSpeakBubble, 20000);
  quickSpeakBubble._hideTimeout = hideTimeout;
}

const originalMouseUpHandler = document.onmouseup;

document.addEventListener('click', (ev) => {
  if (!quickSpeakBubble && readerState.quickWrapper) {
    try { clearQuickHighlight(); } catch (e) {}
  }
});

document.addEventListener('mouseup', () => {
  const selectedText = window.getSelection().toString().trim();

  if (selectedText && selectedText.length > 0) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const x = rect.left + rect.width / 2;
    const y = rect.top + window.scrollY;

    createQuickSpeakBubble(x, y, selectedText);
  } else {
    if (quickSpeakBubble) {
      quickSpeakBubble.classList.remove('kindsight-bubble-animate-in');
      quickSpeakBubble.classList.add('kindsight-bubble-animate-out');

      try { clearQuickHighlight(); } catch (e) {}

      setTimeout(() => {
        if (quickSpeakBubble) {
          quickSpeakBubble.remove();
          quickSpeakBubble = null;
        }
      }, 300);
    }
  }
});


const readerState = {
  isInitialized: false,
  chunks: [],
  currentIndex: 0,
  isHighlighting: true,
  highlightedElements: [],
  quickWrapper: null
};

function wrapSelectionWithHighlight() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();

  const span = document.createElement('span');
  span.className = 'kindsight-reader-highlight';
  span.dataset.kindsightQuick = '1';

  try {
    range.surroundContents(span);
  } catch (e) {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }

  try { span.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
  return span;
}

function clearQuickHighlight() {
  try {
    if (readerState.quickWrapper) {
      const wrapper = readerState.quickWrapper;
      const parent = wrapper.parentNode;
      if (parent) {
        while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
        parent.removeChild(wrapper);
      }
      readerState.quickWrapper = null;
    }

    const underlines = document.querySelectorAll('.kindsight-word-underlined');
    underlines.forEach(u => {
      const p = u.parentNode;
      if (!p) return;
      while (u.firstChild) p.insertBefore(u.firstChild, u);
      p.removeChild(u);
    });
  } catch (e) {}
}

function highlightWordInQuickWrapper(start, length) {
  if (!readerState.quickWrapper) return;

  const wrapperText = readerState.quickWrapper.textContent || '';
  if (!wrapperText || wrapperText.length === 0) return;

  start = Math.max(0, Math.min(start || 0, wrapperText.length - 1));
  length = Math.max(1, Math.min(length || 1, wrapperText.length - start));

  const prevUnderlines = readerState.quickWrapper.querySelectorAll('.kindsight-word-underlined');
  prevUnderlines.forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
  });

  let globalOffset = 0;
  const nodes = [];
  let textStart = -1, textEnd = -1;

  const walker = document.createTreeWalker(readerState.quickWrapper, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    const nodeStart = globalOffset;
    const nodeEnd = globalOffset + len;

    if (nodeEnd > start && nodeStart < start + length) {
      const overlapStart = Math.max(0, start - nodeStart);
      const overlapEnd = Math.min(len, start + length - nodeStart);
      if (overlapStart < overlapEnd) {
        nodes.push({ node, start: overlapStart, end: overlapEnd });
      }
    }
    globalOffset += len;
  }

  if (nodes.length === 0) return; 
  
  try {
    const span = document.createElement('span');
    span.className = 'kindsight-word-underlined';

    if (nodes.length === 1) {
      const { node, start: s, end: e } = nodes[0];
      const range = document.createRange();
      range.setStart(node, s);
      range.setEnd(node, e);

      try {
        range.surroundContents(span);
      } catch (err) {
        const frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      }
    } else {
      const { node: firstNode, start: firstStart } = nodes[0];
      const { node: lastNode, end: lastEnd } = nodes[nodes.length - 1];
      const range = document.createRange();
      range.setStart(firstNode, firstStart);
      range.setEnd(lastNode, lastEnd);
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }

    try { span.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
  } catch (e) {
    console.warn('[content] underline failed', e);
  }
} 


function extractPageText() {
  const clone = document.body.cloneNode(true);
  const scripts = clone.querySelectorAll('script, style, noscript');
  scripts.forEach(script => script.remove());

  return clone.innerText || '';
}


function splitIntoChunks(text) {
  const sentenceRegex = /[^.!?]+[.!?]+/g;
  const sentences = text.match(sentenceRegex) || [text];

  const chunks = [];

  sentences.forEach(sentence => {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) return;

    if (trimmed.length > 250) {
      const parts = trimmed.match(/.{1,250}(?:\s+|$)/g) || [trimmed];
      chunks.push(...parts.filter(p => p.trim().length > 0));
    } else {
      chunks.push(trimmed);
    }
  });

  return chunks.length > 0 ? chunks : [text];
}


function highlightChunk(chunkIndex) {
  readerState.highlightedElements.forEach(el => {
    el.classList.remove('kindsight-reader-highlight');
  });
  readerState.highlightedElements = [];

  if (chunkIndex >= readerState.chunks.length) return;

  const chunk = readerState.chunks[chunkIndex];
  if (!chunk || chunk.length === 0) return;

  const treeWalker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;

  while ((node = treeWalker.nextNode())) {
    if (node.textContent.includes(chunk.substring(0, Math.min(50, chunk.length)))) {
      const parent = node.parentElement;
      if (parent) {
        parent.classList.add('kindsight-reader-highlight');
        readerState.highlightedElements.push(parent);
        try {
          parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {}
        return;
      }
    }
  }
}


function initializeReaderMode() {
  const selectedText = window.getSelection().toString().trim();
  const textToRead = selectedText || extractPageText();

  if (!textToRead) {
    console.warn('[reader] No text found to read');
    return null;
  }

  readerState.chunks = splitIntoChunks(textToRead);
  readerState.currentIndex = 0;
  readerState.isInitialized = true;

  return readerState.chunks;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'tts_start_reader') {
    console.log('Received tts_start_reader request');
    const chunks = initializeReaderMode();
    if (chunks && chunks.length > 0) {
      console.log(`reader initialized with ${chunks.length} chunks`);
      highlightChunk(0);
      chrome.runtime.sendMessage({
        action: 'tts_start_reader',
        chunks: chunks,
        rate: request.rate || 1,
        voice: request.voice || ''
      });
      sendResponse({ success: true, totalChunks: chunks.length });
    } else {
      console.warn('no text found to read');
      sendResponse({ success: false, error: 'No text to read' });
    }
    return true;
  }

  if (request.action === 'tts_update_progress') {
    readerState.currentIndex = request.currentIndex;
    highlightChunk(request.currentIndex);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'tts_quick_start') {
    try {
      if (!readerState.quickWrapper) {
        const wrapper = wrapSelectionWithHighlight();
        if (wrapper) readerState.quickWrapper = wrapper;
      }
      const prev = readerState.quickWrapper ? readerState.quickWrapper.querySelectorAll('.kindsight-word-underlined') : [];
      prev.forEach(p => {
        const parent = p.parentNode;
        if (!parent) return;
        while (p.firstChild) parent.insertBefore(p.firstChild, p);
        parent.removeChild(p);
      });
    } catch (e) {}

    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'tts_quick_word') {
    const idx = request.charIndex || 0;
    const len = request.charLength || 1;
    console.log('quick_word event:', { idx, len, wrapperExists: !!readerState.quickWrapper, wrapperText: readerState.quickWrapper?.textContent?.slice(0, 50) });
    highlightWordInQuickWrapper(idx, len);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'tts_quick_end') {
    clearQuickHighlight();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'tts_chunk_finished') {
    readerState.currentIndex = request.currentIndex;
    highlightChunk(request.currentIndex);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'tts_pause') {
    chrome.runtime.sendMessage({ action: 'tts_pause' });
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'tts_resume') {
    chrome.runtime.sendMessage({ action: 'tts_resume' });
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'tts_stop') {
    chrome.runtime.sendMessage({ action: 'tts_stop' });
    readerState.highlightedElements.forEach(el => {
      el.classList.remove('kindsight-reader-highlight');
    });
    readerState.highlightedElements = [];
    clearQuickHighlight();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'tts_seek') {
    readerState.currentIndex = request.index;
    highlightChunk(request.index);
    chrome.runtime.sendMessage({
      action: 'tts_seek',
      index: request.index
    });
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'tts_set_rate') {
    chrome.runtime.sendMessage({
      action: 'tts_set_rate',
      rate: request.rate
    });
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'tts_set_voice') {
    chrome.runtime.sendMessage({
      action: 'tts_set_voice',
      voice: request.voice
    });
    sendResponse({ success: true });
    return true;
  }

  // fonts and colors
if (request.action === 'updateFontSettings') {
  applyFontSettings(request.settings);
  sendResponse({ success: true });
  return true;
}

if (request.action === 'updateColorSettings') {
  applyColorSettings(request.settings);
  sendResponse({ success: true });
  return true;
}
});

let styleElement = null;
let currentFontSettings = null;
let currentColorSettings = null;

function applyFontSettings(settings) {
  const fontMap = {
    'system': 'system-ui, -apple-system, sans-serif',
    'sans-serif': 'Arial, Helvetica, sans-serif',
    'serif': 'Georgia, Times New Roman, serif',
    'monospace': 'Courier New, monospace',
    'dyslexia-friendly': 'OpenDyslexic, Arial, sans-serif'
  };

  currentFontSettings = settings;
  const fontFamily = fontMap[settings.fontFamily] || fontMap['system'];
  const fontSize = settings.fontSize || 16;
  const lineSpacing = settings.lineSpacing || 1.5;
  const boldWeight = settings.boldText ? '700' : 'normal';

  currentFontSettings.fontFamily = fontFamily;
  currentFontSettings.fontSize = fontSize;
  currentFontSettings.lineSpacing = lineSpacing;
  currentFontSettings.boldWeight = boldWeight;

  applyAllStyles();
}

function applyColorSettings(settings) {
  const themeColors = {
    'normal': {
      backgroundColor: 'transparent',
      color: 'inherit',
      filter: 'none'
    },
    'high-contrast-light': {
      backgroundColor: '#ffffff',
      color: '#000000',
      filter: 'none'
    },
    'high-contrast-dark': {
      backgroundColor: '#000000',
      color: '#ffffff',
      filter: 'invert(1)'
    },
    'grayscale': {
      backgroundColor: '#808080',
      color: '#ffffff',
      filter: 'grayscale(1)'
    },
    'warm-tint': {
      backgroundColor: '#fff8f0',
      color: '#8b5a2b',
      filter: 'sepia(0.3)'
    },
    'pastel-light': {
      backgroundColor: '#f5f0e8',
      color: '#5a5a5a',
      filter: 'brightness(1.1) saturate(0.8)'
    },
    'pastel-dark': {
      backgroundColor: '#3a3a3a',
      color: '#e8e0d8',
      filter: 'invert(0.9) brightness(0.7)'
    },
    'protanopia': {
      backgroundColor: '#ffffff',
      color: '#0066cc',
      filter: 'none'
    },
    'deuteranopia': {
      backgroundColor: '#ffffff',
      color: '#cc0000',
      filter: 'none'
    },
    'tritanopia': {
      backgroundColor: '#000000',
      color: '#ffff00',
      filter: 'invert(1)'
    },
    'soft-light': {
      backgroundColor: '#f9f7f4',
      color: '#8a8a8a',
      filter: 'brightness(1.05) contrast(0.95)'
    },
    'soft-dark': {
      backgroundColor: '#2a2a2a',
      color: '#c0c0c0',
      filter: 'brightness(0.9)'
    }
  };

  currentColorSettings = settings;
  applyAllStyles();
}

function applyAllStyles() {
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'kindsight-style';
    styleElement.setAttribute('type', 'text/css');
    document.head.appendChild(styleElement);
  }

  let combinedCSS = '';

  if (currentFontSettings) {
    combinedCSS += `
      * {
        font-family: ${currentFontSettings.fontFamily} !important;
        font-size: ${currentFontSettings.fontSize}px !important;
        line-height: ${currentFontSettings.lineSpacing} !important;
        font-weight: ${currentFontSettings.boldWeight} !important;
      }
    `;
  }

  if (currentColorSettings) {
    const themeColors = {
      'normal': {
        backgroundColor: 'transparent',
        color: 'inherit',
        filter: 'none'
      },
      'high-contrast-light': {
        backgroundColor: '#ffffff',
        color: '#000000',
        filter: 'none'
      },
      'high-contrast-dark': {
        backgroundColor: '#000000',
        color: '#ffffff',
        filter: 'invert(1)'
      },
      'grayscale': {
        backgroundColor: '#808080',
        color: '#ffffff',
        filter: 'grayscale(1)'
      },
      'warm-tint': {
        backgroundColor: '#fff8f0',
        color: '#8b5a2b',
        filter: 'sepia(0.3)'
      },
      'pastel-light': {
        backgroundColor: '#f5f0e8',
        color: '#5a5a5a',
        filter: 'brightness(1.1) saturate(0.8)'
      },
      'pastel-dark': {
        backgroundColor: '#3a3a3a',
        color: '#e8e0d8',
        filter: 'invert(0.9) brightness(0.7)'
      },
      'protanopia': {
        backgroundColor: '#ffffff',
        color: '#0066cc',
        filter: 'none'
      },
      'deuteranopia': {
        backgroundColor: '#ffffff',
        color: '#cc0000',
        filter: 'none'
      },
      'tritanopia': {
        backgroundColor: '#000000',
        color: '#ffff00',
        filter: 'invert(1)'
      },
      'soft-light': {
        backgroundColor: '#f9f7f4',
        color: '#8a8a8a',
        filter: 'brightness(1.05) contrast(0.95)'
      },
      'soft-dark': {
        backgroundColor: '#2a2a2a',
        color: '#c0c0c0',
        filter: 'brightness(0.9)'
      }
    };

    const theme = themeColors[currentColorSettings.colorTheme] || themeColors['normal'];

    if (currentColorSettings.colorTheme !== 'normal') {
      combinedCSS += `
        html {
          background: ${theme.backgroundColor} !important;
          background-color: ${theme.backgroundColor} !important;
          margin: 0 !important;
          padding: 0 !important;
          min-height: 100vh !important;
          width: 100% !important;
        }

        body {
          background: ${theme.backgroundColor} !important;
          background-color: ${theme.backgroundColor} !important;
          margin: 0 !important;
          padding: 0 !important;
          min-height: 100vh !important;
          width: 100% !important;
        }

        * {
          color: ${theme.color} !important;
        }

        *, *::before, *::after {
          background-color: ${theme.backgroundColor} !important;
        }

        div, main, article, section, header, footer, nav, aside,
        ul, ol, li, dl, dt, dd, figure, figcaption {
          background-color: ${theme.backgroundColor} !important;
          color: ${theme.color} !important;
        }

        p, span, h1, h2, h3, h4, h5, h6, label, strong, em, i, b,
        small, sub, sup, mark, del, ins, q, cite, abbr, time {
          color: ${theme.color} !important;
          background-color: transparent !important;
        }

        a, a:visited, a:hover, a:active {
          color: ${theme.color} !important;
          text-decoration: underline;
          background-color: transparent !important;
        }

        input, textarea, select, option, optgroup,
        button, input[type="button"], input[type="submit"],
        input[type="reset"], input[type="file"] {
          background-color: ${theme.backgroundColor} !important;
          color: ${theme.color} !important;
          border-color: ${theme.color} !important;
        }

        table, thead, tbody, tfoot, tr, td, th, caption {
          background-color: ${theme.backgroundColor} !important;
          color: ${theme.color} !important;
          border-color: ${theme.color} !important;
        }

        code, pre, kbd, samp, var {
          background-color: ${theme.backgroundColor} !important;
          color: ${theme.color} !important;
        }

        svg {
          fill: ${theme.color} !important;
          stroke: ${theme.color} !important;
        }
        svg [fill]:not([fill="currentColor"]),
        svg [stroke]:not([stroke="currentColor"]) {
          fill: ${theme.color} !important;
          stroke: ${theme.color} !important;
        }

        img, video, canvas, iframe, embed, object {
          background-color: ${theme.backgroundColor} !important;
        }

        * {
          box-shadow: none !important;
        }

        @viewport {
          width: device-width;
          zoom: 1.0;
        }

        .container, .wrapper, .content, .page, .main,
        [class*="container"], [class*="wrapper"], [class*="content"] {
          background-color: ${theme.backgroundColor} !important;
          color: ${theme.color} !important;
        }

        ${theme.filter !== 'none' ? `
        html {
          filter: ${theme.filter} !important;
        }
        ` : ''}
      `;
    }
  }

  styleElement.textContent = combinedCSS;
}
