class HtmxConfirmationHandler extends HTMLElement {
  static tagName = "htmx-confirmation-handler";
  static attrs = {
    confirmationDialog: "confirmation-dialog",
  };
  static observedAttributes = Object.values(HtmxConfirmationHandler.attrs);

  #controller;
  #dialog;

  constructor() {
    super();
    this.#controller = new AbortController(); 
  }

  /**
    * TODO What to do if the attribute isn't passed in?
    * @returns { string }
    */
  get confirmationDialog() {
    return this.getAttribute(HtmxConfirmationHandler.attrs.confirmationDialog);
  }

  connectedCallback() {
    this.#dialog = document.getElementById(this.confirmationDialog);
    const form = this.#dialog.querySelector("form");
    const dialogCloseBtn = this.#dialog.querySelector("[data-variant='close-dialog']"); 

    dialogCloseBtn.addEventListener("click", (e) => {
      this.#dialog.close();
    }, { signal: this.#controller.signal });

    form.addEventListener("submit", (e) => console.log("Dialog form submitted"));

    this.addEventListener("htmx:confirm", (confirmEvent) => {
      if (!confirmEvent.detail.elt.hasAttribute("hx-confirm")) return;
      confirmEvent.preventDefault();

      this.#dialog.showModal();
      const dialogDeleteBtn = this.#dialog.querySelector("[data-variant='delete']");

      dialogDeleteBtn.addEventListener("click", () => {
        // If the user confirms, we manually issue the request
        confirmEvent.detail.issueRequest(true); // true to skip the built-in window.confirm()
        this.#dialog.close();
      }, { once: true });
    }, { signal: this.#controller.signal });
  }

  disconnectedCallback() {
    this.#controller.abort();
  }
}

customElements.define(HtmxConfirmationHandler.tagName, HtmxConfirmationHandler);
