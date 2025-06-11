const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const cameraSelect = document.getElementById("cameraSelect");
const resolutionSelect = document.getElementById("resolutionSelect");
const fpsSelect = document.getElementById("fpsSelect");
const ipInput = document.getElementById("serverIp");
const portInput = document.getElementById("serverPort");
const saveBtn = document.getElementById("saveConfigBtn");
const statusText = document.getElementById("status");

const ipaddressOverlay = document.getElementById("ipaddress");
const batteryOverlay = document.getElementById("battery");
const appVersionOverlay = document.getElementById("appVersion"); // Reference to app version element

let stream = null;
let sendInterval = null;
let ws = null;
let appVersion = "V. 0.1.0.0"; // Default version number

// === SAVE / LOAD CONFIG ===
function saveConfig() {
    localStorage.setItem("streamServerIp", ipInput.value);
    localStorage.setItem("streamServerPort", portInput.value);
    localStorage.setItem("selectedCameraId", cameraSelect.value);
    localStorage.setItem("selectedResolution", resolutionSelect.value);
    localStorage.setItem("selectedFps", fpsSelect.value);
}

function loadConfig() {
    ipInput.value = localStorage.getItem("streamServerIp") || "";
    portInput.value = localStorage.getItem("streamServerPort") || "8181";
    resolutionSelect.value = localStorage.getItem("selectedResolution") || "vga";
    fpsSelect.value = localStorage.getItem("selectedFps") || "10";
}
saveBtn.addEventListener("click", () => {
    saveConfig();
    updateOverlayInfo();
});
loadConfig();

// Function to load app version from manifest.json
async function loadAppVersion() {
    try {
        const response = await fetch('manifest.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const manifest = await response.json();
        if (manifest.version) {
            appVersion = `V. ${manifest.version}`;
        }
    } catch (e) {
        console.warn("Could not load manifest.json or version from it, using default.", e);
    }
    // Update the HTML overlay with the fetched/default version
    appVersionOverlay.textContent = appVersion;
    updateOverlayInfo(); // Ensure canvas drawing gets the updated version
}
loadAppVersion(); // Call this function on page load

// === OVERLAY DATA ===
let overlayData = {
    ip: "",
    resolution: "",
    battery: "Battery: Not available",
    version: "" // Add version to overlayData
};

function updateOverlayInfo() {
    // IMPORTANT: Change to wss:// for secure WebSocket connection.
    // This is because your PWA is hosted on HTTPS (GitHub Pages).
    overlayData.ip = `wss://${ipInput.value}:${portInput.value}`;
    overlayData.resolution = resolutionSelect.options[resolutionSelect.selectedIndex]?.textContent || "Unknown";
    overlayData.version = appVersion; // Use the globally loaded version

    if (navigator.getBattery) {
        navigator.getBattery().then(battery => {
            const level = Math.round(battery.level * 100);
            overlayData.battery = `Battery: ${level}%`;
        });
    } else {
        overlayData.battery = "Battery: Not available";
    }

    // Update HTML DOM elements
    ipaddressOverlay.textContent = overlayData.ip;
    batteryOverlay.textContent = overlayData.battery;
    appVersionOverlay.textContent = overlayData.version; // Update HTML element for version
}
setInterval(updateOverlayInfo, 1000);
updateOverlayInfo();

// === CAMERA & STREAM ===
async function requestCameraPermission() {
    try {
        await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (e) {
        alert("Camera permission was not granted."); // Translated message
        throw e;
    }
}

async function getCameras() {
    await requestCameraPermission();

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === "videoinput");
    cameraSelect.innerHTML = "";

    videoDevices.forEach((device, index) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${index}`;
        cameraSelect.appendChild(option);
    });

    const savedCamera = localStorage.getItem("selectedCameraId");
    if (savedCamera && videoDevices.some(d => d.deviceId === savedCamera)) {
        cameraSelect.value = savedCamera;
    }
}
getCameras();
cameraSelect.addEventListener("change", saveConfig);

function getResolutionSettings() {
    const val = resolutionSelect.value;
    if (val === "vga") return { width: { exact: 640 }, height: { exact: 480 } };
    if (val === "hd") return { width: { exact: 1280 }, height: { exact: 720 } };
    if (val === "fhd") return { width: { exact: 1920 }, height: { exact: 1080 } };
    return { width: { ideal: 640 }, height: { ideal: 480 } }; // Default to VGA
}

function getJPEGQuality() {
    return 0.92;
}

async function startCamera() {
    console.log("Attempting to start camera...");
    statusText.textContent = "🟡 Starter kamera..."; // Update status text

    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null; // Clear previous stream if it exists
    }

    const resolution = getResolutionSettings();
    const videoConstraints = {
        ...resolution,
        deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined
    };

    try {
        // This is where navigator.mediaDevices.getUserMedia() is called
        // The error "NotReadableError: Could not start video source" originates here
        stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false
        });

        console.log("Camera stream obtained successfully.");
        statusText.textContent = "🟢 Kamera startet, forbinder..."; // Update status

        video.srcObject = stream;
        video.play();

        const settings = stream.getVideoTracks()[0].getSettings();
        canvas.width = settings.width;
        canvas.height = settings.height;

        video.style.display = "none";
        canvas.style.display = "block";

        startSendingFrames(); // This starts the WebSocket connection and frame sending

    } catch (error) {
        console.error("Error starting camera:", error);
        let userMessage = "Kunne ikke starte videokilde.";

        // --- Detailed error handling based on error.name ---
        if (error.name === 'NotReadableError') {
            userMessage = "Kameraet er sandsynligvis i brug af en anden app, eller der er en midlertidig hardwarefejl. Prøv at **genstarte telefonen, lukke alle andre apps** (især dem der bruger kameraet), og sikre at intet andet bruger kameraet.";
        } else if (error.name === 'NotAllowedError') {
            // This case is unlikely if you've manually set permissions, but included for completeness.
            userMessage = "Adgang til kameraet blev nægtet. Du skal give adgang i telefonens indstillinger (Indstillinger -> Apps -> Chrome/Webcam App -> Tilladelser -> Kamera).";
        } else if (error.name === 'NotFoundError') {
            userMessage = "Ingen passende kameraer fundet på denne enhed. Sørg for, at din telefon har et fungerende kamera.";
        } else if (error.name === 'OverconstrainedError') {
            userMessage = "De specificerede videokrav (opløsning, framerate) kunne ikke opfyldes af dit kamera. Prøv en lavere opløsning eller framerate.";
        } else if (error.name === 'SecurityError') {
            userMessage = "En sikkerhedsfejl forhindrede adgang til kameraet. Sørg for at tilgå siden via **HTTPS** (f.eks. din GitHub Pages URL).";
        } else if (error.name === 'AbortError') {
            userMessage = "Adgangen til kameraet blev afbrudt. Prøv at starte igen.";
        } else {
            userMessage = "En ukendt fejl opstod ved start af kameraet.";
        }
        // --- End of detailed error handling ---

        alert("FEJL ved start af kamera: " + userMessage); // Show an alert to the user
        statusText.textContent = "🔴 Kamerastart fejlede"; // Update status in UI
        // Optionally, re-enable start button or disable stop button here if desired
    }
}
function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
    if (ws) {
        ws.close();
        ws = null;
    }
    clearInterval(sendInterval);
    statusText.textContent = "⚪ Streaming stopped";
}

function startSendingFrames() {
    const ip = ipInput.value;
    const port = portInput.value;
    if (!ip || !port) {
        alert("Please enter server IP and port first.");
        return;
    }

    const fps = parseInt(fpsSelect.value, 10);
    const interval = 1000 / fps;

    // --- CRITICAL CHANGE: Use wss:// for secure WebSocket ---
    ws = new WebSocket(`wss://${ip}:${port}`); // Changed from ws:// to wss://
    // --- END CRITICAL CHANGE ---

    ws.onopen = () => {
        statusText.textContent = "🔵 Streaming started";
        sendInterval = setInterval(() => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // === OVERLAY DRAWING ON CANVAS ===
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(0, 0, canvas.width, 40); // Adjusted height for 2 lines of text + padding

            ctx.fillStyle = "white";
            ctx.font = "14px Arial"; // Adjusted font size for better readability

            // Top Row: IP (left), Version (right)
            ctx.fillText(overlayData.ip, 10, 20); // IP at top-left, slightly higher
            const versionTextWidth = ctx.measureText(overlayData.version).width;
            ctx.fillText(overlayData.version, canvas.width - versionTextWidth - 10, 20); // Version at top-right

            // Bottom Row: Resolution (left), Battery (right)
            ctx.fillText(`${overlayData.resolution}`, 10, 40); // Resolution below IP
            const batteryTextWidth = ctx.measureText(overlayData.battery).width;
            ctx.fillText(overlayData.battery, canvas.width - batteryTextWidth - 10, 40); // Battery at bottom-right


            canvas.toBlob(blob => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(blob);
                }
            }, 'image/jpeg', getJPEGQuality());
        }, interval);
    };

    ws.onerror = (error) => {
        console.error("WebSocket Error:", error); // Log the error for debugging
        statusText.textContent = "🔴 Could not connect to server";
    };

    ws.onclose = () => {
        statusText.textContent = "⚪ Streaming stopped";
        clearInterval(sendInterval);
    };
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
