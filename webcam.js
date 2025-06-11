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
        // Request a generic video stream to get permission, without specific constraints
        await navigator.mediaDevices.getUserMedia({ video: true });
        console.log("Initial camera permission granted.");
    } catch (e) {
        console.error("Initial camera permission request failed:", e);
        alert("Kamera tilladelse blev ikke givet eller fejlede. Tjek telefonens indstillinger for Chrome/Webcam App."); 
        throw e; // Propagate the error so getCameras doesn't proceed
    }
}

async function getCameras() {
    await requestCameraPermission(); // Ensure permission is requested/granted first

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === "videoinput");
    cameraSelect.innerHTML = "";

    videoDevices.forEach((device, index) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        // Attempt to give more user-friendly labels
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
    } else if (videoDevices.length > 0) {
        // If no saved camera, try to select the back camera by default if available
        const backCamera = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
        if (backCamera) {
            cameraSelect.value = backCamera.deviceId;
        } else {
            // Otherwise, just select the first available camera
            cameraSelect.value = videoDevices[0].deviceId;
        }
    }
}
getCameras();
cameraSelect.addEventListener("change", saveConfig);

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
// forsøg 1 start
// --- Start AF Forsøg 1: startCamera funktion ---
async function startCamera() {
    console.log("Attempting to start camera...");
    statusText.textContent = "🟡 Starter kamera...";

    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }

    // Vi henter opløsningsindstillingerne fra dropdown (disse er med 'ideal' fra getResolutionSettings)
    const resolutionConstraintsFromDropdown = getResolutionSettings(); 
    const selectedDeviceId = cameraSelect.value;
    const selectedDeviceLabel = cameraSelect.options[cameraSelect.selectedIndex]?.textContent.toLowerCase();

    let videoConstraints = {
        audio: false, // Ingen lyd
        video: {}     // Tomt videoobjekt til at starte med
    };

    if (selectedDeviceLabel.includes('front')) {
        // For frontkameraet: brug 'user' facingMode og den valgte opløsning
        videoConstraints.video.facingMode = 'user';
        Object.assign(videoConstraints.video, resolutionConstraintsFromDropdown);
    } else if (selectedDeviceLabel.includes('back') || selectedDeviceLabel.includes('miljø') || selectedDeviceLabel.includes('environment')) {
        // For bagkameraet:
        // 1. Prioriter 'environment' facingMode
        videoConstraints.video.facingMode = 'environment';
        // 2. Hårdkod en SPECIFIK, LAV og ALMINDELIG exact opløsning
        //    Dette er for at teste, om en "exact" match med en kendt lav opløsning virker
        Object.assign(videoConstraints.video, { width: { exact: 640 }, height: { exact: 480 } });
        console.warn("Using specific EXACT 640x480 for back camera to test compatibility.");
    } else if (selectedDeviceId) {
        // Fallback til deviceId, hvis facingMode ikke er tydelig ud fra labelen
        videoConstraints.video.deviceId = { exact: selectedDeviceId }; 
        Object.assign(videoConstraints.video, resolutionConstraintsFromDropdown);
    } else {
        // Hvis intet specifikt kamera er valgt, eller ingen labels matcher - lad browseren vælge
        videoConstraints.video = true; // bare anmod om en videostrøm uden specifikke krav
    }
    
    // Log de endelige constraints, der sendes til getUserMedia
    console.log("Using video constraints:", videoConstraints.video);

    try {
        stream = await navigator.mediaDevices.getUserMedia(videoConstraints);

        console.log("Camera stream obtained successfully.");
        statusText.textContent = "🟢 Kamera startet, forbinder...";

        video.srcObject = stream;
        video.play();

        const settings = stream.getVideoTracks()[0].getSettings();
        canvas.width = settings.width;
        canvas.height = settings.height;
        // Log den faktiske opløsning, der blev brugt
        console.log(`Actual camera resolution: ${settings.width}x${settings.height}`);


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
            userMessage = `De specificerede videokrav (opløsning, framerate eller kamera-valg) kunne ikke opfyldes af dit kamera. Prøv at vælge en **lavere opløsning, eller lad opløsningen være standard for bagkameraet** (ved at fjerne opløsningsvalget for bagkameraet i appen). Fejldetaljer: ${error.message || 'Ukendt'}. (Fejlkode: OverconstrainedError, Constraint: ${error.constraint || 'Ukendt'})`;
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
// --- Slut AF Forsøg 1: startCamera funktion ---
// forsøg 1 slut

/* forsøg 2 start
// --- Start AF Forsøg 2: startCamera funktion ---
async function startCamera() {
    console.log("Attempting to start camera...");
    statusText.textContent = "🟡 Starter kamera...";

    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }

    // Henter opløsningsindstillingerne fra dropdown (disse er med 'ideal' fra getResolutionSettings)
    const resolutionConstraintsFromDropdown = getResolutionSettings(); 
    const selectedDeviceId = cameraSelect.value;
    // const selectedDeviceLabel = cameraSelect.options[cameraSelect.selectedIndex]?.textContent.toLowerCase(); // <-- Ikke nødvendig for dette forsøg

    let videoConstraints = {
        audio: false,
        video: {}
    };

    // --- VIGTIG ÆNDRING TIL BAGKAMERAET ---
    // FJERN facingMode og brug KUN deviceId for ALLE kameravalg
    if (selectedDeviceId) { // Vi bruger deviceId for ALT nu, inkl. front/bag
        videoConstraints.video.deviceId = { exact: selectedDeviceId }; 
        // Tilføj opløsning fra dropdown (som bruger 'ideal')
        Object.assign(videoConstraints.video, resolutionConstraintsFromDropdown); 
        // Hvis du vil kombinere med HARDKODET EXACT 640x480 som i Forsøg 1,
        // ville du erstatte linjen ovenfor med:
        // Object.assign(videoConstraints.video, { width: { exact: 640 }, height: { exact: 480 } });
    } else {
        // Fallback hvis ingen deviceId er valgt
        videoConstraints.video = true;
    }
    // --- SLUT VIGTIG ÆNDRING ---
    
    // Log de endelige constraints, der sendes til getUserMedia
    console.log("Using video constraints:", videoConstraints.video);

    try {
        stream = await navigator.mediaDevices.getUserMedia(videoConstraints);

        console.log("Camera stream obtained successfully.");
        statusText.textContent = "🟢 Kamera startet, forbinder...";

        video.srcObject = stream;
        video.play();

        const settings = stream.getVideoTracks()[0].getSettings();
        canvas.width = settings.width;
        canvas.height = settings.height;
        // Log den faktiske opløsning, der blev brugt
        console.log(`Actual camera resolution: ${settings.width}x${settings.height}`);


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
            userMessage = `De specificerede videokrav (opløsning, framerate eller kamera-valg) kunne ikke opfyldes af dit kamera. Prøv at vælge en **lavere opløsning, eller lad opløsningen være standard for bagkameraet** (ved at fjerne opløsningsvalget for bagkameraet i appen). Fejldetaljer: ${error.message || 'Ukendt'}. (Fejlkode: OverconstrainedError, Constraint: ${error.constraint || 'Ukendt'})`;
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
// --- Slut AF Forsøg 2: startCamera funktion ---
*/
// forsøg 2 slut
/*
async function startCamera() {
    console.log("Attempting to start camera...");
    statusText.textContent = "🟡 Starter kamera..."; // Update status text

    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null; // Clear previous stream if it exists
    }

    const resolutionConstraints = getResolutionSettings();
    const selectedDeviceId = cameraSelect.value;
    const selectedDeviceLabel = cameraSelect.options[cameraSelect.selectedIndex]?.textContent.toLowerCase();

    let videoConstraints = {
        audio: false,
        video: { ...resolutionConstraints }
    };

    // Prioritize facingMode if label hints at front/back, it's more reliable than deviceId sometimes
    if (selectedDeviceLabel.includes('front')) {
        videoConstraints.video.facingMode = 'user';
    } else if (selectedDeviceLabel.includes('back') || selectedDeviceLabel.includes('miljø')) { // 'miljø' for environment in Danish
        videoConstraints.video.facingMode = 'environment';
    } else if (selectedDeviceId) {
        // Fallback to deviceId if facingMode doesn't apply or is less reliable
        // Use 'exact' only if facingMode fails, or if we have a specific ID.
        // For robustness, sometimes 'ideal' for deviceId is better than 'exact'.
        // Let's try 'exact' first, if issues persist, change to 'ideal'.
        videoConstraints.video.deviceId = { exact: selectedDeviceId }; 
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia(videoConstraints);

        console.log("Camera stream obtained successfully.");
        statusText.textContent = "🟢 Kamera startet, forbinder..."; // Update status

        video.srcObject = stream;
        video.play();

        const settings = stream.getVideoTracks()[0].getSettings();
        canvas.width = settings.width;
        canvas.height = settings.height;

        video.style.display = "none";
        canvas.style.display = "block";

        startSendingFrames();

    } catch (error) {
        console.error("Error starting camera:", error);
        let userMessage = "Kunne ikke starte videokilde.";

        if (error.name === 'NotReadableError') {
            userMessage = "Kameraet er sandsynligvis i brug af en anden app, eller der er en midlertidig hardwarefejl. Prøv at **genstarte telefonen, lukke alle andre apps** (især dem der bruger kameraet), og sikre at intet andet bruger kameraet.";
        } else if (error.name === 'NotAllowedError') {
            userMessage = "Adgang til kameraet blev nægtet. Du skal give adgang i telefonens indstillinger (Indstillinger -> Apps -> Chrome/Webcam App -> Tilladelser -> Kamera).";
        } else if (error.name === 'NotFoundError') {
            userMessage = "Ingen passende kameraer fundet på denne enhed. Sørg for, at din telefon har et fungerende kamera.";
        } else if (error.name === 'OverconstrainedError') {
            // THIS IS THE MOST LIKELY ERROR FOR BACK CAMERA ISSUES IF IT'S NOT A NotReadableError
            userMessage = `De specificerede videokrav (opløsning, framerate eller kamera-valg) kunne ikke opfyldes af dit kamera. Prøv en lavere opløsning eller framerate, eller vælg et andet kamera. Fejldetaljer: ${error.message || 'Ukendt'}`;
            console.warn("OverconstrainedError details:", error.constraint, error.message);
        } else if (error.name === 'SecurityError') {
            userMessage = "En sikkerhedsfejl forhindrede adgang til kameraet. Sørg for at tilgå siden via **HTTPS** (f.eks. din GitHub Pages URL).";
        } else if (error.name === 'AbortError') {
            userMessage = "Adgangen til kameraet blev afbrudt. Prøv at starte igen.";
        } else {
            userMessage = "En ukendt fejl opstod ved start af kameraet.";
        }

        alert("FEJL ved start af kamera: " + userMessage);
        statusText.textContent = "🔴 Kamerastart fejlede";
    }
}
*/
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
