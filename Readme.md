# 📷 Webcam Streamer PWA

A simple, lightweight, and offline-capable Progressive Web Application (PWA) designed for streaming webcam footage to a specified IP address and port. This project is ideal for local network streaming scenarios, security monitoring, or simply extending your device's camera feed to another screen.

---

## ✨ Features

* **Live Webcam Streaming**: Streams your device's camera feed directly over a WebSocket connection.
* **Configurable Resolution & FPS**: Choose between VGA (640x480), HD (1280x720), and Full HD (1920x1080) resolutions, and adjust frame rates (5, 10, 20 FPS).
* **Customizable Server Connection**: Easily set the target IP address and port for your streaming server.
* **On-Screen Overlay**: Displays critical information directly on the video feed, including:
    * Current Streaming Resolution
    * Target Server IP and Port
    * Device Battery Status
    * Application Version
* **Progressive Web App (PWA)**: Installable to your home screen for quick access.
* **Offline Capability**: Thanks to Service Worker caching, the PWA can be launched and used even without an internet connection (after initial setup).
* **Seamless Updates**: The Service Worker intelligently updates cached assets when a new version is released, ensuring you always get the latest features and bug fixes.
* **Open Source**: Released under the GNU General Public License v3.0.

---

## 🚀 Getting Started

To get this project up and running, follow these steps:

### Prerequisites

* A web browser that supports WebRTC (for webcam access) and Service Workers (for PWA features).
* A server or application listening for WebSocket connections at the specified IP and port to receive the video stream.

### Installation & Setup

1.  **Clone the Repository (or Download)**:
    ```bash
    git clone [https://github.com/UbuntuRikard/webcam.git](https://github.com/UbuntuRikard/webcam.git)
    cd webcam
    ```
    *(Replace `YOUR_USERNAME` with your actual GitHub username)*

2.  **Ensure PWA Assets are in Place**:
    * Verify that `index.html`, `style.css`, `webcam.js`, `manifest.json`, `sw.js`, and `offline.html` are in your project root (e.g., `webcam/`).
    * Create an `icons/` folder inside your project root and place your PWA icons (e.g., `icon-192x192.png`, `icon-512x512.png`) there. These are specified in `manifest.json`.

3.  **Host the Project**:
    This project is designed to be hosted on GitHub Pages in a subdirectory (e.g., `yourusername.github.io/webcam/`). Ensure your GitHub Pages settings are configured to serve content from the appropriate branch/directory (e.g., `main` branch).

### Usage

1.  **Access the PWA**: Open your browser and navigate to the hosted URL (e.g., `https://UbuntuRikard.github.io/webcam/`).
2.  **Grant Camera Permission**: The browser will prompt you to grant access to your camera. Allow this permission.
3.  **Configure Connection**:
    * Enter the **IP Address** of your WebSocket server.
    * Enter the **Port** your WebSocket server is listening on (default is `8181`).
    * Click the **Save** icon to store your connection settings locally.
4.  **Select Camera & Settings**:
    * Choose your desired webcam from the dropdown.
    * Select the preferred streaming resolution and FPS.
5.  **Start Streaming**: Click the **"Start"** button. The live video feed with overlay information will begin streaming to your configured server.
6.  **Stop Streaming**: Click the **"Stop"** button to end the stream.

---

## 🖥️ Companion Media Server

This Webcam Streamer PWA is designed to send MJPEG video streams over WebSockets. To receive and further process these streams, you'll need a compatible media server.

A suitable Python-based media server is available, which can receive the MJPEG stream and re-stream it to other services, such as a **motion detection server**.

You can find this companion media server here: **[https://github.com/UbuntuRikard/mediaserver](https://github.com/UbuntuRikard/mediaserver)**

---

## 🔒 License

This project is licensed under the **GNU General Public License v3.0**.

You can find the full license text in the `LICENSE` file in the root of this repository, or read it [here](https://www.gnu.org/licenses/gpl-3.0.en.html).

---

## 📝 Release Notes

This section documents significant changes and new features across different versions.

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
