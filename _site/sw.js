// Placing this here so the above constants are honored
// importScripts("db.js", "utils.js");
import { DBDriver } from "./db.js";
import { escapeHtml } from "./utils.js";

const VERSION = "0.0.1";
const STATIC_CACHE_NAME = `static-cache_${VERSION}`;
const DATABASE_NAME = "tasks-db";
const STORE_NAME = "tasks";

let db;

const sanitizerBc = new BroadcastChannel("html-sanitizer");

// TODO Cache manifest etc, but not service worker. Let the browser handle that.
const assets = [
  "/",
  "/index.html",
  "/main.js",
  "/htmx.min.js",
  "/app.webmanifest",
  "/main.css",
];

async function cacheStatic() {
  const cache = await caches.open(STATIC_CACHE_NAME);
  await cache.addAll(assets);
  console.log(`${STATIC_CACHE_NAME} has been updated`);
}

async function cleanCache() {
  const keys = await caches.keys();
  return Promise.all(
    keys
      .filter((key) => key !== STATIC_CACHE_NAME)
      .map((key) => caches.delete(key))
  );
}

async function init() {
  await cacheStatic();
  db = new DBDriver(DATABASE_NAME, STORE_NAME);
}

self.addEventListener("install", (e) => {
  console.log(`Version ${VERSION} installed`);
  e.waitUntil(init());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  console.log(`Version ${VERSION} activated`);
  e.waitUntil(async () => {
    await cleanCache();
    await self.clients.claim(); 
  });
});

// BroadcastChannel promise wrapper

/**
  * @param {object} message
  * @param {BroadcastChannel} chan
  *
  * @returns {Promise<object>}
  */
function post(message, chan) {
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

/**
  * @typedef {Object} TodoItem
  * @property {string} id
  * @property {string} title
  * @property {boolean} completed
  */

/**
  * @param {string} title
  * @returns {[string, TodoItem]}
  */
function createTodo(title) {
  const id = self.crypto.randomUUID();
  return [
    id,
    { 
      id,
      title,
      completed: false,
    },
  ]
}

/**
  * @param {TodoItem} todo
  * @returns {TodoItem}
  */
function completeTodo(todo) {
  return {
    ...todo,
    completed: true,
  };
}

async function respondWithCache(request) {
  const cacheRes = await caches.match(request); 
  if (cacheRes !== undefined) {
    return cacheRes;
  } 
  // fetch anyways incase the cache is stale
  const fetchRes = await fetch(request);
  const cache = await caches.open(STATIC_CACHE_NAME);
  cache.put(request, fetchRes.clone());
  return fetchRes;
}

async function respondWithSpliced() {
  const res = await caches.match("/");
  const clonedRes = res.clone();
  const originalBody = await clonedRes.text();

  const allEntries= await db.entries();
  const data = allEntries.map(([, todoItem]) => todoItem);
  const newBody = spliceResponseWithData(originalBody, data);

  return new Response(newBody, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

async function redirect(path) {
  return Response.redirect(path, 303);
}

function list(id, title, completed) {
  return `
    <li>
      ${ completed ? 
          `<s>${title}</s> <a href="/delete?id=${id}">Delete</a>` 
        : `<a href="/complete?id=${id}">Complete</a> ${title} <a href="/delete?id=${id}">Delete</a>`}
    </li>
  `;
}

/**
  * @param {TodoItem[]} data
  * @returns {string}
  */
function generateTodos(data) {
  return `
    <ul slot="todo-list">
      ${data
          .map(({ id, title, completed }) => list(id, title, completed))
          .join("")
      }
    </ul>
  `;
}

/**
  * @param {string} cachedContent 
  * @param {TodoItem[]} data
  * @returns {string}
  */
function spliceResponseWithData(cachedContent, data) {
  if (!data) {
    return cachedContent;
  }

  const lazyBoundary = "<!-- lazy -->";
  const [head, tail] = cachedContent.split(lazyBoundary);
  return `
    ${head}
    ${generateTodos(data)}
    ${tail}
  `;
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const path = url.pathname;

  if (path === "/" || path === "/index.html") {
    e.respondWith(respondWithSpliced());
  } else if (path === "/postMessage1") {
    e.waitUntil(
      post({ path: "first", count: 0, increment: 1 }, sanitizerBc)
      .then((data) => {
        console.log("New SW data:", data);
      })
    ); 

    e.respondWith(redirect("/"));
  } else if (path === "/postMessage2") {
    e.waitUntil(
      post({ path: "second", count: 0, increment: 10 }, sanitizerBc)
      .then((data) => {
        console.log("New SW data:", data);
      })
    ); 

    e.respondWith(redirect("/"));
  } else if (path === "/create") {
    e.waitUntil(
      e.request.text()
        .then((text) => new URLSearchParams(text))
        .then(([title, _]) => title)
        .then(([, value]) => escapeHtml(value))
        .then((value) => createTodo(value))
        .then(([ id, value ]) => db.set(id, value))
    );
    e.respondWith(redirect("/"));
  } else if (path === "/delete") {
    const id = url.searchParams.get("id");
    e.waitUntil(db.del(id));
    e.respondWith(redirect("/"));
  } else if (path === "/complete") {
    const id = url.searchParams.get("id");
    e.waitUntil(db.update(id, completeTodo));
    e.respondWith(redirect("/"));
  } else if (assets.includes(path)) {
    e.respondWith(respondWithCache(e.request));
  }
});
