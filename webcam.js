// webcam.js - Den samlede, forventede fungerende version

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const cameraSelect = document.getElementById("cameraSelect");
const resolutionSelect = document.getElementById("resolutionSelect");
const fpsSelect = document.getElementById("fpsSelect");
const ipInput = document.getElementById("serverIp");
const portInput = document = document.getElementById("serverPort");
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

// Vi fjerner requestCameraPermission og undgår dobbelt getUserMedia kald i getCameras
// async function requestCameraPermission() { ... }

async function getCameras() {
    // VI FJERNER requestCameraPermission HERFRA for at undgå den dobbelte initialisering.
    // Tilladelse vil nu blive anmodet om direkte af startCamera, når den kaldes.

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
            return; // Stop execution if no cameras found
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
        // Opdater status til at vise, at kameraer er klar til valg
        statusText.textContent = "⚪ Vælg kamera og IP";

    } catch (e) {
        console.error("Error enumerating devices:", e);
        // Denne fejl opstår typisk, hvis tilladelse ikke er givet overhovedet.
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

// getResolutionSettings() med 'ideal' constraints - forbedrer kompatibilitet
function getResolutionSettings() {
    const val = resolutionSelect.value;
    if (val === "vga") return { width: { ideal: 640 }, height: { ideal: 480 } }; // Use ideal
    if (val === "hd") return { width: { ideal: 1280 }, height: { ideal: 720 } }; // Use ideal
    if (val === "fhd") return { width: { ideal: 1920 }, height: { ideal: 1080 } }; // Use ideal
    return { width: { ideal: 640 }, height: { ideal: 480 } }; // Default to VGA with ideal
}

function getJPEGQuality() {
    return 0.92;
}

// --- START AF startCamera funktion (med facingMode og ideal opløsninger) ---
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
        return; // Afbryd funktionen hvis intet kamera er valgt
    }

    const resolutionConstraints = getResolutionSettings(); // Henter nu 'ideal' opløsninger
    const selectedDeviceLabel = cameraSelect.options[cameraSelect.selectedIndex]?.textContent.toLowerCase();

    let videoConstraints = {
        audio: false,
        video: { ...resolutionConstraints } // Starter med 'ideal' opløsning
    };

    // Prioriter facingMode hvis labelen antyder front/back
    if (selectedDeviceLabel.includes('front')) {
        videoConstraints.video.facingMode = 'user';
    } else if (selectedDeviceLabel.includes('back') || selectedDeviceLabel.includes('miljø') || selectedDeviceLabel.includes('environment')) {
        videoConstraints.video.facingMode = 'environment';
    } else if (selectedDeviceId) {
        // Fallback til deviceId hvis facingMode ikke er tydelig, og vi har en deviceId
        videoConstraints.video.deviceId = { exact: selectedDeviceId }; 
    } else {
        // Sidste fallback hvis intet specifikt er valgt eller fundet - lad browseren vælge
        videoConstraints.video = true; 
    }

    // Tilføj FPS constraint med 'ideal'
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
// --- SLUT PÅ startCamera funktion ---


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
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // === OVERLAY DRAWING ON CANVAS ===
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(0, 0, canvas.width, 40); 

            ctx.fillStyle = "white";
            ctx.font = "14px Arial"; 

            ctx.fillText(overlayData.ip, 10, 20); 
            const versionTextWidth = ctx.measureText(overlayData.version).width;
            ctx.fillText(overlayData.version, canvas.width - versionTextWidth - 10, 20); 

            ctx.fillText(`${overlayData.resolution}`, 10, 40); 
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
        statusText.textContent = "🔴 Kunne ikke forbinde til server"; // Updated message
        // Add more specific error handling here if needed, e.g., for self-signed certs
        alert("FEJL: Kunne ikke forbinde til streamingserveren. Tjek IP/Port, firewall og serverstatus.");
    };

    ws.onclose = () => {
        statusText.textContent = "⚪ Streaming stoppet"; // Updated message
        clearInterval(sendInterval);
    };
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
