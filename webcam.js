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
const appVersionOverlay = document.getElementById("appVersion"); // NEW: Reference to app version element

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

// NEW: Function to load app version from manifest.json
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
  version: "" // NEW: Add version to overlayData
};

function updateOverlayInfo() {
  overlayData.ip = `http://${ipInput.value}:${portInput.value}`;
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
    alert("Tilladelse til kamera blev ikke givet.");
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
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }

  const resolution = getResolutionSettings();
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      ...resolution,
      deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined
    },
    audio: false
  });

  video.srcObject = stream;
  video.play();

  const settings = stream.getVideoTracks()[0].getSettings();
  canvas.width = settings.width;
  canvas.height = settings.height;

  video.style.display = "none";
  canvas.style.display = "block";

  startSendingFrames();
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

  ws = new WebSocket(`ws://${ip}:${port}`);
  ws.onopen = () => {
    statusText.textContent = "🔵 Streaming started";
    sendInterval = setInterval(() => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // === OVERLAY DRAWING ON CANVAS ===
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, canvas.width, 60); // Background bar height

      ctx.fillStyle = "white";
      ctx.font = "10px sans-serif"; // Canvas font size to 10px

      // Top Row: IP (left), Version (center), Battery (right)
      ctx.fillText(overlayData.ip, 10, 15); // IP at top-left
      const versionTextWidth = ctx.measureText(overlayData.version).width;
      ctx.fillText(overlayData.version, (canvas.width / 2) - (versionTextWidth / 2), 15); // Version centered at top
      const batteryTextWidth = ctx.measureText(overlayData.battery).width;
      ctx.fillText(overlayData.battery, canvas.width - batteryTextWidth - 10, 15); // Battery at top-right

      // Bottom Row: Resolution (left)
      ctx.fillText(`${overlayData.resolution}`, 10, 30); // Resolution below IP

      canvas.toBlob(blob => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(blob);
        }
      }, 'image/jpeg', getJPEGQuality());
    }, interval);
  };

  ws.onerror = () => {
    statusText.textContent = "🔴 Could not connect to server";
  };

  ws.onclose = () => {
    statusText.textContent = "⚪ Streaming stopped";
    clearInterval(sendInterval);
  };
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
