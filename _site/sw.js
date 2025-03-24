import { DBDriver } from "./db.js";
import { Router } from "./router.js";
import { escapeHtml, cacheStatic, cleanCache, post } from "./utils.js";

const VERSION = "0.0.1";
const STATIC_CACHE_NAME = `static-cache_${VERSION}`;
const IMAGE_CACHE_NAME = `image-cache_${VERSION}`;
const DYNAMIC_CACHE_NAME = `dynamic-cache`;
const DATABASE_NAME = "tasks-db";
const STORE_NAME = "tasks";

let db = new DBDriver(DATABASE_NAME, STORE_NAME);
const app = new Router();

const sanitizerBc = new BroadcastChannel("html-sanitizer");

const assets = [
  "/",
  "/index.html",
  "/new.html",
  "/new",
  "/main.js",
  "/htmx.min.js",
  "/app.webmanifest",
  "/main.css",
];

async function init() {
  await cacheStatic(STATIC_CACHE_NAME, assets);
}

self.addEventListener("install", (e) => {
  console.log(`Version ${VERSION} installed`);
  e.waitUntil(init());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  console.log(`Version ${VERSION} activated`);
  e.waitUntil(async () => {
    await cleanCache(STATIC_CACHE_NAME);
    await self.clients.claim(); 
  });
});

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
function toggleTodo(todo) {
  return {
    ...todo,
    completed: !todo.completed,
  };
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

async function redirect(path, isHtmx = false) {
  return isHtmx 
    ? new Response(null, { headers: new Headers({ "HX-Redirect": path }) })
    : Response.redirect(path, 303);
}

function list(id, title, completed) {
  return `
    <li id="task-${id}">
      <label>
        <input 
          type="checkbox" 
          hx-patch="/complete?id=${id}"
          hx-trigger="change"
          hx-target="#task-${id}"
          hx-swap="outerHTML"
          ${completed ? "checked" : ""}
        >
        ${ completed ?
            `<span><s>${title}</s></span>` 
          : `<span>${title}</span>`
        }
      </label>
      ${ completed ?
        ""
        : `<a href="/edit?id=${id}">Edit</a>`
      }
    </li>
  `;
  // return `
  //   <li>
  //     ${ completed ? 
  //         `<s>${title}</s> <a href="/delete?id=${id}">Delete</a>` 
  //       : `<a href="/complete?id=${id}">Complete</a> ${title} <a href="/delete?id=${id}">Delete</a>`}
  //   </li>
  // `;
}

/**
  * @param {TodoItem[]} data
  * @returns {string}
  */
function generateTodos(data) {
  return `
    <ul slot="task-list">
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
  if (!data || data.length === 0) {
    return cachedContent;
  }

  const templateClosingTag = "</template>";
  const [head, tail] = cachedContent.split(templateClosingTag);
  return `
    ${head}
    ${templateClosingTag}
    ${generateTodos(data)}
    ${tail}
  `;
}

app.get("/", () => {
  return respondWithSpliced();
});

app.post("/create", (req, e) => {
 e.waitUntil(
   req.text()
    .then((text) => new URLSearchParams(text))
    .then(([title, _]) => title)
    .then(([, value]) => escapeHtml(value))
    .then((value) => createTodo(value))
    .then(([ id, value ]) => db.set(id, value))
  );
 
  return redirect("/");
});

app.get("/delete", (req, e) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  e.waitUntil(db.del(id));
  
  return redirect("/");
});

function editPage(id, title) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>Tasks | Edit task</title>
    <link href="main.css" rel="stylesheet">

    <script type="module" src="main.js"></script>
    <script src="htmx.min.js"></script>
  </head>
  <body>
    <header>
      <h1 class="sr-only">Edit task</h1>
    </header>

    <main>
      <form hx-patch="/edit?id=${id}">
        <label>
          <span>Task name</span>
          <input type="text" name="task" value="${title}">
        </label>
        <button type="submit">Update</button>
      </form>
    </main>
  </body>
</html>
  `;
}

app.get("/edit", async (req, e) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  const todo = await db.get(id);
  const page = editPage(id, todo.title);

  return new Response(page, {
    status: 200,
    statusText: "OK",
    headers: new Headers({ "Content-Type": "text/html; charset=utf-8" }),
  });
});

app.patch("/edit", async (req, e) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  e.waitUntil(
   req.text()
    .then((text) => new URLSearchParams(text))
    .then(([title, _]) => title)
    .then(([, value]) => escapeHtml(value))
    .then((value) => db.update(id, (todo) => ({...todo, title: value})))
  );
 
  return redirect("/", true);
});

app.patch("/complete", async (req, e) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  e.waitUntil(db.update(id, toggleTodo));

  const todo = await db.get(id);
  const newBody = list(todo.id, todo.title, todo.completed);
 
  return new Response(newBody, {
    status: 200,
    statusText: "OK",
  });
});

const cacheConfig = [
  { cacheName: STATIC_CACHE_NAME, strategy: "cache-first", assets },
];

app.caches(cacheConfig);

app.listen();
