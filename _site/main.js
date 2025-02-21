const App = {
  sw: null,
  sanitizerBc: new BroadcastChannel("html-sanitizer"),

  async init() {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.register("/sw.js", { 
        scope: "/",
        type: "module",
      });
      App.sw = registration.installing || registration.waiting || registration.active;  

      console.log("Service worker registered");

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        console.log("New service worker activated");
      });
    } else {
      console.error("Service workers are not supported");
    }

    App.sanitizerBc.addEventListener("message", (e) => {
      const {_id, count, increment, ...data} = e.data;

      // Setup sanitizer logic
      const result = {
        ...data,
        result: count + increment,
      };

      App.sanitizerBc.postMessage({_id, ...result});
    });
  },
};

document.addEventListener("DOMContentLoaded", async () => await App.init());
