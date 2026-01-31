chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html')
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSyncedSettings') {
    chrome.storage.sync.get(null, (settings) => {
      sendResponse(settings);
    });
    return true;
  }
});

const ttsState = {
  isPlaying: false,
  isPaused: false,
  chunks: [],
  currentIndex: 0,
  rate: 1,
  voice: '',
  tabId: null,
  quickSpeak: null 
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === 'tts_speak') {
      const text = request.text || '';
      ttsState.quickSpeak = { text, tabId: sender.tab?.id || null };
      ttsState.utterancePending = true;

      if (ttsState.quickSpeak.tabId) {
        try { chrome.tabs.sendMessage(ttsState.quickSpeak.tabId, { action: 'tts_quick_start' }); } catch (e) {}
      }

      chrome.tts.stop();
      chrome.tts.speak(text, { rate: request.rate || ttsState.rate || 1, voiceName: request.voice || ttsState.voice || '' });
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'tts_start_reader') {
      if (Array.isArray(request.chunks) && request.chunks.length > 0) {
        ttsState.chunks = request.chunks;
        ttsState.currentIndex = 0;
        ttsState.rate = request.rate || 1;
        ttsState.voice = request.voice || '';
        ttsState.tabId = sender.tab?.id || null;
        ttsState.isPlaying = true;
        ttsState.isPaused = false;
        speakCurrentChunk();
        sendResponse({ success: true });
        return true;
      }

      sendResponse({ success: false, error: 'No chunks provided' });
      return true;
    }

    if (request.action === 'tts_pause') {
      chrome.tts.pause();
      ttsState.isPaused = true;
      ttsState.isPlaying = false;
      sendProgress();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'tts_resume') {
      chrome.tts.resume();
      ttsState.isPaused = false;
      ttsState.isPlaying = true;
      sendProgress();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'tts_stop') {
      chrome.tts.stop();
      ttsState.isPlaying = false;
      ttsState.isPaused = false;
      ttsState.currentIndex = 0;
      sendProgress();
      notifyFinished();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'tts_seek') {
      const idx = parseInt(request.index, 10) || 0;
      if (idx >= 0 && idx < ttsState.chunks.length) {
        ttsState.currentIndex = idx;
        if (ttsState.isPlaying) {
          chrome.tts.stop();
          speakCurrentChunk();
        } else {
          sendProgress();
        }
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Invalid seek index' });
      }
      return true;
    }

    if (request.action === 'tts_set_rate') {
      ttsState.rate = request.rate || 1;
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'tts_set_voice') {
      ttsState.voice = request.voice || '';
      sendResponse({ success: true });
      return true;
    }
  } catch (e) {
    console.error('TTS message handler error', e);
  }
});

function handleUtteranceFinished() {
  if (ttsState.quickSpeak?.tabId) {
    try { chrome.tabs.sendMessage(ttsState.quickSpeak.tabId, { action: 'tts_quick_end' }); } catch (e) {}
    clearUtteranceTimeout();
    ttsState.quickSpeak = null;
    ttsState.utterancePending = false;
    ttsState.startedThisUtterance = false;
    ttsState.finishRetries = 0;
    return;
  }

  if (!ttsState.utterancePending) return;

  if (!ttsState.startedThisUtterance) {
    ttsState.finishRetries = (ttsState.finishRetries || 0) + 1;
    if (ttsState.finishRetries <= 3) {
      setTimeout(handleUtteranceFinished, 40);
      return;
    }
  }

  clearUtteranceTimeout();
  ttsState.utterancePending = false;
  ttsState.startedThisUtterance = false;
  ttsState.finishRetries = 0;

  if (!ttsState.isPlaying) return;

  ttsState.currentIndex = Math.min(ttsState.currentIndex + 1, ttsState.chunks.length);
  sendProgress();

  if (ttsState.currentIndex < ttsState.chunks.length) {
    speakCurrentChunk();
  } else {
    ttsState.isPlaying = false;
    notifyFinished();
  }
}

function clearUtteranceTimeout() {
  try {
    if (ttsState.utteranceTimeout) {
      clearTimeout(ttsState.utteranceTimeout);
      ttsState.utteranceTimeout = null;
    }
  } catch (e) {}
}

function speakCurrentChunk() {
  if (!ttsState.chunks || ttsState.currentIndex >= ttsState.chunks.length) {
    ttsState.isPlaying = false;
    notifyFinished();
    return;
  }

  const text = ttsState.chunks[ttsState.currentIndex];
  if (!text) {
    ttsState.currentIndex++;
    speakCurrentChunk();
    return;
  }

  ttsState.isPlaying = true;
  ttsState.utterancePending = true;
  ttsState.startedThisUtterance = false;
  ttsState.finishRetries = 0;

  sendProgress();

  clearUtteranceTimeout();
  ttsState.utteranceTimeout = setTimeout(() => {
    if (ttsState.utterancePending) {
      handleUtteranceFinished();
    }
  }, 8000);

  chrome.tts.speak(text, {
    rate: ttsState.rate || 1,
    voiceName: ttsState.voice || ''
  }, () => {
    if (ttsState.utterancePending && ttsState.isPlaying) {
\      handleUtteranceFinished();
    }
  });
} 

chrome.tts.onEvent.addListener((evt) => {
  try {
    if (evt.type === 'word' || evt.type === 'start') {
      ttsState.startedThisUtterance = true;
      ttsState.finishRetries = 0;
    }

    if (evt.type === 'word') {
      if (ttsState.quickSpeak?.tabId) {
        try { chrome.tabs.sendMessage(ttsState.quickSpeak.tabId, { action: 'tts_quick_word', charIndex: evt.charIndex, charLength: evt.charLength }); } catch (e) {}
      }
      if (ttsState.tabId) {
        try { chrome.tabs.sendMessage(ttsState.tabId, { action: 'tts_word', currentIndex: ttsState.currentIndex, charIndex: evt.charIndex, charLength: evt.charLength }); } catch (e) {}
      }
      return;
    }

    if (evt.type === 'start') {
      if (ttsState.quickSpeak?.tabId) {
        try { chrome.tabs.sendMessage(ttsState.quickSpeak.tabId, { action: 'tts_quick_start' }); } catch (e) {}
      }
      return;
    }

    if (evt.type === 'end' || evt.type === 'interrupted' || evt.type === 'cancelled') {
      handleUtteranceFinished();
      return;
    }
  } catch (e) {
    console.error('tts.onEvent error', e);
  }
});

function sendProgress() {
  if (ttsState.tabId) {
    try {
      chrome.tabs.sendMessage(ttsState.tabId, { action: 'tts_update_progress', currentIndex: ttsState.currentIndex });
    } catch (e) {}
  }
  try {
    chrome.runtime.sendMessage({ action: 'tts_update_progress', currentIndex: ttsState.currentIndex });
  } catch (e) {}
}

function notifyFinished() {
  if (ttsState.tabId) {
    try {
      chrome.tabs.sendMessage(ttsState.tabId, { action: 'tts_finished' });
    } catch (e) {}
  }
  try {
    chrome.runtime.sendMessage({ action: 'tts_finished' });
  } catch (e) {}
}