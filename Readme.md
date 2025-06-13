# 📷 Webcam Streamer PWA

A simple, lightweight, and offline-capable **Progressive Web Application (PWA)** designed for streaming webcam footage from your Android device to a specified IP address and port. This project is ideal for local network streaming scenarios, security monitoring, or simply extending your device's camera feed to another screen by **repurposing older hardware**.

---

## ✨ Features

* **Live Webcam Streaming**: Streams your device's camera feed directly over a **secure WebSocket (WSS)** connection to a companion media server.
* **Configurable Resolution & FPS**: Choose between **VGA (640x480), HD (1280x720), and Full HD (1920x1080)** resolutions, and adjust frame rates (5, 10, 20 FPS) to balance quality and performance.
* **Advanced Digital Zoom**: Implement **digital zoom (x1 to x8)** by dynamically cropping the high-resolution camera input, allowing you to focus on specific areas without physically moving the device.
* **Customizable Server Connection**: Easily set the target **IP address and port** for your streaming server, and have these settings persist locally on your device.
* **On-Screen Overlay**: Displays critical information directly on the video feed, including:
    * Current Streaming Resolution
    * Target Server IP and Port
    * Device Battery Status
    * Application Version
    * Current Digital Zoom Level
* **Progressive Web App (PWA)**: Installable to your home screen for quick access and a full-screen, app-like experience.
* **Offline Capability**: Thanks to **Service Worker caching**, the PWA can be launched and used even without an active internet connection (after initial setup).
* **Seamless Updates**: The Service Worker intelligently updates cached assets when a new version is released, ensuring you always get the latest features and bug fixes.
* **Screen Wake Lock**: Prevents the device screen from turning off while the PWA is actively streaming in the foreground, ensuring an uninterrupted camera feed.
* **Open Source**: Released under the **GNU General Public License v3.0**, encouraging transparency and community contributions.

---

## 💡 How it Works: Connecting the Dots

This solution comprises three main components working in tandem to provide a robust video streaming and motion detection system:

1.  **The PWA Webcam App (Your Android Phone):**
    * Acts as the **camera source**. It accesses your phone's camera, captures frames, applies your chosen zoom, overlays real-time data, and then securely sends these JPEG images over a **WebSocket Secure (WSS)** connection.

2.  **The Custom Python Media Server (The Bridge):**
    * This is your **intermediary server**. It receives the secure JPEG frames from your PWA via WSS. Crucially, it then re-streams these frames as a standard **MJPEG (Motion JPEG) stream over HTTP**. This transformation is key, as MJPEG streams are widely compatible with traditional video surveillance software.

3.  **Motion Detection Server (e.g., Motion v4.3.2):**
    * This is typically a **dedicated server** (like a Raspberry Pi or Linux box) running software such as **`Motion`**. It connects to the MJPEG stream provided by your Python Media Server.
    * The Motion server then performs **intelligent motion detection**, records video clips (including pre-motion footage), and can trigger custom actions or notifications when motion is detected.

This architecture allows you to repurpose old phones as versatile IP cameras, with a clear separation of concerns for streaming and detection.

---

## 🚀 Getting Started

To get this project up and running, follow these steps:

### Prerequisites

* A web browser that supports WebRTC (for webcam access) and Service Workers (for PWA features). Modern Chrome on Android (even older versions like **Chrome M95 on Android 5.x**) is generally suitable.
* A companion Python-based media server (see below) or a compatible application listening for WebSocket connections at the specified IP and port to receive the video stream.
* (Optional) A motion detection server like `Motion` to process the MJPEG stream.

### Installation & Setup

1.  **Clone the Repository (or Download)**:
    ```bash
    git clone [https://github.com/UbuntuRikard/webcam.git](https://github.com/UbuntuRikard/webcam.git)
    cd webcam
    ```
    *(Replace `UbuntuRikard` with your actual GitHub username if you're cloning your own fork)*

2.  **Ensure PWA Assets are in Place**:
    * Verify that `index.html`, `style.css`, `webcam.js`, `manifest.json`, `sw.js`, and `offline.html` are in your project root (e.g., `webcam/`).
    * Create an `icons/` folder inside your project root and place your PWA icons (e.g., `icon-192x192.png`, `icon-512x512.png`) there. These are specified in `manifest.json`.

3.  **Host the Project**:
    * This project is designed to be hosted on GitHub Pages in a subdirectory (e.g., `yourusername.github.io/webcam/`). Ensure your GitHub Pages settings are configured to serve content from the appropriate branch/directory (e.g., `main` branch).
    * Alternatively, you can host it on any web server that serves static files.

### Usage

1.  **Access the PWA**: Open your browser on your Android phone and navigate to the hosted URL (e.g., `https://UbuntuRikard.github.io/webcam/`).
2.  **Grant Camera Permission**: The browser will prompt you to grant access to your camera. Allow this permission.
3.  **Configure Connection**:
    * Enter the **IP Address** of your WebSocket server (the Python Media Server).
    * Enter the **Port** your WebSocket server is listening on (default is `8181`).
    * Click the **Save** icon to store your connection settings locally.
4.  **Select Camera & Settings**:
    * Choose your desired webcam from the dropdown (front or rear).
    * Select the preferred streaming resolution and FPS.
    * Adjust the digital zoom level.
5.  **Start Streaming**: Click the **"Start"** button. The live video feed with overlay information will begin streaming to your configured server. The screen will stay awake while streaming.
6.  **Stop Streaming**: Click the **"Stop"** button to end the stream.

---

## 🖥️ Companion Media Server

This Webcam Streamer PWA is designed to send secure MJPEG video streams over WebSockets. To receive these streams and re-broadcast them in a widely compatible format (like MJPEG over HTTP) for other services (such as a motion detection server), you'll need a compatible media server.

A suitable Python-based media server, designed specifically for this purpose, is available. It acts as the crucial link between your PWA and a motion detection system like `Motion`.

You can find this companion media server here: **[https://github.com/UbuntuRikard/mediaserver](https://github.com/UbuntuRikard/mediaserver)**

---

## 🔒 License

This project is licensed under the **GNU General Public License v3.0**.

You can find the full license text in the `LICENSE` file in the root of this repository, or read it [here](https://www.gnu.org/licenses/gpl-3.0.en.html).

---

## 📝 Release Notes

This section documents significant changes and new features across different versions.

### 1.0.2.7 (2025-06-13)

* Added Zoom x1, x2, x3, x4, x5, x6, x7 and x8 with optimum picture.
* Added keep screen on functionality.

### 1.0.0.0 (2025-06-10)

* Initial Public Release as a Progressive Web App (PWA).
* Implemented core webcam streaming functionality over WebSockets.
* Added configurable IP address, port, resolution, and FPS settings.
* Introduced on-screen overlay for resolution, connection info, and battery status.
* Integrated `manifest.json` for PWA capabilities and version tracking.
* Developed Service Worker (`sw.js`) for offline support and robust caching strategy.
* Included `offline.html` as a fallback page.
* Project licensed under GNU GPL v3.0.

### 0.1.0.0 (2025-06-10) - Pre-release / Development Version

* Basic webcam streaming setup.
* Early development and testing phase.

---

## 🤝 Credits

* **Design**: Rikard Svenningsen
* **Programming**: Gemini (Large Language Model by Google)

---

## 📞 Contact

For any inquiries or support, please open an issue on the GitHub repository.
