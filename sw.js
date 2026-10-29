// Asset-only cache. Auth tokens and workspace API requests must never enter the service worker cache.
const CACHE='invoice-studio-v2-static';
const ASSETS=['./','./index.html','./config.js','./cloud.js','./app.js','./styles.css','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
 // Network first to ensure app updates and zero API-response caching. Offline content is a shell only.
 e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});