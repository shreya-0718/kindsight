let lens = null;
let screenshotCanvas = null;
let screenshotCtx = null;
let currentSettings = null;
let lensCreated = false;
let h2c = null; // bridged html2canvas

document.addEventListener("H2C_READY", (event) => {
    h2c = event.detail.html2canvas;
    console.log("html2canvas bridged into content script");
});

function injectHtml2Canvas() {
    return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("libs/html2canvas.js");

        script.onload = () => {
            console.log("html2canvas loaded in page");

            const bridge = document.createElement("script");
            bridge.textContent = `
                document.dispatchEvent(new CustomEvent("H2C_READY", {
                    detail: { html2canvas }
                }));
            `;
            document.documentElement.appendChild(bridge);

            resolve();
        };

        script.onerror = () => {
            console.error("Failed to load html2canvas");
            resolve();
        };

        document.documentElement.appendChild(script);
    });
}

async function initializeMagnifier() {
    await injectHtml2Canvas();

    chrome.storage.sync.get(
        {
            magnifyEnabled: false,
            zoomScale: 2,
            magnifierShape: "circle"
        },
        async (settings) => {
            currentSettings = settings;
            console.log("Magnifier initialized with settings:", currentSettings);

            if (currentSettings?.magnifyEnabled) {
                await takeScreenshot();
                if (!lensCreated) {
                    createLens();
                    attachListeners();
                    lensCreated = true;
                }
            }
        }
    );
}

async function takeScreenshot() {
    try {
        if (!h2c) {
            console.error("html2canvas not bridged");
            return;
        }

        const screenshot = await h2c(document.body, {
            scale: 1,
            useCORS: true,
            allowTaint: true,
            backgroundColor: null
        });

        console.log("Screenshot result:", screenshot);

        screenshotCanvas = document.createElement("canvas");
        screenshotCanvas.width = screenshot.width;
        screenshotCanvas.height = screenshot.height;

        screenshotCtx = screenshotCanvas.getContext("2d");
        screenshotCtx.drawImage(screenshot, 0, 0);
    } catch (error) {
        console.error("Error taking screenshot:", error);
        screenshotCanvas = null;
    }
}

function createLens() {
    const size = 150;

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
        ${currentSettings.magnifierShape === "circle" ? "border-radius: 50%;" : "border-radius: 8px;"}
    `;

    const lensCanvas = document.createElement("canvas");
    lensCanvas.width = size;
    lensCanvas.height = size;
    lens.appendChild(lensCanvas);

    document.body.appendChild(lens);
}

function attachListeners() {
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("scroll", handleMove);
}

function detachListeners() {
    document.removeEventListener("mousemove", handleMove);
    document.removeEventListener("scroll", handleMove);
}

function handleMove(e) {
    if (!lens || !currentSettings?.magnifyEnabled || !screenshotCanvas) return;

    const size = 150;
    const zoom = currentSettings.zoomScale || 2;

    lens.style.display = "block";
    lens.style.left = `${e.clientX - size / 2}px`;
    lens.style.top = `${e.clientY - size / 2}px`;

    const sx = e.pageX - size / (2 * zoom);
    const sy = e.pageY - size / (2 * zoom);
    const sw = size / zoom;
    const sh = size / zoom;

    const lensCanvas = lens.firstElementChild;
    const lensCtx = lensCanvas.getContext("2d");

    lensCtx.clearRect(0, 0, size, size);
    lensCtx.drawImage(
        screenshotCanvas,
        sx, sy, sw, sh,
        0, 0, size, size
    );
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "updateMagnifier") {
        currentSettings = request.settings;
        console.log("Updated magnifier settings:", currentSettings);

        if (currentSettings?.magnifyEnabled) {
            if (lens) {
                lens.remove();
                lens = null;
                lensCreated = false;
            }
            takeScreenshot().then(() => {
                createLens();
                if (!lensCreated) {
                    attachListeners();
                    lensCreated = true;
                }
            });
        } else {
            if (lens) lens.style.display = "none";
            if (lensCreated) {
                detachListeners();
                lensCreated = false;
            }
        }
    }
});

window.addEventListener("load", () => {
    setTimeout(() => {
        initializeMagnifier();
    }, 300);
});