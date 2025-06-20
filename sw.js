// sw.js

// Dynamisk bestemmelse af base path for GitHub Pages-projektmapper.
// Dette vil være '/din-repo-navn/' for projektmapper, eller '/' for organisationssider.
// Det er afgørende for korrekte stier i cache.
const GITHUB_PAGES_BASE_PATH = self.location.pathname.substring(0, self.location.pathname.lastIndexOf('/') + 1);
console.log('Service Worker: GITHUB_PAGES_BASE_PATH sat til:', GITHUB_PAGES_BASE_PATH);

// Definer alle kerne-aktiver, der skal caches. Stier skal være relative til GITHUB_PAGES_BASE_PATH.
const urlsToCache = [
    GITHUB_PAGES_BASE_PATH + 'index.html',
    GITHUB_PAGES_BASE_PATH + 'style.css',
    GITHUB_PAGES_BASE_PATH + 'webcam.js',
    GITHUB_PAGES_BASE_PATH + 'manifest.json',
    GITHUB_PAGES_BASE_PATH + 'offline.html', 
    // Eksterne ressourcer skal have deres fulde URL
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    // PWA ikoner - brug GITHUB_PAGES_BASE_PATH for at matche den relative hosting
    GITHUB_PAGES_BASE_PATH + 'freepik_camera_192x192.png',
    GITHUB_PAGES_BASE_PATH + 'freepik_camera_512x512.png'
];

// --- HJÆLPEFUNKTION: Henter cache-navnet fra manifest.json ---
// Denne funktion kaldes asynkront i install- og activate-events.
async function getCurrentCacheName() {
    let appVersion = 'unknown'; // Standardværdi hvis manifest.json ikke kan hentes
    try {
        // Bruger GITHUB_PAGES_BASE_PATH for at hente manifestet korrekt
        const response = await fetch(GITHUB_PAGES_BASE_PATH + 'manifest.json');
        if (response.ok) {
            const manifest = await response.json();
            if (manifest.version) {
                appVersion = manifest.version;
            }
        }
    } catch (e) {
        console.warn('Service Worker: Kunne ikke hente manifest.json for version, bruger "unknown". Fejl:', e);
    }
    // Returner cache-navnet baseret på versionen fra manifest.json
    return `webcam-streamer-cache-v${appVersion}`;
}
// --- SLUT HJÆLPEFUNKTION ---


self.addEventListener('install', (event) => {
    console.log('Service Worker: Installerer...');
    event.waitUntil(
        // Henter det aktuelle cache-navn asynkront
        getCurrentCacheName().then(currentCacheName => {
            console.log('Service Worker: Cacher aktiver for', currentCacheName);
            return caches.open(currentCacheName)
                .then((cache) => {
                    return cache.addAll(urlsToCache);
                })
                .then(() => {
                    console.log('Service Worker: Alle kerne-aktiver tilføjet til cache:', currentCacheName);
                    // Tving den nye service worker til at aktivere med det samme,
                    // selvom ældre versioner af appen stadig er åbne.
                    return self.skipWaiting(); 
                })
                .catch((error) => {
                    console.error('Service Worker: Installation fejlede. Kunne ikke tilføje alle aktiver til cache:', error);
                });
        })
    );
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Aktiverer...');
    event.waitUntil(
        // Henter det aktuelle cache-navn asynkront for at rydde op
        getCurrentCacheName().then(currentCacheName => {
            return caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Slet gamle caches, der ikke matcher den aktuelle currentCacheName.
                        // Dette sikrer, at kun den nyeste version af cachen beholdes.
                        // Vi sikrer også, at den starter med 'webcam-streamer-' for at undgå at slette andre app-caches.
                        if (cacheName !== currentCacheName && cacheName.startsWith('webcam-streamer-')) {
                            console.log('Service Worker: Sletter gammel cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            });
        }).then(() => {
            console.log('Service Worker: Gamle caches ryddet op. Tager kontrol over klienter.');
            // Tag kontrol over alle klienter (sider) inden for denne service workers scope med det samme.
            return self.clients.claim(); 
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Håndter kun GET-forespørgsler for effektivitet og sikkerhed.
    if (event.request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // Spring caching over for eksterne ressourcer, der ikke eksplicit er angivet (f.eks. dynamiske API'er).
    // Eller hvis forespørgslen er til en chrome-extension:// URL osv.
    // Tjek også om det er en specifik request, der ikke skal caches (f.eks. WebSocket-opgraderinger).
    if (requestUrl.origin !== location.origin && !urlsToCache.includes(event.request.url) || event.request.url.includes('/ws')) {
        return event.respondWith(fetch(event.request));
    }

    // Hovedcachingstrategi: Cache Først, derefter Netværk, derefter Fallback for navigationsforespørgsler.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // console.log('Service Worker: Serverer fra cache:', event.request.url);
                return cachedResponse;
            }

            // console.log('Service Worker: Henter fra netværk:', event.request.url);
            return fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const responseToCache = response.clone();
                        getCurrentCacheName().then(currentCacheName => {
                             caches.open(currentCacheName).then((cache) => {
                                 cache.put(event.request, responseToCache); 
                             });
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Netværksforespørgsel fejlede (f.eks. brugeren er offline).
                    // Hvis det er en navigationsforespørgsel (dvs. anmoder om en HTML-side), serves offline.html.
                    if (event.request.mode === 'navigate') {
                        console.log('Service Worker: Netværk fejlede for navigation, serverer offline-side.');
                        return caches.match(GITHUB_PAGES_BASE_PATH + 'offline.html');
                    }
                    return new Response(null, { status: 503, statusText: 'Service Utilgængelig' });
                });
        })
    );
});

// Valgfrit: Besked-listener for at tillade manuelle Service Worker-handlinger fra din PWA.
// Du kunne tilføje en knap i din PWA for at udløse en 'CLEAR_CACHE' besked.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        console.log('Service Worker: skipWaiting() kaldt på grund af klientbesked.');
    } else if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.filter(name => name.startsWith('webcam-streamer-'))
                                        .map(name => {
                                            console.log(`Service Worker: Rydder cache: ${name}`);
                                            return caches.delete(name);
                                        })
                );
            }).then(() => {
                console.log('Service Worker: Alle app-caches ryddet. Genindlæser side...');
                event.source.postMessage({ type: 'CACHE_CLEARED_RELOAD' });
            })
        );
    }
});
