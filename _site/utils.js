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
