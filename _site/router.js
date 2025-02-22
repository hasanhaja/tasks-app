export class Router {
  #getHandlers;
  #postHandlers;
  #putHandlers;
  #deleteHandlers;

  #assets;
  #assetCacheHandler;

  constructor() {
    this.#getHandlers = new Map();
    this.#postHandlers = new Map();
    this.#putHandlers = new Map();
    this.#deleteHandlers = new Map();
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

  registerCachedAssetsAndHandler(assets, assetCacheHandler) {
    this.#assets = assets;
    this.#assetCacheHandler = assetCacheHandler;
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

      // TODO Refactor to be cache middleware
      if (this.#assets.includes(path)) {
        e.respondWith(this.#assetCacheHandler(e.request));
        return;
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
