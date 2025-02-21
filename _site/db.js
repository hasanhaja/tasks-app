// IndexedDB promise wrappers lifted from Jake Archibald's idb-keyval lib: https://github.com/jakearchibald/idb-keyval/blob/main/src/index.ts

export class DBDriver {
  #store;

  constructor(databaseName, storeName) {
    this.databaseName = databaseName;
    this.storeName = storeName;
    this.#store = DBDriver.#createStore(databaseName, storeName); 
  }

  #defaultGetStore() {
    if (!this.#store) {
      this.#store = DBDriver.#createStore(this.databaseName, this.storeName);
    }
    return this.#store;
  }

  static #createStore(dbName, storeName) {
    const request = self.indexedDB.open(dbName);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    const dbPromise = promisifyRequest(request);

    return (transactionMode, fn) =>
      dbPromise.then((db) => 
        fn(db.transaction(storeName, transactionMode).objectStore(storeName))
      );
  }

  set(key, value, customStore = this.#defaultGetStore()) {
    return customStore("readwrite", (store) => {
      store.put(value, key);
      return promisifyRequest(store.transaction);
    });
  }

  get(key, customStore = this.#defaultGetStore()) {
    return customStore("readonly", (store) => promisifyRequest(store.get(key))); 
  }

  update(key, updater, customStore = this.#defaultGetStore()) {
    return customStore("readwrite", (store) => new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          store.put(updater(request.result), key);
          resolve(promisifyRequest(store.transaction));
        } catch (err) {
          reject(err);
        }
      };
    }));
  }

  del(key, customStore = this.#defaultGetStore()) {
    return customStore("readwrite", (store) => {
      store.delete(key);
      return promisifyRequest(store.transaction);
    });
  }

  entries(customStore = this.#defaultGetStore()) {
    return customStore(
      "readonly", 
      (store) => Promise.all([
        promisifyRequest(store.getAllKeys()),
        promisifyRequest(store.getAll()),
      ]).then(([keys, values]) => keys.map((key, idx) => [key, values[idx]]))
    );
  }
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.oncomplete = request.onsuccess = () => resolve(request.result);
    request.onabort = request.onerror = () => reject(request.error);
  });
}
