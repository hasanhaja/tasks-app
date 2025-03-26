class AutofocusInput extends HTMLElement {
  static tagName = "autofocus-input";
  #controller;

  constructor() {
    super();
    this.#controller = new AbortController(); 
  }

  connectedCallback() {
    const input = this.querySelector("*");
    
    if (!input.hasAttribute("autofocus")) {
      input.setAttribute("autofocus", "");
    }

    input.addEventListener("focus", (e) => {
      const temp = input.value; 
      input.value = ""; 
      input.value = temp;
    }, { signal: this.#controller.signal });
  }

  disconnectedCallback() {
    this.#controller.abort();
  }
}

customElements.define(AutofocusInput.tagName, AutofocusInput);
