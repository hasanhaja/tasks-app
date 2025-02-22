import { cacheFirst, networkFirst, staleWhileRevalidate } from "./utils.js";

export class Router {
  #getHandlers;
  #postHandlers;
  #putHandlers;
  #deleteHandlers;

  #cacheMap;

  constructor() {
    this.#getHandlers = new Map();
    this.#postHandlers = new Map();
    this.#putHandlers = new Map();
    this.#deleteHandlers = new Map();

    this.#cacheMap = new Map();
  }

  get(path, handler) {
    this.#getHandlers.set(path, handler);
  }

  post(path, handler) {
    this.#postHandlers.set(path, handler);
  }

  put(path, handler) {
    this.#putHandlers.set(path, handler);
  }

  delete(path, handler) {
    this.#deleteHandlers.set(path, handler);
  }

  /**
  * @typedef {Object} CacheConfig
  * @property {string} cacheName
  * @property {"cache-first" | "network-first" | "stale-while-revalidate"} strategy
  * @property {string[]} assets
  */

  /**
    * @param {CacheConfig[]} cacheConfig
    */
  caches(cacheConfig) {
    for (const config of cacheConfig) {
      for (const asset of config.assets) {
        this.#cacheMap.set(asset, { cacheName: config.cacheName, strategy: config.strategy })
      }
    }
  }

  listen() {
    self.addEventListener("fetch", (e) => {
      const { url: reqUrl, method } = e.request;
      const url = new URL(reqUrl);
      let path = url.pathname;

      // TODO handle trailing slash
      // TODO handle /<path>.html
      // TODO handle /<path>/index.html

      if (path === "/index.html") {
        path = "/";
      }

      let handler;

      switch (method) {
        case "GET":
          handler = this.#getHandlers.get(path);
          break;
        case "POST":
          handler = this.#postHandlers.get(path);
          break;
        case "PUT":
          handler = this.#putHandlers.get(path);
          break;
        case "DELETE":
          handler = this.#deleteHandlers.get(path);
          break;
        default:
          console.error(`HTTP method '${method}' not supported`);
      }

      if (!!handler) {
        e.respondWith(handler(e.request, e));
        return;
      }

      const cachedAssetConfig = this.#cacheMap.get(path);
      
      if (cachedAssetConfig) {
        const { cacheName, strategy } = cachedAssetConfig;  
        
        switch (strategy) {
          case "cache-first":
            e.respondWith(cacheFirst(e.request, cacheName));
            return;
          case "network-first":
            e.respondWith(networkFirst(e.request, cacheName));
            return;
          case "stale-while-revalidate":
            e.respondWith(staleWhileRevalidate(e.request, cacheName));
            return;
        }
      }

      e.respondWith(
        new Response(`<pre>CANNOT ${method} ${path}</pre>`, {
          status: 404,
          headers: new Headers({
            "Content-Type": "text/html; charset=utf-8",
          }),
        })
      );
    });
  }
}
