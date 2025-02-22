const ENTITY_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

/**
  * Taken from Mustache: https://github.com/janl/mustache.js/blob/master/mustache.js#L60C1-L75C2
  * @param {string} unsafe
  * @returns {string}
  */
export function escapeHtml(unsafe) {
  return unsafe.replace(/[&<>"'`=\/]/g, s => ENTITY_MAP[s]);
}

// BroadcastChannel promise wrapper

/**
  * @param {object} message
  * @param {BroadcastChannel} chan
  *
  * @returns {Promise<object>}
  */
export function post(message, chan) {
  return new Promise((resolve, reject) => {
    const messageId = `${chan.name}-${self.crypto.randomUUID()}`;
    const controller = new AbortController();

    chan.addEventListener("message", (e) => {
      const { _id, ...data} = e.data
      if (_id === messageId) {
        resolve(data);
        controller.abort();
      }
    }, { signal: controller.signal });

    chan.postMessage({ _id: messageId, ...message }); 
  });
}


export async function cacheStatic(cacheName, assets) {
  const cache = await caches.open(cacheName);
  await cache.addAll(assets);
  console.log(`${cacheName} has been updated`);
}

export async function cleanCache(cacheName) {
  const keys = await caches.keys();
  return Promise.all(
    keys
      .filter((key) => key !== cacheName)
      .map((key) => caches.delete(key))
  );
}

// Cache first, falling back to network strategy: https://developer.chrome.com/docs/workbox/caching-strategies-overview/#cache_first_falling_back_to_network
export async function cacheFirst(request, cacheName) {
  const cacheRes = await caches.match(request); 
  if (cacheRes !== undefined) {
    return cacheRes;
  } 
  const fetchRes = await fetch(request);
  const cache = await caches.open(cacheName);
  cache.put(request, fetchRes.clone());
  return fetchRes;
}

export async function networkFirst(request, cacheName) {
  try {  
    const fetchRes = await fetch(request);
    const cache = await caches.open(cacheName);
    cache.put(request, fetchRes.clone());
    return fetchRes;
  } catch (_) {
    return await caches.match(request); 
  }
}

export async function staleWhileRevalidate(request, cacheName) {
  const cacheRes = await caches.match(request); 
  
  const fetchRes = await fetch(request);
  const cache = await caches.open(cacheName);
  cache.put(request, fetchRes.clone());

  return cacheRes || fetchRes;
}
