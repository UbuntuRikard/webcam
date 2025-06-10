// sw.js

// IMPORTANT: Adjust GITHUB_PAGES_BASE_PATH if your GitHub repository name changes
// This should be the path to your repository if it's a project page (e.g., /your-repo-name/)
// If it's a user/organization page (e.g., username.github.io), it should be '/'
const GITHUB_PAGES_BASE_PATH = '/webcam/'; 

// --- CRITICAL FOR UPDATES: Cache Version ---
// You MUST update this version string every time you make changes to your PWA's static assets
// (e.g., index.html, style.css, webcam.js, manifest.json, images, icons).
// Increment this value (e.g., 'v1.0.1' to 'v1.0.2', 'v1.1' to 'v1.2') to force the browser
// to install the new Service Worker and clear old caches.
const CACHE_NAME = 'webcam-streamer-cache-v1.0.1'; // <--- **HUSK AT OPDATERE DENNE VED HVER ÆNDRING!**
// --- END CRITICAL FOR UPDATES ---

// Define all core assets to cache. Paths must be relative to the GitHub Pages site root.
// If you add or remove files that your PWA needs offline, you must update this list.
const urlsToCache = [
    GITHUB_PAGES_BASE_PATH + 'index.html',
    GITHUB_PAGES_BASE_PATH + 'style.css',
    GITHUB_PAGES_BASE_PATH + 'webcam.js',
    GITHUB_PAGES_BASE_PATH + 'manifest.json', // Manifest also gets cached
    GITHUB_PAGES_BASE_PATH + 'offline.html', 
    // External assets (like CDN for Font Awesome) should be listed if you want them cached
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    // PWA Icons (adjust paths if they are in a different subdirectory)
    GITHUB_PAGES_BASE_PATH + 'freepik_camera_192x192.png',
    GITHUB_PAGES_BASE_PATH + 'freepik_camera_512x512.png'
    // Add any other essential assets here (e.g., other images, additional JS files)
];

self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing - Caching assets for', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // Add all predefined URLs to the current cache version
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('Service Worker: All core assets added to cache:', CACHE_NAME);
                // Force the new service worker to activate immediately,
                // even if older versions of the app are still open.
                return self.skipWaiting(); 
            })
            .catch((error) => {
                console.error('Service Worker: Installation failed. Could not add all assets to cache:', error);
                // Even if installation fails, the browser might try again later.
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete old caches that do not match the current CACHE_NAME.
                    // This ensures only the latest version of the cache is kept.
                    // We also ensure it starts with 'webcam-streamer-' to avoid deleting other app caches.
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('webcam-streamer-')) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker: Old caches cleaned up. Taking control of clients.');
            // Take control of all clients (pages) within this service worker's scope immediately.
            return self.clients.claim(); 
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests for efficiency and safety.
    if (event.request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // Skip caching for external resources not explicitly listed (e.g., dynamic APIs).
    // Or if the request is for a chrome-extension:// URL etc.
    if (requestUrl.origin !== location.origin && !urlsToCache.includes(event.request.url)) {
        // Just fetch these directly from the network.
        return event.respondWith(fetch(event.request));
    }

    // Main caching strategy: Cache First, then Network, then Fallback for navigation requests.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // If the request is found in the cache, serve it immediately.
            if (cachedResponse) {
                // console.log('Service Worker: Serving from cache:', event.request.url);
                return cachedResponse;
            }

            // If not in cache, try to fetch from the network.
            // console.log('Service Worker: Fetching from network:', event.request.url);
            return fetch(event.request)
                .then((response) => {
                    // Check if we received a valid response to cache.
                    // status 200 is OK, type 'basic' usually means same-origin request.
                    if (response && response.status === 200 && response.type === 'basic') {
                        // Clone the response because it's a stream and can only be consumed once.
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            // Put the new response into the current cache.
                            cache.put(event.request, responseToCache); 
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Network request failed (e.g., user is offline).
                    // If it's a navigation request (i.e., requesting an HTML page), serve offline.html.
                    if (event.request.mode === 'navigate') {
                        console.log('Service Worker: Network failed for navigation, serving offline page.');
                        return caches.match(GITHUB_PAGES_BASE_PATH + 'offline.html');
                    }
                    // For other types of requests (images, scripts etc.), if not in cache and network fails,
                    // we'll return a generic service unavailable response.
                    return new Response(null, { status: 503, statusText: 'Service Unavailable' });
                });
        })
    );
});

// Optional: Message listener to allow manual Service Worker actions from your PWA.
// You could add a button in your PWA to trigger a 'CLEAR_CACHE' message.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        console.log('Service Worker: skipWaiting() called due to client message.');
    } else if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    // Filter for caches belonging to our app
                    cacheNames.filter(name => name.startsWith('webcam-streamer-'))
                              .map(name => {
                                  console.log(`Service Worker: Clearing cache: ${name}`);
                                  return caches.delete(name);
                              })
                );
            }).then(() => {
                console.log('Service Worker: All app caches cleared. Reloading page...');
                // Send a message back to the client to indicate cache cleared and prompt reload
                event.source.postMessage({ type: 'CACHE_CLEARED_RELOAD' });
            })
        );
    }
});
