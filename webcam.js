// webcam.js - Optimized zoom and internationalized comments/strings
/*
This file is part of Webcam App - Made by:
Copyright (C) 2025 Rikard Svenningsen

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
// DOM Elementer
const ipInput = document.getElementById("ipInput");
const portInput = document.getElementById("portInput");
const cameraSelect = document.getElementById("cameraSelect");
const resolutionSelect = document.getElementById("resolutionSelect");
const fpsSelect = document.getElementById("fpsSelect");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const statusText = document.getElementById("status");
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const zoomInButton = document.getElementById("zoomIn");
const zoomOutButton = document.getElementById("zoomOut");
const resetZoomButton = document.getElementById("resetZoom");
const currentZoomDisplay = document.getElementById("currentZoomDisplay");

// Globale variabler
let stream = null; // Stream fra kameraet
let ws = null;     // WebSocket forbindelse
let mediaRecorder = null; // MediaRecorder instance
let appVersion = "V. 0.1.0.0"; // App version
let wakeLock = null; // Skærmlås
let currentZoomLevel = 1.0; // Aktuel zoomniveau
const ZOOM_STEP = 1; // Hvor meget zoom ændres pr. klik
const MAX_ZOOM = 8.0; // Maksimum digital zoom
const MIN_ZOOM = 1.0; // Minimum digital zoom

// Overlays data (dynamiske informationer)
let overlayData = {
    resolution: "",
    fps: "",
    battery: "N/A",
    device: "N/A"
};

// --- Initialisering og Hændelseslyttere ---
document.addEventListener("DOMContentLoaded", async () => {
    loadConfig();
    await populateCameraList();
    updateButtonStates();
    updateOverlayInfo(); // Initial opdatering af overlays

    startButton.addEventListener("click", startCamera);
    stopButton.addEventListener("click", stopCamera);
    zoomInButton.addEventListener("click", () => adjustZoom(ZOOM_STEP));
    zoomOutButton.addEventListener("click", () => adjustZoom(-ZOOM_STEP));
    resetZoomButton.addEventListener("click", () => setZoomLevel(1.0));

    // Lyt til ændringer i opløsning og FPS for at genstarte streamen
    resolutionSelect.addEventListener("change", () => {
        saveConfig();
        if (stream) {
            stopCamera();
            startCamera();
        }
    });
    fpsSelect.addEventListener("change", () => {
        saveConfig();
        if (stream) {
            stopCamera();
            startCamera();
        }
    });

    // Få batteristatus
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            overlayData.battery = `${(battery.level * 100).toFixed(0)}%`;
            battery.addEventListener('levelchange', () => {
                overlayData.battery = `${(battery.level * 100).toFixed(0)}%`;
            });
        });
    }

    // Få enhedsinformation (baseret på user agent, simpelt)
    overlayData.device = navigator.userAgent.match(/\(([^)]+)\)/)?.[1] || "Ukendt Enhed";
    if (overlayData.device.length > 25) { // Tronker længere strings
        overlayData.device = overlayData.device.substring(0, 22) + "...";
    }
});

// --- Hjælpefunktioner ---
function saveConfig() {
    localStorage.setItem("streamServerIp", ipInput.value);
    localStorage.setItem("streamServerPort", portInput.value);
    localStorage.setItem("selectedCameraId", cameraSelect.value);
    localStorage.setItem("selectedResolution", resolutionSelect.value);
    localStorage.setItem("selectedFps", fpsSelect.value);
    localStorage.setItem("currentZoomLevel", currentZoomLevel);
}

function loadConfig() {
    ipInput.value = localStorage.getItem("streamServerIp") || "192.168.1.100";
    portInput.value = localStorage.getItem("streamServerPort") || "8181";
    resolutionSelect.value = localStorage.getItem("selectedResolution") || "hd";
    fpsSelect.value = localStorage.getItem("selectedFps") || "10";
    currentZoomLevel = parseFloat(localStorage.getItem("currentZoomLevel")) || 1.0;
    currentZoomDisplay.textContent = `Zoom: x${currentZoomLevel.toFixed(1)}`;
}

function updateButtonStates() {
    startButton.disabled = stream !== null;
    stopButton.disabled = stream === null;
}

function updateOverlayInfo() {
    const selectedRes = getResolutionSettings();
    overlayData.resolution = `${selectedRes.width}x${selectedRes.height}`;
    overlayData.fps = `${fpsSelect.value} FPS`;
    currentZoomDisplay.textContent = `Zoom: x${currentZoomLevel.toFixed(1)}`;
}

function getResolutionSettings() {
    const res = resolutionSelect.value;
    switch (res) {
        case "vga": return { width: 640, height: 480 };
        case "hd": return { width: 1280, height: 720 };
        case "fhd": return { width: 1920, height: 1080 };
        default: return { width: 1280, height: 720 }; // Default to HD
    }
}

async function populateCameraList() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        if (videoDevices.length === 0) {
            alert("Ingen kameraer fundet.");
            return;
        }

        cameraSelect.innerHTML = ''; // Ryd eksisterende valgmuligheder
        videoDevices.forEach(device => {
            const option = document.createElement("option");
            option.value = device.deviceId;
            option.textContent = device.label || `Kamera ${device.deviceId.substring(0, 8)}`;
            cameraSelect.appendChild(option);
        });

        const savedCameraId = localStorage.getItem("selectedCameraId");
        if (savedCameraId && Array.from(cameraSelect.options).some(option => option.value === savedCameraId)) {
            cameraSelect.value = savedCameraId;
        } else if (videoDevices.length > 0) {
            // Prøv at vælge et bagkamera som standard, hvis muligt
            const backCamera = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
            if (backCamera) {
                cameraSelect.value = backCamera.deviceId;
            } else {
                cameraSelect.value = videoDevices[0].deviceId;
            }
        }
    } catch (error) {
        console.error("Fejl ved hentning af kameraliste:", error);
        alert("Fejl ved adgang til kameraer. Sørg for at give tilladelse.");
    }
}

// --- Zoom Funktioner ---
function adjustZoom(step) {
    let newZoomLevel = currentZoomLevel + step;
    newZoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));
    setZoomLevel(parseFloat(newZoomLevel.toFixed(1))); // Afrund til én decimal
}

function setZoomLevel(level) {
    if (currentZoomLevel === level) return; // Ingen ændring

    currentZoomLevel = level;
    saveConfig();
    updateOverlayInfo(); // Opdater visning med det samme

    // Genstart kameraet med nye constraints, hvis streamen kører
    // Dette er nødvendigt, da den ideelle input-opløsning afhænger af zoom-niveauet.
    if (stream) {
        stopCamera();
        startCamera();
    }
}

// --- Kamera og Streaming Funktioner ---
async function startCamera() {
    console.log("Forsøger at starte kamera...");
    statusText.textContent = "🟡 Starter kamera...";

    if (stream) { // Stop eksisterende stream, hvis den kører
        stopCamera();
    }

    const selectedDeviceId = cameraSelect.value;
    if (!selectedDeviceId) {
        alert("FEJL: Intet kamera valgt i dropdown. Prøv at genindlæse siden, eller giv kameratilladelser.");
        statusText.textContent = "🔴 Kamerastart mislykkedes: Intet kamera valgt";
        console.error("Intet kamera valgt for startCamera.");
        return;
    }

    const selectedDeviceLabel = cameraSelect.options[cameraSelect.selectedIndex]?.textContent.toLowerCase();
    const fps = parseInt(fpsSelect.value, 10);
    const selectedOutputResolution = getResolutionSettings(); // Dette er din *output* opløsning (f.eks. 1280x720)

    // === Beregn den dynamisk nødvendige input-opløsning fra kameraet ===
    // Dette er den *mindste* ideelle opløsning, vi anmoder kameraet om
    // for at understøtte den valgte output-opløsning ved den aktuelle zoom-faktor.
    let requiredInputWidth = selectedOutputResolution.width * currentZoomLevel;
    let requiredInputHeight = selectedOutputResolution.height * currentZoomLevel;

    // === Sikkerhedsforanstaltning: Sæt et realistisk øvre loft for anmodet opløsning ===
    // Dette forhindrer os i at anmode om *ekstremt* høje ideal-værdier,
    // som ingen kameraer realistisk kan levere. Juster disse værdier baseret på forventet hardware.
    const ABSOLUTE_MAX_CAMERA_WIDTH = 4096; // F.eks. 4K
    const ABSOLUTE_MAX_CAMERA_HEIGHT = 2160; // F.eks. 4K

    let idealCameraInputWidth = Math.min(requiredInputWidth, ABSOLUTE_MAX_CAMERA_WIDTH);
    let idealCameraInputHeight = Math.min(requiredInputHeight, ABSOLUTE_MAX_CAMERA_HEIGHT);

    console.log(`Beregner ideel kamera-input for ${selectedOutputResolution.width}x${selectedOutputResolution.height} output ved zoom x${currentZoomLevel}: Anmoder om ideal ${idealCameraInputWidth}x${idealCameraInputHeight}`);

    let videoConstraints = {
        audio: false,
        video: {
            deviceId: { exact: selectedDeviceId },
            frameRate: { ideal: fps },
            width: { ideal: idealCameraInputWidth },
            height: { ideal: idealCameraInputHeight }
        }
    };

    // FacingMode foran/bagud
    if (selectedDeviceLabel.includes('front')) {
        videoConstraints.video.facingMode = 'user';
    } else if (selectedDeviceLabel.includes('back') || selectedDeviceLabel.includes('environment')) {
        videoConstraints.video.facingMode = 'environment';
    }

    try {
        // Få stream direkte fra kameraet
        stream = await navigator.mediaDevices.getUserMedia(videoConstraints);

        console.log("Kamerastrøm opnået med succes.");
        statusText.textContent = "🟢 Kamera startet, forbinder...";

        video.srcObject = stream; // Sæt kamerastrømmen til det (skjulte) video-element
        await video.play(); // Sørg for at videoen spiller, så vi kan tegne fra den

        const actualVideoSettings = stream.getVideoTracks()[0].getSettings();
        console.log(`Faktisk kamera INPUT opløsning: ${actualVideoSettings.width}x${actualVideoSettings.height}, Faktisk FPS: ${actualVideoSettings.frameRate}`);

        // Konfigurer canvas til output-opløsningen
        canvas.width = selectedOutputResolution.width;
        canvas.height = selectedOutputResolution.height;
        console.log(`Canvas OUTPUT opløsning (til stream): ${canvas.width}x${canvas.height}`);

        updateButtonStates();
        startSendingVideoFrames(); // Ny funktion til at starte streaming via MediaRecorder
        requestWakeLock();

    } catch (error) {
        console.error("Fejl ved start af kamera:", error);
        let userMessage = "Kunne ikke starte videokilden.";

        // Generelle fejl, der forhindrer streamen i at starte
        if (error.name === 'NotReadableError') {
            userMessage = "Kameraet er sandsynligvis i brug af en anden app, eller der er en midlertidig hardwarefejl. Prøv at **genstarte telefonen, lukke alle andre apps** (især dem, der bruger kameraet), og sørg for, at intet andet bruger kameraet. (Fejlkode: NotReadableError)";
        } else if (error.name === 'NotAllowedError') {
            userMessage = "Kameratilladelse blev nægtet. Du skal give adgang i telefonens indstillinger (Indstillinger -> Apps -> Chrome/Webcam App -> Tilladelser -> Kamera). (Fejlkode: NotAllowedError)";
        } else if (error.name === 'NotFoundError') {
            userMessage = "Ingen passende kameraer fundet på denne enhed. Sørg for, at din telefon har et fungerende kamera. (Fejlkode: NotFoundError)";
        } else if (error.name === 'SecurityError') {
            userMessage = "En sikkerhedsfejl forhindrede kameraadgang. Sørg for, at du tilgår siden via **HTTPS** (f.eks. din GitHub Pages URL). (Fejlkode: SecurityError)";
        } else if (error.name === 'AbortError') {
            userMessage = "Kameratilgang blev afbrudt. Prøv at starte igen. (Fejlkode: AbortError)";
        }
        // OverconstrainedError håndteres ikke eksplicit med en alert her.
        // getUserMedia vil blot falde tilbage til den bedst mulige opløsning.
        else {
            userMessage = "En ukendt fejl opstod under start af kameraet. (Fejlkode: " + error.name + ")";
        }

        alert("FEJL ved start af kamera: " + userMessage);
        statusText.textContent = "🔴 Kamerastart mislykkedes";
        updateButtonStates();
    }
}

async function startSendingVideoFrames() {
    const ip = ipInput.value;
    const port = portInput.value;
    if (!ip || !port) {
        alert("Indtast venligst server IP og port først.");
        stopCamera();
        return;
    }

    const fps = parseInt(fpsSelect.value, 10);
    // Interval for MediaRecorder data (hvor ofte blobs skal sendes)
    // En mindre værdi (f.eks. 500ms eller 1000ms) kan give jævnere streaming,
    // men hyppigere WebSocket-beskeder. Juster efter behov.
    // Her sender vi en blob for hver frame, hvis muligt.
    const mediaRecorderDataInterval = 1000 / fps; 

    ws = new WebSocket(`wss://${ip}:${port}`);

    ws.onopen = () => {
        if (!wakeLock) {
            statusText.textContent = "🔵 Streaming startet";
        }
        
        // Lav en MediaStream fra canvas'et
        // Dette fanger indholdet af canvas'et som en videostrøm
        const canvasStream = canvas.captureStream(fps); // FPS for den stream, vi fanger fra canvas

        try {
            // Prøv at bruge en WebM-container med VP8/VP9 codec for god komprimering
            // Tjek understøttede codecs i browseren: MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm;codecs=vp8' });
        } catch (e) {
            console.error('Kunne ikke oprette MediaRecorder med specifik mimeType. Prøver standard.', e);
            try {
                mediaRecorder = new MediaRecorder(canvasStream); // Forsøg med standard-type
            } catch (e2) {
                console.error('Kunne ikke oprette MediaRecorder overhovedet.', e2);
                alert("FEJL: Din browser understøtter ikke MediaStream Recording API'et til videostreaming, eller der er en anden fejl.");
                stopCamera(); // Stop det hele, hvis vi ikke kan streame
                return;
            }
        }

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                ws.send(event.data); // Send video blob'en
            }
        };

        mediaRecorder.onstop = () => {
            console.log("MediaRecorder stopped.");
        };
        mediaRecorder.onerror = (event) => {
            console.error("MediaRecorder Fejl:", event.error);
            alert("FEJL: Problemer med videooptageren. Genstart streamen.");
            stopCamera();
        };

        // Start MediaRecorder
        mediaRecorder.start(mediaRecorderDataInterval);

        // Start tegning til canvas i en requestAnimationFrame loop
        // Dette er den loop, der håndterer digital zoom og overlays.
        drawFrame();

    };

    ws.onerror = (error) => {
        console.error("WebSocket Fejl:", error);
        statusText.textContent = "🔴 Kunne ikke forbinde til server";
        alert("FEJL: Kunne ikke forbinde til streamingserveren. Tjek IP/Port, firewall og serverstatus.");
        stopCamera();
    };

    ws.onclose = () => {
        statusText.textContent = "⚪ Streaming stoppet";
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        // Nulstil tegne-loop
        cancelAnimationFrame(animationFrameId);
        releaseWakeLock(); // Release wake lock when stopping the camera
        updateButtonStates();
    };
}

let animationFrameId; // Til at styre requestAnimationFrame loopet

function drawFrame() {
    if (!video.srcObject || video.paused || video.ended) {
        cancelAnimationFrame(animationFrameId);
        return;
    }

    // Få den faktiske opløsning, som kameraet leverer
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Beregn beskæringsområdet baseret på aktuel zoom
    const cropWidth = videoWidth / currentZoomLevel;
    const cropHeight = videoHeight / currentZoomLevel;
    const cropX = (videoWidth - cropWidth) / 2;
    const cropY = (videoHeight - cropHeight) / 2;

    // Ryd canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Tegn den zoomede og beskårne videoramme til canvas
    ctx.drawImage(
        video,
        cropX, cropY, cropWidth, cropHeight, // Kilde (beskåret) rektangel fra video-element
        0, 0, canvas.width, canvas.height    // Destination (hele canvas-området)
    );

    // === Tegn Overlays ===
    ctx.font = "bold 20px Arial";
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const currentFps = fpsSelect.value;
    const currentResolution = `${canvas.width}x${canvas.height}`;

    // Info for overlay
    const overlayLines = [
        `App: ${appVersion}`,
        `Server: ${ipInput.value}:${portInput.value}`,
        `Output: ${currentResolution} @ ${currentFps} FPS`,
        `Zoom: x${currentZoomLevel.toFixed(1)}`,
        `Batt: ${overlayData.battery}`,
        `Dev: ${overlayData.device}`
    ];

    let yOffset = 10;
    for (const line of overlayLines) {
        ctx.strokeText(line, 10, yOffset); // Sort omrids
        ctx.fillText(line, 10, yOffset);   // Hvid tekst
        yOffset += 25; // Linjehøjde
    }

    // Fortsæt tegne-loop
    animationFrameId = requestAnimationFrame(drawFrame);
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
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    mediaRecorder = null;
    // Vigtigt: Stop requestAnimationFrame loopet
    cancelAnimationFrame(animationFrameId); 
    releaseWakeLock();
    statusText.textContent = "⚪ Streaming stoppet";
    updateButtonStates();
}


// --- Wake Lock API for at holde skærmen tændt ---
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen Wake Lock er aktiv!');
        } catch (err) {
            console.error('Kunne ikke aktivere Screen Wake Lock:', err);
        }
    } else {
        console.warn('Wake Lock API understøttes ikke i denne browser.');
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release()
            .then(() => {
                console.log('Screen Wake Lock er frigivet.');
                wakeLock = null;
            })
            .catch((err) => {
                console.error('Fejl ved frigivelse af Screen Wake Lock:', err);
            });
    }
}
