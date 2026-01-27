const DEFAULT_SETTINGS = {
    magnifyEnabled: false,
    zoomScale: 2,
    magnifierShape: 'circle'
};

let currentSettings = DEFAULT_SETTINGS;
let magnifier = null;

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initializeTabs();
    initializeMagnifyControls();
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
