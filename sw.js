// sw.js
// IMPORTANT: Adjust GITHUB_PAGES_BASE_PATH if your GitHub repository name changes
const GITHUB_PAGES_BASE_PATH = '/webcam/'; 

// This will be updated with the version from manifest.json during installation
let CACHE_NAME = 'webcam-streamer-initial-cache'; 

self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        // Use a temporary cache name while we fetch the manifest to get the actual version
        caches.open('temp-install-cache').then(async (cache) => { 
            try {
                // Fetch the manifest.json to get the current app version
                const response = await fetch(GITHUB_PAGES_BASE_PATH + 'manifest.json');
                if (!response.ok) {
                    throw new Error(`Failed to fetch manifest.json: ${response.statusText}`);
                }
                const manifest = await response.json();
                const appVersion = manifest.version || '0.1.0.0'; // Default if version isn't in manifest
                
                CACHE_NAME = `webcam-streamer-v${appVersion}`;
                console.log(`Service Worker: New cache name determined: ${CACHE_NAME}`);

                // Define all assets to cache. Paths must be relative to the GitHub Pages site root.
                const urlsToCache = [
                    GITHUB_PAGES_BASE_PATH + 'index.html',
                    GITHUB_PAGES_BASE_PATH + 'style.css',
                    GITHUB_PAGES_BASE_PATH + 'webcam.js',
                    GITHUB_PAGES_BASE_PATH + 'manifest.json',
                    GITHUB_PAGES_BASE_PATH + 'offline.html', 
                    // Font Awesome CSS (adjust if you host it locally)
                    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
                    // PWA Icons (assuming they are in /webcam/icons/ relative to repo root)
                    GITHUB_PAGES_BASE_PATH + 'freepik_camera_192x192.png',
                    GITHUB_PAGES_BASE_PATH + 'freepik_camera_512x512.png'
                    // Add any other essential assets here (e.g., images, other JS files)
                ];

                await cache.addAll(urlsToCache);
                console.log('Service Worker: All assets added to cache.');
                
                // Delete the temporary cache used only for initial manifest fetch
                await caches.delete('temp-install-cache');
            } catch (error) {
                console.error('Service Worker: Failed during install process:', error);
                // If manifest fetch fails, use a fallback cache name and try to cache essentials
                CACHE_NAME = 'webcam-streamer-fallback-v0.1.0.0';
                console.warn(`Service Worker: Using fallback cache name: ${CACHE_NAME}`);
                await cache.addAll([
                    GITHUB_PAGES_BASE_PATH + 'index.html',
                    GITHUB_PAGES_BASE_PATH + 'style.css',
                    GITHUB_PAGES_BASE_PATH + 'webcam.js',
                    GITHUB_PAGES_BASE_PATH + 'offline.html'
                ]).catch(err => console.error('Service Worker: Failed to cache fallback assets:', err));
            }
        })
    );
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete old caches that do not match the current CACHE_NAME
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('webcam-streamer-')) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Takes control of pages immediately
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // If the request is in the cache, return the cached version
            if (cachedResponse) {
                console.log('Service Worker: Serving from cache:', event.request.url);
                return cachedResponse;
            }

            // Otherwise, try to fetch from the network
            console.log('Service Worker: Fetching from network:', event.request.url);
            return fetch(event.request)
                .then((response) => {
                    // Check if we received a valid response
                    if (response && response.status === 200 && response.type === 'basic') {
                        // Clone the response because it's a stream and can only be consumed once
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache); // Cache the new response
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Network request failed (e.g., offline)
                    // If it's a navigation request (i.e., requesting an HTML page), serve offline.html
                    if (event.request.mode === 'navigate') {
                        console.log('Service Worker: Network failed, serving offline page for navigation.');
                        return caches.match(GITHUB_PAGES_BASE_PATH + 'offline.html');
                    }
                    // For other types of requests (images, scripts), if not in cache and network fails,
                    // you could serve a placeholder or just let it fail gracefully.
                    // For now, we'll return a generic service unavailable response.
                    return new Response(null, { status: 503, statusText: 'Service Unavailable' });
                });
        })
    );
});
