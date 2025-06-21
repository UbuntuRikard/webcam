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
// Ny DOM element for skærmkontrol
const toggleScreenLockButton = document.getElementById("toggleScreenLockButton");
// Nye DOM elementer for de individuelle ikoner inde i skærmlås knappen
const screenOnIcon = toggleScreenLockButton ? toggleScreenLockButton.querySelector('.fa-tv') : null;
const screenOffIcon = toggleScreenLockButton ? toggleScreenLockButton.querySelector('.fa-power-off') : null;


// Globale variabler
let stream = null; // Stream fra kameraet
let ws = null;    // WebSocket forbindelse
let mediaRecorder = null; // MediaRecorder instance
let wakeLock = null; // Skærmlås (actual wake lock object)
let currentZoomLevel = 1.0; // Aktuel zoomniveau
const ZOOM_STEP = 1; // Hvor much zoom ændres pr. klik
const MAX_ZOOM = 8.0; // Maksimum digital zoom
const MIN_ZOOM = 1.0; // Minimum digital zoom

// --- KONFIGURATIONSVÆRDIER ---
const VIDEO_BITRATE_BPS = 2_000_000; // 2 Megabit per sekund

// Overlays data (dynamiske informationer)
let overlayData = {
    resolution: "",
    fps: "",
    battery: "N/A",
    device: "N/A"
};

// --- Nye globale variabler for avanceret logning ---
let lastLoggedBatteryLevel = null; // Gemmer det sidste batteriniveau, der blev logget (float 0.0-1.0)
let appStatus = 'Idle'; // Appens status: 'Idle', 'Streaming', 'Disconnected'
let batteryManager = null; // Vil holde BatteryManager objektet
const LOG_BATTERY_DEVIATION_PERCENT = 1; // Log ved mindst 1% ændring i batteriniveau
let APP_VERSION = "Ukendt Version"; // Appens version, vil blive opdateret fra manifest.json

// Array til at gemme alle log-entries i hukommelsen
let appLogs = [];

// Ny global variabel for brugerpræference for skærmlås
let userPrefersScreenAlwaysOn = true; // Standard: Skærmen holdes tændt


// --- Hjælpefunktioner ---

// Funktion til at hente app-versionen fra manifest.json
async function getAppVersionFromManifest() {
    try {
        // STI KORREKTION: Brug relativ sti til manifest.json
        const response = await fetch('manifest.json'); 
        if (response.ok) {
            const manifest = await response.json();
            if (manifest.version) {
                APP_VERSION = `V. ${manifest.version}`; // Sæt den globale APP_VERSION variabel
                console.log("App version fra manifest:", APP_VERSION);
            }
        }
    } catch (e) {
        console.error('Fejl ved hentning af app version fra manifest.json:', e);
    }
}

function saveConfig() {
    localStorage.setItem("streamServerIp", ipInput.value);
    localStorage.setItem("streamServerPort", portInput.value);
    localStorage.setItem("selectedCameraId", cameraSelect.value);
    localStorage.setItem("selectedResolution", resolutionSelect.value);
    localStorage.setItem("selectedFps", fpsSelect.value);
    localStorage.setItem("currentZoomLevel", currentZoomLevel);
    // Gem ny præference for skærmlås
    localStorage.setItem("userPrefersScreenAlwaysOn", userPrefersScreenAlwaysOn);
}

function loadConfig() {
    ipInput.value = localStorage.getItem("streamServerIp") || "192.168.1.100";
    portInput.value = localStorage.getItem("streamServerPort") || "8181";
    resolutionSelect.value = localStorage.getItem("selectedResolution") || "hd";
    fpsSelect.value = localStorage.getItem("selectedFps") || "10";
    currentZoomLevel = parseFloat(localStorage.getItem("currentZoomLevel")) || 1.0;
    currentZoomDisplay.textContent = `Zoom: x${currentZoomLevel.toFixed(1)}`;
    // Indlæs ny præference for skærmlås
    const storedScreenPref = localStorage.getItem("userPrefersScreenAlwaysOn");
    userPrefersScreenAlwaysOn = (storedScreenPref === "false") ? false : true; // "true" hvis ikke fundet eller "true"
}

function updateButtonStates() {
    startButton.disabled = stream !== null;
    stopButton.disabled = stream === null;
}

function updateOverlayInfo() {
    const selectedRes = getResolutionSettings();
    overlayData.resolution = `${selectedRes.width}x${selectedRes.height}`;
    overlayData.fps = `${fpsSelect.value} FPS`;
    currentZoomDisplay.textContent = `x${currentZoomLevel.toFixed(1)}`;
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

        cameraSelect.innerHTML = ''; 
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
    setZoomLevel(parseFloat(newZoomLevel.toFixed(1))); 
}

function setZoomLevel(level) {
    if (currentZoomLevel === level) return; 

    currentZoomLevel = level;
    saveConfig();
    updateOverlayInfo(); 

    if (stream) {
        stopCamera();
        startCamera();
    }
}

// --- Avanceret Logning & Batteriovervågning Funktioner ---

async function logAppState(reason = "App status tjek") {
    if (!batteryManager) {
        console.warn("Logning: Battery Status API er ikke tilgængelig eller ikke klar. Kan ikke logge batteriniveau.");
        return;
    }

    const currentBatteryLevel = batteryManager.level; 
    const currentBatteryPercent = Math.round(currentBatteryLevel * 100); 

    const lastLoggedPercent = lastLoggedBatteryLevel !== null ? Math.round(lastLoggedBatteryLevel * 100) : null;
    
    if (lastLoggedPercent === null || Math.abs(currentBatteryPercent - lastLoggedPercent) >= LOG_BATTERY_DEVIATION_PERCENT) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            version: APP_VERSION,
            temperature: "Ikke tilgængelig via Web API", 
            appStatus: appStatus,
            batteryPercent: currentBatteryPercent,
            batteryIsCharging: batteryManager.charging,
            reason: reason 
        };
        appLogs.push(logEntry); 
        lastLoggedBatteryLevel = currentBatteryLevel; 
        saveAppLogs(); 
        console.log("Log gemt til localStorage:", logEntry.reason); 
    }
}

function loadAppLogs() {
    try {
        const storedLogs = localStorage.getItem('webcamAppLogs');
        if (storedLogs) {
            appLogs = JSON.parse(storedLogs);
            if (appLogs.length > 0) {
                lastLoggedBatteryLevel = appLogs[appLogs.length - 1].batteryPercent / 100;
            }
            console.log("Logning: Indlæste tidligere logs.", appLogs.length, "entries.");
        }
    } catch (e) {
        console.error("Logning: Fejl ved indlæsning af logs fra localStorage:", e);
        appLogs = []; 
    }
}

function saveAppLogs() {
    try {
        localStorage.setItem('webcamAppLogs', JSON.stringify(appLogs));
    } catch (e) {
        console.error("Logning: Fejl ved gemning af logs til localStorage:", e);
    }
}

function downloadAppLogs() {
    if (appLogs.length === 0) {
        alert("Ingen logs at downloade.");
        return;
    }

    const headers = Object.keys(appLogs[0]);
    let csv = '\uFEFF' + headers.join(',') + '\n'; 

    appLogs.forEach(entry => {
        const row = headers.map(header => {
            let value = entry[header];
            if (value === null || typeof value === 'undefined') {
                value = '';
            } else {
                value = String(value);
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    value = '"' + value.replace(/"/g, '""') + '"'; 
                }
            }
            return value;
        });
        csv += row.join(',') + '\n'; 
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); 
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); 
    a.download = `webcam_app_logs_${timestamp}.csv`; 
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a); 
    URL.revokeObjectURL(url); 

    console.log("Logning: Logs downloaded as CSV.");
}

function clearAppLogs() {
    if (confirm("Er du sikker på, at du vil slette alle gemte app logs? Dette kan ikke fortrydes.")) {
        localStorage.removeItem('webcamAppLogs');
        appLogs = [];
        lastLoggedBatteryLevel = null; 
        console.log("Logning: Alle logs slettet fra localStorage.");
    }
}

// --- Wake Lock API for at holde skærmen tændt (modificeret) ---
async function requestWakeLock() {
    // Anmod kun om Wake Lock, hvis API'en er tilgængelig, OG brugeren ønsker skærmen tændt, OG låsen ikke allerede er aktiv
    if ('wakeLock' in navigator && userPrefersScreenAlwaysOn && !wakeLock) { 
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen Wake Lock er aktiv!');
            updateScreenLockButtonIcons(); // Opdater knap til ikoner
        } catch (err) {
            console.error('Kunne ikke aktivere Screen Wake Lock:', err);
            // Hvis anmodning mislykkes (f.eks. bruger nægter), opdater præference til at afspejle dette
            userPrefersScreenAlwaysOn = false; // Antag brugeren ikke ønsker den tændt, hvis den fejler
            saveConfig();
            updateScreenLockButtonIcons(); // Opdater knap til at vise "slukket" ikoner og evt. fejl
            alert('FEJL: Kunne ikke holde skærmen tændt. Browseren/enheden tillader det muligvis ikke eller brugeren nægtede.');
        }
    } else if (!userPrefersScreenAlwaysOn) {
        console.log('Wake Lock API: Anmodning skippet (brugerpræference er "Slukket").');
    } else if (wakeLock) {
        console.log('Wake Lock API: Lås er allerede aktiv.');
    } else {
        console.warn('Wake Lock API understøttes ikke i denne browser.');
        userPrefersScreenAlwaysOn = false; // Kan ikke holde skærmen tændt, hvis API ikke understøttes
        saveConfig();
        updateScreenLockButtonIcons(); // Opdater knap til "Slukket (Ikke understøttet)"
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release()
            .then(() => {
                console.log('Screen Wake Lock er frigivet.');
                wakeLock = null;
                // Opdater knapteksten, hvis brugerpræferencen er "Slukket"
                // Ellers forbliver den "Tændt", og Wake Lock anmodes ved næste stream start
                if (!userPrefersScreenAlwaysOn) { 
                   updateScreenLockButtonIcons(); // Sørg for den står som "Skærm: Slukket"
                }
            })
            .catch((err) => {
                console.error('Fejl ved frigivelse af Screen Wake Lock:', err);
            });
    }
}

// Ny funktion til at håndtere klik på skærmknappen
function handleScreenToggleButton() {
    userPrefersScreenAlwaysOn = !userPrefersScreenAlwaysOn; // Toggle præferencen
    saveConfig(); // Gem den nye præference

    updateScreenLockButtonIcons(); // Opdater knap ikoner øjeblikkeligt

    // Hvis streaming er aktiv, anvend den nye wake lock præference med det samme
    if (appStatus === 'Streaming') {
        if (userPrefersScreenAlwaysOn) {
            requestWakeLock(); // Anmod hvis brugeren nu foretrækker den tændt
        } else {
            releaseWakeLock(); // Frigør hvis brugeren nu foretrækker den slukket
        }
    }
    // Hvis ikke streaming, vil præferencen blive anvendt næste gang streaming starter
}

// Helper til at opdatere knapikonerne baseret på brugerpræference og Wake Lock status
function updateScreenLockButtonIcons() {
    if (screenOnIcon && screenOffIcon && toggleScreenLockButton) {
        if (!('wakeLock' in navigator)) {
            // Wake Lock ikke understøttet, vis kun slukket ikon (eller ingen, hvis det er designet sådan)
            screenOnIcon.style.display = 'none';
            screenOffIcon.style.display = 'inline-block';
            toggleScreenLockButton.title = "Skærmlås ikke understøttet"; // Tilføj tooltip
            toggleScreenLockButton.disabled = true; // Deaktiver knappen, da den ikke virker
        } else if (userPrefersScreenAlwaysOn) {
            // Bruger ønsker skærmen tændt
            screenOnIcon.style.display = 'inline-block';
            screenOffIcon.style.display = 'none';
            toggleScreenLockButton.title = "Skærm holdes tændt (klik for at slukke)";
            toggleScreenLockButton.disabled = false;
        } else {
            // Bruger ønsker skærmen slukket (Wake Lock frigivet)
            screenOnIcon.style.display = 'none';
            screenOffIcon.style.display = 'inline-block';
            toggleScreenLockButton.title = "Skærm kan slukke (klik for at holde tændt)";
            toggleScreenLockButton.disabled = false;
        }
    }
}


// --- Kamera og Streaming Funktioner ---
async function startCamera() {
    console.log("Forsøger at starte kamera...");
    statusText.textContent = "🟡 Starter kamera...";

    // --- LOGNING: Nulstil status inden start af kamera for at sikre korrekt logning ---
    appStatus = 'Idle'; 

    if (stream) { 
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
    const selectedOutputResolution = getResolutionSettings(); 

    let requiredInputWidth = selectedOutputResolution.width * currentZoomLevel;
    let requiredInputHeight = selectedOutputResolution.height * currentZoomLevel;

    const ABSOLUTE_MAX_CAMERA_WIDTH = 4096; 
    const ABSOLUTE_MAX_CAMERA_HEIGHT = 2160; 

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

    if (selectedDeviceLabel.includes('front')) {
        videoConstraints.video.facingMode = 'user';
    } else if (selectedDeviceLabel.includes('back') || selectedDeviceLabel.includes('environment')) {
        videoConstraints.video.facingMode = 'environment';
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia(videoConstraints);

        console.log("Kamerastrøm opnået med succes.");
        statusText.textContent = "🟢 Kamera startet, forbinder...";

        video.srcObject = stream; 
        await video.play(); 

        const actualVideoSettings = stream.getVideoTracks()[0].getSettings();
        console.log(`Faktisk kamera INPUT opløsning: ${actualVideoSettings.width}x${actualVideoSettings.height}, Faktisk FPS: ${actualVideoSettings.frameRate}`);

        canvas.width = selectedOutputResolution.width;
        canvas.height = selectedOutputResolution.height;
        console.log(`Canvas OUTPUT opløsning (til stream): ${canvas.width}x${canvas.height}`);

        updateButtonStates();
        startSendingVideoFrames(); 
        await requestWakeLock(); // Anmod om Wake Lock baseret på præference

        // --- LOGNING: Sæt status til 'Streaming' efter succesfuld start ---
        appStatus = 'Streaming';
        await logAppState("Stream startet"); 


    } catch (error) {
        console.error("Fejl ved start af kamera:", error);
        let userMessage = "Kunne ikke starte videokilden.";

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
        else {
            userMessage = "En ukendt fejl opstod under start af kameraet. (Fejlkode: " + error.name + ")";
        }

        alert("FEJL ved start af kamera: " + userMessage);
        statusText.textContent = "🔴 Kamerastart mislykkedes";
        updateButtonStates();
        // --- LOGNING: Forbliv i idle, hvis start fejler ---
        appStatus = 'Idle'; 
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
    const mediaRecorderDataInterval = 1000 / fps; 

    ws = new WebSocket(`wss://${ip}:${port}/ws`); 

    ws.onopen = () => {
        if (!wakeLock) {
            statusText.textContent = "🔵 Streaming startet";
        }
        
        const preferredMimeTypes = [
            'video/mp4;codecs=avc1', 
            'video/webm;codecs=vp8', 
            'video/webm;codecs=vp9'  
        ];

        let mimeTypeToUse = '';
        for (const type of preferredMimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                mimeTypeToUse = type;
                break;
            }
        }

        if (!mimeTypeToUse) {
            alert("FEJL: Din browser understøtter ingen af de foretrukne videoformater (H.264, VP8, VP9) for streaming.");
            stopCamera();
            return;
        }

        ws.send(JSON.stringify({ type: "init", mimeType: mimeTypeToUse }));
        console.log(`Sending init message to server with mimeType: ${mimeTypeToUse}`);


        const canvasStream = canvas.captureStream(fps); 

        try {
            mediaRecorder = new MediaRecorder(canvasStream, { 
                mimeType: mimeTypeToUse,
                bitsPerSecond: VIDEO_BITRATE_BPS 
            });
            console.log(`MediaRecorder oprettet med mimeType: ${mimeTypeToUse} og bitrate: ${VIDEO_BITRATE_BPS} bps`);
        } catch (e) {
            console.error('Kunne ikke oprette MediaRecorder med specificeret mimeType og bitrate.', e);
            alert("FEJL: Din browser understøtter ikke MediaStream Recording API'et til videostreaming med den valgte konfiguration, eller der er en anden fejl.");
            stopCamera(); 
            return;
        }

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                ws.send(event.data); 
            }
        };

        mediaRecorder.onstop = () => {
            console.log("MediaRecorder stopped.");
        };

        // --- LOGNING: Modificer mediaRecorder.onerror ---
        mediaRecorder.onerror = async (event) => {
            console.error("MediaRecorder Fejl:", event.error);
            alert("FEJL: Problemer med videooptageren. Genstart streamen.");
            
            if (appStatus === 'Streaming') {
                appStatus = 'Disconnected';
                await logAppState("Stream afbrudt uventet - MediaRecorder fejl");
            }
            stopCamera(); 
        };

        mediaRecorder.start(mediaRecorderDataInterval);

        drawFrame();

    };

    // --- LOGNING: Modificer ws.onerror ---
    ws.onerror = async (error) => {
        console.error("WebSocket Fejl:", error);
        statusText.textContent = "🔴 Kunne ikke forbinde til server";
        alert("FEJL: Kunne ikke forbinde til streamingserveren. Tjek IP/Port, firewall og serverstatus.");
        
        if (appStatus === 'Streaming') {
            appStatus = 'Disconnected';
            await logAppState("Stream afbrudt uventet - WebSocket fejl");
        }
        stopCamera(); 
    };

    // --- LOGNING: Modificer ws.onclose ---
    ws.onclose = async () => {
        statusText.textContent = "⚪ Streaming stoppet";
        
        if (appStatus === 'Streaming') { 
            appStatus = 'Disconnected';
            await logAppState("Stream afbrudt uventet - WebSocket lukket");
        }
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        mediaRecorder = null; 
        cancelAnimationFrame(animationFrameId);
        releaseWakeLock(); // Altid frigør Wake Lock, når WS lukker
        updateButtonStates();
    };
}

let animationFrameId; 

function drawFrame() {
    if (!video.srcObject || video.paused || video.ended) {
        cancelAnimationFrame(animationFrameId);
        return;
    }

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    const cropWidth = videoWidth / currentZoomLevel;
    const cropHeight = videoHeight / currentZoomLevel;
    const cropX = (videoWidth - cropWidth) / 2;
    const cropY = (videoHeight - cropHeight) / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(
        video,
        cropX, cropY, cropWidth, cropHeight, 
        0, 0, canvas.width, canvas.height  
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

    if (batteryManager) {
        overlayData.battery = `${(batteryManager.level * 100).toFixed(0)}% ${batteryManager.charging ? "(Lader)" : ""}`;
    }

    const overlayLines = [
        `App: ${APP_VERSION}`, 
        `Server: ${ipInput.value}:${portInput.value}`,
        `Output: ${currentResolution} @ ${currentFps} FPS`,
        `Zoom: x${currentZoomLevel.toFixed(1)}`,
        `Batt: ${overlayData.battery}`,
        `Dev: ${overlayData.device}`
    ];

    let yOffset = 10;
    for (const line of overlayLines) {
        ctx.strokeText(line, 10, yOffset); 
        ctx.fillText(line, 10, yOffset);  
        yOffset += 25; 
    }

    animationFrameId = requestAnimationFrame(drawFrame);
}


function stopCamera() {
    const wasStreaming = appStatus === 'Streaming'; 
    appStatus = 'Idle';
    if (wasStreaming) { 
        logAppState("Stream stoppet manuelt"); 
    }
    
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
    cancelAnimationFrame(animationFrameId); 
    releaseWakeLock(); // Altid frigør Wake Lock, når kameraet stoppes manuelt
    statusText.textContent = "⚪ Streaming stoppet";
    updateButtonStates();
}


// --- Initialisering og Hændelseslyttere ---
document.addEventListener("DOMContentLoaded", async () => {
    loadConfig();
    await populateCameraList();
    await getAppVersionFromManifest(); 
    updateButtonStates();
    updateOverlayInfo(); 

    // Sæt initial knapikoner for skærmlås
    updateScreenLockButtonIcons(); 

    // Opsæt event listeners
    startButton.addEventListener("click", startCamera);
    stopButton.addEventListener("click", stopCamera);
    zoomInButton.addEventListener("click", () => adjustZoom(ZOOM_STEP));
    zoomOutButton.addEventListener("click", () => adjustZoom(-ZOOM_STEP));
    resetZoomButton.addEventListener("click", () => setZoomLevel(1.0));
    // Ny event listener for skærmkontrolknappen
    toggleScreenLockButton.addEventListener("click", handleScreenToggleButton);


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

    // --- LOGNING: Initialisering af batteriovervågning og første log entry ---
    loadAppLogs(); 

    if ('getBattery' in navigator) {
        try {
            batteryManager = await navigator.getBattery();
            console.log("Logning: Battery Status API er tilgængelig.");

            await logAppState("App start (initial log)"); 

            batteryManager.addEventListener('levelchange', async () => {
                await logAppState("Batteriniveau ændret");
            });

            batteryManager.addEventListener('chargingchange', async () => {
                await logAppState("Ladestatus ændret");
            });

        } catch (e) {
            console.warn("Logning: Fejl ved adgang til Battery Status API:", e);
            batteryManager = null; 
        }
    } else {
        console.warn("Logning: Battery Status API understøttes ikke af denne browser.");
    }

    // --- Opsæt event listeners for log-knapperne ---
    const downloadLogsButton = document.getElementById('downloadLogsButton');
    if (downloadLogsButton) {
        downloadLogsButton.addEventListener('click', downloadAppLogs);
    }

    const clearLogsButton = document.getElementById('clearLogsButton');
    if (clearLogsButton) {
        clearLogsButton.addEventListener('click', clearAppLogs);
    }

    // Få enhedsinformation (baseret på user agent, simpelt) - Beholdes
    overlayData.device = navigator.userAgent.match(/\(([^)]+)\)/)?.[1] || "Ukendt Enhed";
    if (overlayData.device.length > 25) { 
        overlayData.device = overlayData.device.substring(0, 22) + "...";
    }
});
