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