class ConfirmationHandler extends HTMLElement {
  static tagName = "confirmation-handler";
  static attrs = {
    confirmationDialog: "confirmation-dialog",
  };
  static observedAttributes = Object.values(ConfirmationHandler.attrs);

  #controller;
  #dialog;

  constructor() {
    super();
    this.#controller = new AbortController(); 
  }

  /**
    * @returns { string }
    */
  get confirmationDialog() {
    return this.getAttribute(ConfirmationHandler.attrs.confirmationDialog);
  }

  connectedCallback() {
    this.#dialog = document.getElementById(this.confirmationDialog);
    const form = this.#dialog.querySelector("form");
    const dialogCloseBtn = this.#dialog.querySelector("[data-variant='close-dialog']"); 

    dialogCloseBtn.addEventListener("click", (e) => {
      this.#dialog.close();
    }, { signal: this.#controller.signal });

    this.addEventListener("action-attempted", (attemptedEvent) => {
      this.#dialog.showModal();
      const dialogDeleteBtn = this.#dialog.querySelector("[data-variant='delete']");

      dialogDeleteBtn.addEventListener("click", () => {
        attemptedEvent.target.dispatchEvent(new Event("action-confirmed"));
        this.#dialog.close();
      }, { once: true });
    }, { signal: this.#controller.signal });
  }

  disconnectedCallback() {
    this.#controller.abort();
  }
}

customElements.define(ConfirmationHandler.tagName, ConfirmationHandler);
