// webcam.js - Version med zoom-funktionalitet

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
const appVersionOverlay = document.getElementById("appVersion");

// Zoom buttons (assuming these IDs are in your HTML)
const zoom5Btn = document.getElementById("zoom5Btn");
const zoom4Btn = document.getElementById("zoom4Btn");
const zoom3Btn = document.getElementById("zoom3Btn");
const zoom2Btn = document.getElementById("zoom2Btn");
const zoom1Btn = document.getElementById("zoom1Btn");

let stream = null;
let sendInterval = null;
let ws = null;
let appVersion = "V. 0.1.0.0";

// --- Zoom State ---
let currentZoomLevel = 1; // Default to x1 (no zoom)

// === SAVE / LOAD CONFIG ===
function saveConfig() {
    localStorage.setItem("streamServerIp", ipInput.value);
    localStorage.setItem("streamServerPort", portInput.value);
    localStorage.setItem("selectedCameraId", cameraSelect.value);
    localStorage.setItem("selectedResolution", resolutionSelect.value);
    localStorage.setItem("selectedFps", fpsSelect.value);
    // Optional: Save current zoom level
    localStorage.setItem("currentZoomLevel", currentZoomLevel);
}

function loadConfig() {
    ipInput.value = localStorage.getItem("streamServerIp") || "";
    portInput.value = localStorage.getItem("streamServerPort") || "8181";
    resolutionSelect.value = localStorage.getItem("selectedResolution") || "vga";
    fpsSelect.value = localStorage.getItem("selectedFps") || "10";
    currentZoomLevel = parseFloat(localStorage.getItem("currentZoomLevel")) || 1; // Load zoom level
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
    appVersionOverlay.textContent = appVersion;
    updateOverlayInfo();
}
loadAppVersion();

// === OVERLAY DATA ===
let overlayData = {
    ip: "",
    resolution: "",
    battery: "Battery: Not available",
    version: ""
};

function updateOverlayInfo() {
    overlayData.ip = `wss://${ipInput.value}:${portInput.value}`;
    overlayData.resolution = resolutionSelect.options[resolutionSelect.selectedIndex]?.textContent || "Unknown";
    overlayData.version = appVersion;

    if (navigator.getBattery) {
        navigator.getBattery().then(battery => {
            const level = Math.round(battery.level * 100);
            overlayData.battery = `Battery: ${level}%`;
        });
    } else {
        overlayData.battery = "Battery: Not available";
    }

    ipaddressOverlay.textContent = overlayData.ip;
    batteryOverlay.textContent = overlayData.battery;
    appVersionOverlay.textContent = overlayData.version;
}
setInterval(updateOverlayInfo, 1000);
updateOverlayInfo();

// === CAMERA & STREAM ===

async function getCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === "videoinput");
        cameraSelect.innerHTML = "";

        if (videoDevices.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "Ingen kameraer fundet";
            cameraSelect.appendChild(option);
            statusText.textContent = "🔴 Ingen kameraer fundet";
            return;
        }

        videoDevices.forEach((device, index) => {
            const option = document.createElement("option");
            option.value = device.deviceId;
            let label = device.label || `Camera ${index + 1}`;
            if (label.toLowerCase().includes('front')) {
                label = `Front Camera (${label})`;
            } else if (label.toLowerCase().includes('back') || label.toLowerCase().includes('environment')) {
                label = `Bagkamera (${label})`;
            } else {
                label = `Kamera ${index + 1} (${label})`;
            }
            option.textContent = label;
            cameraSelect.appendChild(option);
        });

        const savedCamera = localStorage.getItem("selectedCameraId");
        if (savedCamera && videoDevices.some(d => d.deviceId === savedCamera)) {
            cameraSelect.value = savedCamera;
        } else {
            const backCamera = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
            if (backCamera) {
                cameraSelect.value = backCamera.deviceId;
            } else {
                cameraSelect.value = videoDevices[0].deviceId;
            }
        }
        statusText.textContent = "⚪ Vælg kamera og IP";

    } catch (e) {
        console.error("Error enumerating devices:", e);
        alert("Fejl ved hentning af kameraliste. Giv adgang til kameraet. (Fejlkode: " + e.name + ")");
        cameraSelect.innerHTML = "";
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Kunne ikke hente kameraer (tilladelse mangler/fejl)";
        cameraSelect.appendChild(option);
        statusText.textContent = "🔴 Kunne ikke hente kameraer";
    }
}
getCameras();
cameraSelect.addEventListener("change", saveConfig);

function getResolutionSettings() {
    const val = resolutionSelect.value;
    if (val === "vga") return { width: { ideal: 640 }, height: { ideal: 480 } };
    if (val === "hd") return { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (val === "fhd") return { width: { ideal: 1920 }, height: { ideal: 1080 } };
    return { width: { ideal: 640 }, height: { ideal: 480 } };
}

function getJPEGQuality() {
    return 0.92;
}

async function startCamera() {
    console.log("Attempting to start camera...");
    statusText.textContent = "🟡 Starter kamera...";

    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }

    const selectedDeviceId = cameraSelect.value;
    if (!selectedDeviceId) {
        alert("FEJL: Intet kamera er valgt i rullemenuen. Prøv at genopfriske siden, eller giv kameratilladelser.");
        statusText.textContent = "🔴 Kamerastart fejlede: Intet kamera valgt";
        console.error("No camera selected for startCamera.");
        return;
    }

    const resolutionConstraints = getResolutionSettings();
    const selectedDeviceLabel = cameraSelect.options[cameraSelect.selectedIndex]?.textContent.toLowerCase();

    let videoConstraints = {
        audio: false,
        video: { ...resolutionConstraints }
    };

    if (selectedDeviceLabel.includes('front')) {
        videoConstraints.video.facingMode = 'user';
    } else if (selectedDeviceLabel.includes('back') || selectedDeviceLabel.includes('miljø') || selectedDeviceLabel.includes('environment')) {
        videoConstraints.video.facingMode = 'environment';
    } else if (selectedDeviceId) {
        videoConstraints.video.deviceId = { exact: selectedDeviceId };
    } else {
        videoConstraints.video = true;
    }

    const fps = parseInt(fpsSelect.value, 10);
    videoConstraints.video.frameRate = { ideal: fps };

    console.log("Using video constraints (Final Version):", videoConstraints.video);

    try {
        stream = await navigator.mediaDevices.getUserMedia(videoConstraints);

        console.log("Camera stream obtained successfully.");
        statusText.textContent = "🟢 Kamera startet, forbinder...";

        video.srcObject = stream;
        video.play();

        const settings = stream.getVideoTracks()[0].getSettings();
        canvas.width = settings.width;
        canvas.height = settings.height;
        console.log(`Actual camera resolution: ${settings.width}x${settings.height}, Actual FPS: ${settings.frameRate}`);


        video.style.display = "none";
        canvas.style.display = "block";

        startSendingFrames();

    } catch (error) {
        console.error("Error starting camera:", error);
        let userMessage = "Kunne ikke starte videokilde.";

        if (error.name === 'NotReadableError') {
            userMessage = "Kameraet er sandsynligvis i brug af en anden app, eller der er en midlertidig hardwarefejl. Prøv at **genstarte telefonen, lukke alle andre apps** (især dem der bruger kameraet), og sikre at intet andet bruger kameraet. (Fejlkode: NotReadableError)";
        } else if (error.name === 'NotAllowedError') {
            userMessage = "Adgang til kameraet blev nægtet. Du skal give adgang i telefonens indstillinger (Indstillinger -> Apps -> Chrome/Webcam App -> Tilladelser -> Kamera). (Fejlkode: NotAllowedError)";
        } else if (error.name === 'NotFoundError') {
            userMessage = "Ingen passende kameraer fundet på denne enhed. Sørg for, at din telefon har et fungerende kamera. (Fejlkode: NotFoundError)";
        } else if (error.name === 'OverconstrainedError') {
            userMessage = `De specificerede videokrav (opløsning, framerate eller kamera-valg) kunne ikke opfyldes af dit kamera. Prøv at vælge en **lavere opløsning, eller tilpas FPS-indstillingen**. Fejldetaljer: ${error.message || 'Ukendt'}. (Fejlkode: OverconstrainedError, Constraint: ${error.constraint || 'Ukendt'})`;
            console.warn("OverconstrainedError details:", error.constraint, error.message);
        } else if (error.name === 'SecurityError') {
            userMessage = "En sikkerhedsfejl forhindrede adgang til kameraet. Sørg for at tilgå siden via **HTTPS** (f.eks. din GitHub Pages URL). (Fejlkode: SecurityError)";
        } else if (error.name === 'AbortError') {
            userMessage = "Adgangen til kameraet blev afbrudt. Prøv at starte igen. (Fejlkode: AbortError)";
        } else {
            userMessage = "En ukendt fejl opstod ved start af kameraet. (Fejlkode: " + error.name + ")";
        }

        alert("FEJL ved start af kamera: " + userMessage);
        statusText.textContent = "🔴 Kamerastart fejlede";
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

    ws = new WebSocket(`wss://${ip}:${port}`);

    ws.onopen = () => {
        statusText.textContent = "🔵 Streaming started";
        sendInterval = setInterval(() => {
            // Get actual video dimensions
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;

            // Calculate source crop area for current zoom level
            const cropWidth = videoWidth / currentZoomLevel;
            const cropHeight = videoHeight / currentZoomLevel;
            const cropX = (videoWidth - cropWidth) / 2;
            const cropY = (videoHeight - cropHeight) / 2;

            // Draw cropped video to canvas, filling the canvas (output resolution)
            ctx.drawImage(
                video,
                cropX, cropY, cropWidth, cropHeight, // Source (cropped) rectangle
                0, 0, canvas.width, canvas.height     // Destination (canvas size) rectangle
            );

            // === OVERLAY DRAWING ON CANVAS ===
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(0, 0, canvas.width, 40);

            ctx.fillStyle = "white";
            ctx.font = "14px Arial";

            ctx.fillText(overlayData.ip, 10, 20);
            const versionTextWidth = ctx.measureText(overlayData.version).width;
            ctx.fillText(overlayData.version, canvas.width - versionTextWidth - 10, 20);

            // Add zoom level to overlay
            ctx.fillText(`${overlayData.resolution} (Zoom: x${currentZoomLevel.toFixed(1)})`, 10, 40);
            const batteryTextWidth = ctx.measureText(overlayData.battery).width;
            ctx.fillText(overlayData.battery, canvas.width - batteryTextWidth - 10, 40);

            canvas.toBlob(blob => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(blob);
                }
            }, 'image/jpeg', getJPEGQuality());
        }, interval);
    };

    ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
        statusText.textContent = "🔴 Kunne ikke forbinde til server";
        alert("FEJL: Kunne ikke forbinde til streamingserveren. Tjek IP/Port, firewall og serverstatus.");
    };

    ws.onclose = () => {
        statusText.textContent = "⚪ Streaming stoppet";
        clearInterval(sendInterval);
    };
}

// === Zoom Button Handlers ===
function setZoomLevel(level) {
    currentZoomLevel = level;
    console.log(`Zoom level set to: x${currentZoomLevel}`);
    updateOverlayInfo(); // Update overlay to show new zoom
    saveConfig(); // Save zoom level
}

zoom5Btn.addEventListener("click", () => setZoomLevel(5));
zoom4Btn.addEventListener("click", () => setZoomLevel(4));
zoom3Btn.addEventListener("click", () => setZoomLevel(3));
zoom2Btn.addEventListener("click", () => setZoomLevel(2));
zoom1Btn.addEventListener("click", () => setZoomLevel(1));

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
