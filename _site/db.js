// IndexedDB promise wrappers lifted from Jake Archibald's idb-keyval lib: https://github.com/jakearchibald/idb-keyval/blob/main/src/index.ts

export class DBDriver {
  /**
    * Default store
    * If multiple stores are created, the first in the storeNames list will be the default
    */
  #store;
  #stores;

  /**
    * @param { string } databaseName
    * @param { string[] | string } storeNames
    */
  constructor(databaseName, storeNames) {
    this.databaseName = databaseName;
    // TODO This could be empty. Throw error if it is
    this.storeNames = storeNames;

    if (typeof storeNames === "string") {
      this.#store = DBDriver.#createStore(databaseName, storeNames);
    } else {
      this.#stores = DBDriver.#createStores(databaseName, storeNames);
    }
  }

  store(storeName) {
    return this.#stores.get(storeName);
  }

  #defaultGetStore() {
    if (!this.#store) {
      this.#store = typeof this.storeNames === "string"
        ? DBDriver.#createStore(this.databaseName, this.storeName)
        : this.#stores.get(this.storeNames[0]);
    }
    return this.#store;
  }

  /**
    * @params { string } dbName
    * @params { string[] } storeNames
    * @returns { Map }
    */
  static #createStores(dbName, storeNames) {
    const request = self.indexedDB.open(dbName);
    request.onupgradeneeded = () => {
      for (const storeName of storeNames) {
        request.result.createObjectStore(storeName);
      }
    };
    const dbPromise = promisifyRequest(request);

    const stores = new Map();
    for (const storeName of storeNames) {
      stores.set(
        storeName,
        (transactionMode, fn) =>
          dbPromise.then((db) =>
            fn(db.transaction(storeNames, transactionMode).objectStore(storeName))
        )
      );
    }
    return stores;
  }

  /**
    * @params { string } dbName
    * @params { string } storeName
    */
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
