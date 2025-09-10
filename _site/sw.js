import { ServerSentEventGenerator } from "./datastar-sdk.js";
import { DBDriver } from "./db.js";
import { Router } from "./router.js";
import { escapeHtml, cacheStatic, cleanCache, post } from "./utils.js";

const VERSION = "0.0.2";
const STATIC_CACHE_NAME = `static-cache_${VERSION}`;
const IMAGE_CACHE_NAME = `image-cache_${VERSION}`;
const DYNAMIC_CACHE_NAME = `dynamic-cache`;
const DATABASE_NAME = "tasks-db";
const STORE_NAME = "tasks";
const APP_STATE_STORE_NAME = "app-state";

let db = new DBDriver(DATABASE_NAME, [STORE_NAME, APP_STATE_STORE_NAME]);

const DEFAULT_APP_STATE = {
  "task-filter": "all",
};

const app = new Router();

const sanitizerBc = new BroadcastChannel("html-sanitizer");

const assets = [
  "/",
  "/index.html",
  "/new.html",
  "/new",
  "/main.js",
  "/datastar.js",
  "/app.webmanifest",
  "/main.css",
  "/autofocus-input.js",
  "/confirmation-handler.js",
];

async function init() {
  await cacheStatic(STATIC_CACHE_NAME, assets);
}

/**
  * @returns { Promise<string> }
  */
async function getFilterState() {
  const appStore = db.store(APP_STATE_STORE_NAME);
  const taskFilter = await db.get("task-filter", appStore);
  if (taskFilter) {
    return taskFilter;
  }
  await db.set("task-filter", DEFAULT_APP_STATE["task-filter"], appStore);
  return DEFAULT_APP_STATE["task-filter"];
}

/**
  * @param { AppFilterState } filter
  * @returns { string }
  */
async function setFilterState(filter) {
  const appStore = db.store(APP_STATE_STORE_NAME);
  await db.set("task-filter", filter, appStore);
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

/**
 * @param { string } path
 * @param { boolean } [isSoftRedirect=false]
 */
async function redirect(path, isSoftRedirect = false) {
  return isSoftRedirect
  ? ServerSentEventGenerator.stream((stream) => {
    stream.executeScript(`window.location = "${path}"`);
  })
  : Response.redirect(path, 303);
}

/**
 * @param { { id: string; } } props
 */
function ConfirmationDialog({ id }) {
  return `
    <!-- Task Delete Confirmation Dialog -->
    <dialog id="${id}">
      <form method="dialog">
        <button class="btn" type="button" data-variant="close-dialog">
          <span class="sr-only">Close dialog</span>
          <!-- TODO Replace with font awesome icon -->
          <span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
          </span>
        </button>
        <p>Are you sure you want to delete this task?</p>
        <div>
          <button class="btn" type="button" data-variant="delete">Delete</button>
          <button class="btn" type="submit" data-variant="neutral" autofocus>Cancel</button>
        </div>
      </form>
    </dialog>
  `;
}

// TODO Rework to use Datastar
function List(id, title, completed) {
  return `
    <li id="task-${id}">
      <label>
        <input 
          type="checkbox" 
          name="complete-toggle-${id}"
          data-on-change="@patch('/complete?id=${id}')"
          ${completed ? "checked" : ""}
        >
        ${ completed ?
            `<span><s>${title}</s></span>` 
          : `
            <span>
              <span>${title}</span>
              <button popovertarget="task-menu__${id}">
                <span class="sr-only">Open menu</span>
                <span class="edit-task">
                  <!-- TODO Replace with font awesome icon -->
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M64 360a56 56 0 1 0 0 112 56 56 0 1 0 0-112zm0-160a56 56 0 1 0 0 112 56 56 0 1 0 0-112zM120 96A56 56 0 1 0 8 96a56 56 0 1 0 112 0z"/></svg>
                </span>
              </button>
            </span>
          `
        }
      </label>

      ${ completed ? "" : `
        <div popover id="task-menu__${id}">
          <ul>
            <li>
              <!-- TODO On click emit event to open dialog -->
              <button
                class="btn"
                data-variant="delete-task"
                data-on-action-confirmed="@delete('/delete?id=${id}')"
                data-on-click="event.target.dispatchEvent(new Event('action-attempted', { bubbles: true }))"
              >
                Delete
              </button>
            </li>
            <li>
              <a class="btn" data-variant="edit-task" href="/edit?id=${id}">
                Edit
              </a>
            </li>
          </ul>
        </div>
      `}
    </li>
  `;
}

/**
  * @param {TodoItem[]} data
  * @returns {string}
  */
function TodoList(data) {
  if (data.length < 1) {
    return `
      <task-list id="task-list">
        <span>All done!</span>
      </task-list>
    `;
  }

  return `
    <task-list id="task-list">
      <ul>
        ${data
            .map(({ id, title, completed }) => List(id, title, completed))
            .join("")
        }
      </ul>
    </task-list>
  `;
}

/**
 * @param { "all" | "done" | "active" } filter
 * @returns { string }
 */
function FilterControls(filter) {
  return `
    <form class="task-controls" data-variant="filter">
      <fieldset>
        <label class="btn">
          <input
            type="radio"
            name="task-filter"
            value="all"
            ${filter === "all" ? "checked" : ""}
            data-on-change="@post('/set-filter', { contentType: 'form' })"
          >
          <span>All</span>
        </label>
        <label class="btn">
          <input
            type="radio"
            name="task-filter"
            value="done"
            ${filter === "done" ? "checked" : ""}
            data-on-change="@post('/set-filter', { contentType: 'form' })"
          >
          <span>Done</span>
        </label>
        <label class="btn">
          <input
            type="radio"
            name="task-filter"
            value="active"
            ${filter === "active" ? "checked" : ""}
            data-on-change="@post('/set-filter', { contentType: 'form' })"
          >
          <span>Active</span>
        </label>
      </fieldset>
    </form>
  `;
}

function RootLayout(children) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>Tasks</title>
    <link href="main.css" rel="stylesheet">
    <!-- TODO design favicon -->
    <!-- <link rel="icon" href="favicon.ico" /> -->

    <script type="module" src="main.js"></script>
    <script type="module" src="confirmation-handler.js"></script>
    <!-- <link rel="manifest" href="app.webmanifest"> -->
    <script type="module" src="datastar.js"></script>
  </head>
  <body>
    <header>
      <h1 class="sr-only">Tasks App Home</h1>
      <nav class="floating-menu max-width">
        <ul>
          <li>
            <a class="btn" href="/settings">
              <span class="sr-only">Settings</span>
              <!-- TODO Placeholder until I sort out font awesome icons -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z"/></svg>
            </a>
          </li>
          <li>
            <a class="btn" href="/new">
              <span class="sr-only">New task</span>
              <!-- TODO Placeholder until I sort out font awesome icons -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.--><path d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"/></svg>
            </a>
          </li>
        </ul>
      </nav>
    </header>

    <main>
      ${children ?? ""}
    </main>
  </body>
</html>
  `;
}

/**
  * @param {string} cachedContent 
  * @param {TodoItem[]} data
  * @param { AppFilterState } filter
  * @returns {string}
  */
function IndexPage(cachedContent, data, filter) {
  if (!data || data.length === 0) {
    return cachedContent;
  }

  return RootLayout(`
    <confirmation-handler confirmation-dialog="task-delete-confirmation">
      <section>
        <h2 class="title">Tasks</h2>
        <div class="controls-panel">
          ${FilterControls(filter)}
        </div>
        <div>
          ${TodoList(data)}
        </div>
      </section>
    </confirmation-handler>
    ${ConfirmationDialog({ id: "task-delete-confirmation" })}
  `);
}

/**
  * @typedef { "done" | "all" | "active" } AppFilterState
  */

/**
  * @param { AppFilterState } filter
  * @returns { string }
  */
async function FilteredTodoList(filter) {
  const allEntries= await db.entries();
  const data = allEntries
    .map(([, todoItem]) => todoItem)
    .filter(({ completed }) => {
      if (filter === "done") {
        return completed;
      } else if (filter === "active") {
        return !completed;
      } else {
        return true;
      }
    })
  ;

  return TodoList(data);
}

app.get("/", async () => {
  const filter = await getFilterState();

  const res = await caches.match("/");
  const clonedRes = res.clone();
  const originalBody = await clonedRes.text();

  const allEntries= await db.entries();
  const data = allEntries
    .map(([, todoItem]) => todoItem)
    .filter(({ completed }) => {
      if (filter === "done") {
        return completed;
      } else if (filter === "active") {
        return !completed;
      } else {
        return true;
      }
    });

  const body = IndexPage(originalBody, data, filter);

  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
});

app.post("/set-filter", async (req, e) => {
  const text = await req.text();
  const [params, _] = new URLSearchParams(text);
  console.assert(params[0] === "task-filter");
  console.assert(params.length === 2);

  const rawFilter = params[1];
  await setFilterState(rawFilter);
  const filter = await getFilterState();

  return ServerSentEventGenerator.stream(async (stream) => {
    stream.patchElements(await FilteredTodoList(filter));
  });
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

app.delete("/delete", (req, e) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  e.waitUntil(db.del(id));

  return ServerSentEventGenerator.stream((stream) => {
    stream.patchElements("", { selector: `#task-${id}`, mode: "remove" });
  });
});

function EditPage(id, title) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>Tasks | Edit task</title>
    <link href="main.css" rel="stylesheet">

    <script type="module" src="main.js"></script>
    <script type="module" src="autofocus-input.js"></script>
    <script type="module" src="datastar.js"></script>
  </head>
  <body>
    <header>
      <h1 class="sr-only">Edit task</h1>
    </header>

    <main>
      <h2>Edit</h2>
      <form data-on-submit="@patch('/edit?id=${id}', { contentType: 'form' })">
        <label>
          <span>Task name</span>

          <autofocus-input>
            <textarea name="task" autofocus required class="input">${title}</textarea>
          </autofocus-input>
        </label>
        <button type="submit" class="btn">Update</button>
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
  const page = EditPage(id, todo.title);

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
 
  return ServerSentEventGenerator.stream(async (stream) => {
    stream.patchElements(List(todo.id, todo.title, todo.completed));
    const filter = await getFilterState();
    stream.patchElements(await FilteredTodoList(filter));
  });
});

const cacheConfig = [
  { cacheName: STATIC_CACHE_NAME, strategy: "cache-first", assets },
];

app.caches(cacheConfig);

app.listen();
