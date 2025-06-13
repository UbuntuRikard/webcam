// webcam.js - Optimized zoom and internationalized comments/strings

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
const saveBtn = document.getElementById("saveConfigBtn"); // Your existing Save button
const statusText = document.getElementById("status");

const ipaddressOverlay = document.getElementById("ipaddress");
const batteryOverlay = document.getElementById("battery");
const appVersionOverlay = document.getElementById("appVersion");

// Zoom buttons (assuming these IDs are in your HTML)
const zoom8Btn = document.getElementById("zoom8Btn");
const zoom7Btn = document.getElementById("zoom7Btn");
const zoom6Btn = document.getElementById("zoom6Btn");
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

// === SAVE / LOAD CONFIGURATION ===
function saveConfig() {
    localStorage.setItem("streamServerIp", ipInput.value);
    localStorage.setItem("streamServerPort", portInput.value);
    localStorage.setItem("selectedCameraId", cameraSelect.value);
    localStorage.setItem("selectedResolution", resolutionSelect.value);
    localStorage.setItem("selectedFps", fpsSelect.value);
    localStorage.setItem("currentZoomLevel", currentZoomLevel); // Save current zoom level
}

function loadConfig() {
    ipInput.value = localStorage.getItem("streamServerIp") || "";
    portInput.value = localStorage.getItem("streamServerPort") || "8181";
    resolutionSelect.value = localStorage.getItem("selectedResolution") || "vga";
    fpsSelect.value = localStorage.getItem("selectedFps") || "10";
    currentZoomLevel = parseFloat(localStorage.getItem("currentZoomLevel")) || 1; // Load zoom level
}
// Use your existing save button (saveBtn) to call saveConfig
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
    battery: "Battery: N/A",
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
        overlayData.battery = "Battery: N/A";
    }

    ipaddressOverlay.textContent = overlayData.ip;
    batteryOverlay.textContent = overlayData.battery;
    appVersionOverlay.textContent = overlayData.version;
}
setInterval(updateOverlayInfo, 1000);
updateOverlayInfo();

// === CAMERA & STREAM HANDLING ===

async function getCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === "videoinput");
        cameraSelect.innerHTML = "";

        if (videoDevices.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No cameras found";
            cameraSelect.appendChild(option);
            statusText.textContent = "🔴 No cameras found";
            return;
        }

        videoDevices.forEach((device, index) => {
            const option = document.createElement("option");
            option.value = device.deviceId;
            let label = device.label || `Camera ${index + 1}`;
            if (label.toLowerCase().includes('front')) {
                label = `Front Camera (${label})`;
            } else if (label.toLowerCase().includes('back') || label.toLowerCase().includes('environment')) {
                label = `Rear Camera (${label})`;
            } else {
                label = `Camera ${index + 1} (${label})`;
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
        statusText.textContent = "⚪ Select camera and IP";

    } catch (e) {
        console.error("Error enumerating devices:", e);
        alert("Error fetching camera list. Please grant camera access. (Error code: " + e.name + ")");
        cameraSelect.innerHTML = "";
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Could not fetch cameras (permission missing/error)";
        cameraSelect.appendChild(option);
        statusText.textContent = "🔴 Could not fetch cameras";
    }
}
getCameras();
cameraSelect.addEventListener("change", saveConfig);

// getResolutionSettings() now ONLY defines the desired OUTPUT resolution for the canvas
// We request the maximum INPUT resolution in startCamera
function getResolutionSettings() {
    const val = resolutionSelect.value;
    if (val === "vga") return { width: 640, height: 480 };
    if (val === "hd") return { width: 1280, height: 720 };
    if (val === "fhd") return { width: 1920, height: 1080 };
    return { width: 640, height: 480 }; // Default to VGA
}

function getJPEGQuality() {
    return 0.92;
}

async function startCamera() {
    console.log("Attempting to start camera...");
    statusText.textContent = "🟡 Starting camera...";

    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }

    const selectedDeviceId = cameraSelect.value;
    if (!selectedDeviceId) {
        alert("ERROR: No camera selected in the dropdown. Try refreshing the page, or grant camera permissions.");
        statusText.textContent = "🔴 Camera start failed: No camera selected";
        console.error("No camera selected for startCamera.");
        return;
    }

    // Request the HIGHEST POSSIBLE resolution from the camera.
    // We ask for a very high 'ideal' resolution. The browser will provide the highest
    // it supports that doesn't exceed this ideal (e.g., 4608x2592 if available).
    let highResolutionConstraint = { width: { ideal: 4096 }, height: { ideal: 2160 } }; // Example 4K resolution

    const selectedDeviceLabel = cameraSelect.options[cameraSelect.selectedIndex]?.textContent.toLowerCase();

    let videoConstraints = {
        audio: false,
        video: { ...highResolutionConstraint } // Start with high resolution for input
    };

    if (selectedDeviceLabel.includes('front')) {
        videoConstraints.video.facingMode = 'user';
    } else if (selectedDeviceLabel.includes('back') || selectedDeviceLabel.includes('environment')) {
        videoConstraints.video.facingMode = 'environment';
    } else if (selectedDeviceId) {
        videoConstraints.video.deviceId = { exact: selectedDeviceId };
    } else {
        videoConstraints.video = true;
    }

    const fps = parseInt(fpsSelect.value, 10);
    videoConstraints.video.frameRate = { ideal: fps };

    console.log("Using video constraints (Max Input Resolution):", videoConstraints.video);

    try {
        stream = await navigator.mediaDevices.getUserMedia(videoConstraints);

        console.log("Camera stream obtained successfully.");
        statusText.textContent = "🟢 Camera started, connecting...";

        video.srcObject = stream;
        video.play();

        const actualVideoSettings = stream.getVideoTracks()[0].getSettings();
        const selectedCanvasResolution = getResolutionSettings(); // Get the desired OUTPUT resolution
        
        // Canvas dimensions are set to the selected output resolution
        canvas.width = selectedCanvasResolution.width;
        canvas.height = selectedCanvasResolution.height;

        console.log(`Actual camera INPUT resolution: ${actualVideoSettings.width}x${actualVideoSettings.height}, Actual FPS: ${actualVideoSettings.frameRate}`);
        console.log(`Canvas OUTPUT resolution (for stream): ${canvas.width}x${canvas.height}`);


        video.style.display = "none";
        canvas.style.display = "block";

        startSendingFrames();

    } catch (error) {
        console.error("Error starting camera:", error);
        let userMessage = "Could not start video source.";

        if (error.name === 'NotReadableError') {
            userMessage = "The camera is likely in use by another app, or there's a temporary hardware error. Try to **restart the phone, close all other apps** (especially those using the camera), and ensure nothing else is using the camera. (Error code: NotReadableError)";
        } else if (error.name === 'NotAllowedError') {
            userMessage = "Camera access was denied. You need to grant access in your phone's settings (Settings -> Apps -> Chrome/Webcam App -> Permissions -> Camera). (Error code: NotAllowedError)";
        } else if (error.name === 'NotFoundError') {
            userMessage = "No suitable cameras found on this device. Ensure your phone has a functioning camera. (Error code: NotFoundError)";
        } else if (error.name === 'OverconstrainedError') {
            userMessage = `The specified video requirements (resolution, framerate, or camera selection) could not be met by your camera. Try selecting a **lower resolution, or adjust the FPS setting**. Error details: ${error.message || 'Unknown'}. (Error code: OverconstrainedError, Constraint: ${error.constraint || 'Unknown'})`;
            console.warn("OverconstrainedError details:", error.constraint, error.message);
        } else if (error.name === 'SecurityError') {
            userMessage = "A security error prevented camera access. Ensure you are accessing the page via **HTTPS** (e.g., your GitHub Pages URL). (Error code: SecurityError)";
        } else if (error.name === 'AbortError') {
            userMessage = "Camera access was aborted. Try starting again. (Error code: AbortError)";
        } else {
            userMessage = "An unknown error occurred while starting the camera. (Error code: " + error.name + ")";
        }

        alert("ERROR starting camera: " + userMessage);
        statusText.textContent = "🔴 Camera start failed";
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
            // Get actual video dimensions of the stream received from the camera.
            // This will be the highest possible resolution (e.g., 4608x2592).
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;

            // Calculate source crop area for current zoom level.
            const cropWidth = videoWidth / currentZoomLevel;
            const cropHeight = videoHeight / currentZoomLevel;
            const cropX = (videoWidth - cropWidth) / 2;
            const cropY = (videoHeight - cropHeight) / 2;

            // Draw cropped video (from high resolution source) to canvas (at selected output resolution).
            ctx.drawImage(
                video,
                cropX, cropY, cropWidth, cropHeight, // Source (cropped) rectangle from high-res video
                0, 0, canvas.width, canvas.height     // Destination (canvas size - VGA/HD/FHD) rectangle
            );

            // === OVERLAY DRAWING ON CANVAS ===
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(0, 0, canvas.width, 40); 

            ctx.fillStyle = "white";
            ctx.font = "14px Arial"; 

            ctx.fillText(overlayData.ip, 10, 20); 
            const versionTextWidth = ctx.measureText(overlayData.version).width;
            ctx.fillText(overlayData.version, canvas.width - versionTextWidth - 10, 20); 

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
        statusText.textContent = "🔴 Could not connect to server"; 
        alert("ERROR: Could not connect to the streaming server. Check IP/Port, firewall, and server status.");
    };

    ws.onclose = () => {
        statusText.textContent = "⚪ Streaming stopped"; 
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

// Attach event listeners for all 8 zoom buttons
zoom8Btn.addEventListener("click", () => setZoomLevel(8));
zoom7Btn.addEventListener("click", () => setZoomLevel(7));
zoom6Btn.addEventListener("click", () => setZoomLevel(6));
zoom5Btn.addEventListener("click", () => setZoomLevel(5));
zoom4Btn.addEventListener("click", () => setZoomLevel(4));
zoom3Btn.addEventListener("click", () => setZoomLevel(3));
zoom2Btn.addEventListener("click", () => setZoomLevel(2));
zoom1Btn.addEventListener("click", () => setZoomLevel(1));

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
