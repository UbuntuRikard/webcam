// sw.js

// IMPORTANT: Adjust GITHUB_PAGES_BASE_PATH if your GitHub repository name changes
// This should be the path to your repository if it's a project page (e.g., /your-repo-name/)
// If it's a user/organization page (e.g., username.github.io), it should be '/'
const GITHUB_PAGES_BASE_PATH = '/webcam/'; 

// Define all core assets to cache. Paths must be relative to the GitHub Pages site root.
// If you add or remove files that your PWA needs offline, you must update this list.
const urlsToCache = [
    GITHUB_PAGES_BASE_PATH + 'index.html',
    GITHUB_PAGES_BASE_PATH + 'style.css',
    GITHUB_PAGES_BASE_PATH + 'webcam.js',
    GITHUB_PAGES_BASE_PATH + 'manifest.json', // Manifesten skal også caches!
    GITHUB_PAGES_BASE_PATH + 'offline.html', 
    // Eksterne ressourcer som Font Awesome CDN skal også inkluderes, hvis de skal caches
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    // PWA ikoner (juster stier, hvis de ligger i en anden undermappe)
    GITHUB_PAGES_BASE_PATH + 'freepik_camera_192x192.png',
    GITHUB_PAGES_BASE_PATH + 'freepik_camera_512x512.png'
    // Tilføj alle andre essentielle aktiver her (f.eks. andre billeder, yderligere JS-filer)
];

// --- HJÆLPEFUNKTION: Henter cache-navnet fra manifest.json ---
// Denne funktion kaldes asynkront i install- og activate-events.
async function getCurrentCacheName() {
    let appVersion = 'unknown'; // Standardværdi hvis manifest.json ikke kan hentes
    try {
        const response = await fetch(GITHUB_PAGES_BASE_PATH + 'manifest.json');
        if (response.ok) {
            const manifest = await response.json();
            if (manifest.version) {
                appVersion = manifest.version;
            }
        }
    } catch (e) {
        console.warn('Service Worker: Kunne ikke hente manifest.json for version, bruger "unknown".', e);
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
                    // Tilføj alle foruddefinerede URL'er til den aktuelle cache-version
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
    if (requestUrl.origin !== location.origin && !urlsToCache.includes(event.request.url)) {
        // Hent disse direkte fra netværket.
        return event.respondWith(fetch(event.request));
    }

    // Hovedcachingstrategi: Cache Først, derefter Netværk, derefter Fallback for navigationsforespørgsler.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Hvis forespørgslen findes i cachen, serves den med det samme.
            if (cachedResponse) {
                // console.log('Service Worker: Serverer fra cache:', event.request.url);
                return cachedResponse;
            }

            // Hvis ikke i cache, prøv at hente fra netværket.
            // console.log('Service Worker: Henter fra netværk:', event.request.url);
            return fetch(event.request)
                .then((response) => {
                    // Tjek om vi modtog et gyldigt svar, der kan caches.
                    // status 200 er OK, type 'basic' betyder typisk same-origin forespørgsel.
                    if (response && response.status === 200 && response.type === 'basic') {
                        // Klon svaret, fordi det er en stream og kun kan forbruges én gang.
                        const responseToCache = response.clone();
                        // Hent dynamisk cache-navn her også for at gemme i den korrekte cache
                        getCurrentCacheName().then(currentCacheName => {
                             caches.open(currentCacheName).then((cache) => {
                                 // Læg det nye svar ind i den aktuelle cache.
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
                    // For andre typer af forespørgsler (billeder, scripts osv.), hvis ikke i cache og netværk fejler,
                    // vil vi returnere et generisk "service utilgængelig" svar.
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
                    // Filtrer for caches, der tilhører vores app
                    cacheNames.filter(name => name.startsWith('webcam-streamer-'))
                                     .map(name => {
                                         console.log(`Service Worker: Rydder cache: ${name}`);
                                         return caches.delete(name);
                                     })
                );
            }).then(() => {
                console.log('Service Worker: Alle app-caches ryddet. Genindlæser side...');
                // Send en besked tilbage til klienten for at indikere, at cachen er ryddet og bede om genindlæsning
                event.source.postMessage({ type: 'CACHE_CLEARED_RELOAD' });
            })
        );
    }
});
