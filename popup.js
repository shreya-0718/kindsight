const DEFAULT_SETTINGS = {
    magnifyEnabled: false,
    zoomScale: 2,
    magnifierShape: 'circle'
};

let currentSettings = DEFAULT_SETTINGS;
let magnifier = null;

const readerState = {
  isPlaying: false,
  isPaused: false,
  totalChunks: 0,
  currentIndex: 0,
  speechRate: 1,
  voices: []
};

if (typeof populateVoices === 'undefined') {
  function populateVoices() {
    try {
      const voiceSelect = document.getElementById('voiceSelect');
      if (!voiceSelect || !chrome?.tts?.getVoices) return;
      chrome.tts.getVoices((voices) => {
        voices.forEach((voice) => {
          const option = document.createElement('option');
          option.value = voice.voiceName;
          option.textContent = `${voice.voiceName}${voice.lang ? ` (${voice.lang})` : ''}`;
          voiceSelect.appendChild(option);
        });
      });
    } catch (e) {}
  }
}

if (typeof initializeReaderMode === 'undefined') {
  function initializeReaderMode() {
    return;
  }
}

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initializeTabs();
    initializeMagnifyControls();
    initializeReaderMode();
    populateVoices();
});

function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        currentSettings = settings;
        updateUI();
    });
}

function saveSettings() {
    chrome.storage.sync.set(currentSettings);
}

function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        });
    });
}

function initializeMagnifyControls() {
    const magnifyEnabled = document.getElementById('magnifyEnabled');
    const zoomScale = document.getElementById('zoomScale');
    const zoomValue = document.getElementById('zoomValue');
    const shapeBtns = document.querySelectorAll('.shape-btn');

    magnifyEnabled.addEventListener('change', () => {
        currentSettings.magnifyEnabled = magnifyEnabled.checked;
        saveSettings();
        updateMagnifier();
    });

    zoomScale.addEventListener('input', () => {
        currentSettings.zoomScale = parseFloat(zoomScale.value);
        zoomValue.textContent = currentSettings.zoomScale;
        saveSettings();
        updateMagnifier();
    });

    shapeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            shapeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSettings.magnifierShape = btn.getAttribute('data-shape');
            saveSettings();
            updateMagnifier();
        });
    });
}

function updateUI() {
    document.getElementById('magnifyEnabled').checked = currentSettings.magnifyEnabled;
    document.getElementById('zoomScale').value = currentSettings.zoomScale;
    document.getElementById('zoomValue').textContent = currentSettings.zoomScale;

    document.querySelectorAll('.shape-btn').forEach((btn) => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-shape') === currentSettings.magnifierShape) {
            btn.classList.add('active');
        }
    });
}

function updateMagnifier() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'updateMagnifier',
                settings: currentSettings
            }).catch(() => {

            });
        }
    });
}


function populateVoices() {
  chrome.tts.getVoices((voices) => {
    const voiceSelect = document.getElementById('voiceSelect');
    
    voices.forEach((voice) => {
      const option = document.createElement('option');
      option.value = voice.voiceName;
      option.textContent = `${voice.voiceName}${voice.lang ? ` (${voice.lang})` : ''}`;
      voiceSelect.appendChild(option);
    });
  });
}


function initializeReaderMode() {
  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');
  const voiceSelect = document.getElementById('voiceSelect');
  const progressSlider = document.getElementById('progressSlider');

  playBtn.addEventListener('click', async (ev) => {
    ev?.preventDefault?.();
    if (!readerState.isPlaying && !readerState.isPaused) {
      playBtn.disabled = true;
      updateStatus('Initializing...');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        updateStatus('Error: No active tab found');
        playBtn.disabled = false;
        return;
      }

      try {
        console.log('sending tts_start_reader to tab', tab.id);

        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'tts_start_reader',
          rate: readerState.speechRate,
          voice: voiceSelect.value
        });

        if (response?.success) {
          readerState.isPlaying = true;
          readerState.totalChunks = response.totalChunks || 0;
          readerState.currentIndex = 0;
          updatePlayerUI();
          updateStatus(`Reading chunk 1 of ${readerState.totalChunks}...`);
        } else {
          updateStatus('Error: ' + (response?.error || 'Could not start reading'));
        }
      } catch (error) {
        console.error('[reader] Failed to start:', error);
        updateStatus('Error: Could not start reading on this page');
      } finally {
        playBtn.disabled = false;
      }
    } else if (readerState.isPaused) {
      chrome.runtime.sendMessage({ action: 'tts_resume' });
      readerState.isPlaying = true;
      readerState.isPaused = false;
      updatePlayerUI();
    }
  });

  let isSeeking = false;
  progressSlider.addEventListener('input', () => {
    if (!readerState.totalChunks) return;
    const idx = parseInt(progressSlider.value, 10);
    const percent = (idx / Math.max(1, readerState.totalChunks - 1)) * 100;
    progressFill.style.width = `${percent}%`;
    document.getElementById('currentTime').textContent = idx + 1;
  });

  progressSlider.addEventListener('pointerdown', () => { isSeeking = true; });
  progressSlider.addEventListener('pointerup', async () => {
    isSeeking = false;
    const index = parseInt(progressSlider.value, 10);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      chrome.tabs.sendMessage(tab.id, { action: 'tts_seek', index: index });
      chrome.runtime.sendMessage({ action: 'tts_seek', index: index });
    } catch (e) {}
  });

  pauseBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'tts_pause' });
    readerState.isPlaying = false;
    readerState.isPaused = true;
    updatePlayerUI();
  });

  stopBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.runtime.sendMessage({ action: 'tts_stop' });
    try {
      chrome.tabs.sendMessage(tab.id, { action: 'tts_stop' });
    } catch (error) {}
    
    readerState.isPlaying = false;
    readerState.isPaused = false;
    readerState.currentIndex = 0;
    updatePlayerUI();
    updateStatus('Stopped');
  });

  speedSlider.addEventListener('input', () => {
    readerState.speechRate = parseFloat(speedSlider.value);
    speedValue.textContent = `${readerState.speechRate.toFixed(1)}x`;
    
    chrome.runtime.sendMessage({
      action: 'tts_set_rate',
      rate: readerState.speechRate
    });
  });

  voiceSelect.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      action: 'tts_set_voice',
      voice: voiceSelect.value
    });
  });

  progressSlider.addEventListener('change', async () => {
    const index = parseInt(progressSlider.value);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    try {
      chrome.tabs.sendMessage(tab.id, {
        action: 'tts_seek',
        index: index
      });
    } catch (error) {}
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'tts_update_progress') {
      readerState.currentIndex = request.currentIndex;
      updateProgressUI();
    }
    
    if (request.action === 'tts_finished') {
      readerState.isPlaying = false;
      readerState.currentIndex = 0;
      updatePlayerUI();
      updateStatus('Finished reading');
    }
  });
}

function updatePlayerUI() {
  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');

  if (readerState.isPlaying && !readerState.isPaused) {
    playBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    updateStatus(`Reading chunk ${readerState.currentIndex + 1} of ${readerState.totalChunks}...`);
  } else {
    playBtn.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
  }

  updateProgressUI();
}


function updateProgressUI() {
  const progressSlider = document.getElementById('progressSlider');
  const progressFill = document.getElementById('progressFill');
  const currentTimeEl = document.getElementById('currentTime');
  const totalTimeEl = document.getElementById('totalTime');

  if (readerState.totalChunks > 0) {
    const percent = (readerState.currentIndex / readerState.totalChunks) * 100;
    progressSlider.max = readerState.totalChunks - 1;
    progressSlider.value = readerState.currentIndex;
    progressFill.style.width = `${percent}%`;

    currentTimeEl.textContent = readerState.currentIndex + 1;
    totalTimeEl.textContent = readerState.totalChunks;
  }
}

function updateStatus(text) {
  const statusText = document.getElementById('statusText');
  statusText.textContent = text;
}

(function wirePlayerButtons() {
  document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const speedSlider = document.getElementById('speedSlider');
    const voiceSelect = document.getElementById('voiceSelect');
    const statusText = document.getElementById('statusText');

    if (!playBtn) return;

    playBtn.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        if (statusText) statusText.textContent = 'Error: No active tab found';
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'tts_start_reader',
          rate: parseFloat(speedSlider?.value) || 1,
          voice: voiceSelect?.value || ''
        });

        if (response?.success) {
          playBtn.classList.add('hidden');
          pauseBtn?.classList.remove('hidden');
        } else {
          if (statusText) statusText.textContent = 'Error: ' + (response?.error || 'Could not start reading');
        }
      } catch (err) {
        console.error('failed to send tts_start_reader', err);
        if (statusText) statusText.textContent = 'Error: Could not start reading';
      }
    });

    pauseBtn?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'tts_pause' });
      playBtn.classList.remove('hidden');
      pauseBtn.classList.add('hidden');
    });

    stopBtn?.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.runtime.sendMessage({ action: 'tts_stop' });
      try {
        chrome.tabs.sendMessage(tab.id, { action: 'tts_stop' });
      } catch (e) {}
      playBtn.classList.remove('hidden');
      pauseBtn?.classList.add('hidden');
      if (statusText) statusText.textContent = 'Stopped';
    });
  });
})();;
