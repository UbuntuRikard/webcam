// webcam.js
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const screenToggleBtn = document.getElementById("screenToggleBtn");
const cameraSelect = document.getElementById("cameraSelect");
const resolutionSelect = document.getElementById("resolutionSelect");
// const qualitySelect = document.getElementById("jpegQualitySelect");
const fpsSelect = document.getElementById("fpsSelect");
const forcePermissionCheckbox = document.getElementById("forcePermissionCheckbox");
const ipInput = document.getElementById("serverIp");
const portInput = document.getElementById("serverPort");
const saveBtn = document.getElementById("saveConfigBtn");
const statusText = document.getElementById("status");

let stream = null;
let sendInterval = null;
let ws = null;
let screenOn = true;

// === GEM / HENT KONFIG ===
function saveConfig() {
  localStorage.setItem("streamServerIp", ipInput.value);
  localStorage.setItem("streamServerPort", portInput.value);
  localStorage.setItem("selectedCameraId", cameraSelect.value);
  localStorage.setItem("selectedResolution", resolutionSelect.value);
//  localStorage.setItem("selectedQuality", qualitySelect.value);
  localStorage.setItem("selectedFps", fpsSelect.value);
  localStorage.setItem("forcePermission", forcePermissionCheckbox.checked);
}

function loadConfig() {
  ipInput.value = localStorage.getItem("streamServerIp") || "";
  portInput.value = localStorage.getItem("streamServerPort") || "8181";
  resolutionSelect.value = localStorage.getItem("selectedResolution") || "medium";
//  qualitySelect.value = localStorage.getItem("selectedQuality") || "0.92";
  fpsSelect.value = localStorage.getItem("selectedFps") || "10";
  forcePermissionCheckbox.checked = localStorage.getItem("forcePermission") === "true";
}
saveBtn.addEventListener("click", () => {
  saveConfig();
  updateOverlayInfo();
});
loadConfig();

// === OVERLAY DATA ===
let overlayData = {
  datetime: "",
  ip: "",
  resolution: "",
  quality: "",
  battery: "Battery: Not available"
};

function updateOverlayInfo() {
  const now = new Date();
  overlayData.datetime = now.toLocaleDateString() + " " + now.toLocaleTimeString();
  overlayData.ip = `http://${ipInput.value}:${portInput.value}`;
  overlayData.resolution = resolutionSelect.options[resolutionSelect.selectedIndex]?.textContent || "Unknown";
//  overlayData.quality = qualitySelect.options[qualitySelect.selectedIndex]?.textContent || "Unknown";

  if (navigator.getBattery) {
    navigator.getBattery().then(battery => {
      const level = Math.round(battery.level * 100);
      overlayData.battery = `Battery: ${level}%`;
    });
  } else {
    overlayData.battery = "Battery: Not available";
  }
// tilføjet
	document.getElementById("datetime").textContent = overlayData.datetime;
	document.getElementById("ipaddress").textContent = overlayData.ip;
	document.getElementById("battery").textContent = overlayData.battery;

}
setInterval(updateOverlayInfo, 1000);
updateOverlayInfo();

// === KAMERA & STREAM ===
async function requestCameraPermission() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
  } catch (e) {
    alert("Tilladelse til kamera blev ikke givet.");
    throw e;
  }
}

async function getCameras() {
  if (forcePermissionCheckbox.checked) {
    await requestCameraPermission();
  }

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
// tilføjet
cameraSelect.addEventListener("change", saveConfig);

function getResolutionSettings() {
  const val = resolutionSelect.value;
  if (val === "low") return { width: { exact: 320 }, height: { exact: 240 } };
  if (val === "medium") return { width: { exact: 640 }, height: { exact: 480 } };
  if (val === "high") return { width: { exact: 1280 }, height: { exact: 720 } };
  return { width: { ideal: 640 }, height: { ideal: 480 } };
}
/*
function getJPEGQuality() {
  return parseFloat(qualitySelect.value) || 0.8;
}
*/
async function startCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  const resolution = getResolutionSettings();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...resolution,
        deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined
      },
      audio: false
    });

    video.srcObject = stream;
    video.style.display = "block";    // Vis live video
    canvas.style.display = "none";    // Skjul canvas (der bruges til streaming senere)
    await video.play();

    statusText.textContent = "✅ Kamera startet, klar til visning";

  } catch (error) {
    alert("Fejl ved start af kamera: " + error.message);
    statusText.textContent = "❌ Kamera kunne ikke startes";
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

  ws = new WebSocket(`ws://${ip}:${port}`);
  ws.onopen = () => {
    statusText.textContent = "🔵 Streaming started";
    sendInterval = setInterval(() => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // === OVERLAY ===
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, canvas.width, 60);

      ctx.fillStyle = "white";
      ctx.font = "10px sans-serif";
      ctx.fillText(overlayData.datetime, 10, 20);
      ctx.fillText(`${overlayData.resolution}`, 10, 40);
      ctx.fillText(overlayData.ip, canvas.width - 300, 20);
      ctx.fillText(overlayData.battery, canvas.width - 300, 40);

		canvas.toBlob(blob => {
		  if (ws.readyState === WebSocket.OPEN) {
			ws.send(blob);
		  }
		}, 'image/jpeg');
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

function toggleScreen() {
  screenOn = !screenOn;
  video.style.display = screenOn ? "block" : "none";
  canvas.style.display = screenOn ? "none" : "block";
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
screenToggleBtn.addEventListener("click", toggleScreen);
