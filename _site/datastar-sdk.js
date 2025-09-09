// The SDK was lifted directly from starfederation/datastar-typescript: https://github.com/starfederation/datastar-typescript

// Constants
const DATASTAR = "datastar";
const DATASTAR_REQUEST = "Datastar-Request";
const VERSION = "1.0.0-RC.2";

// The default duration for retrying SSE on connection reset. This is part of the underlying retry mechanism of SSE.
const DefaultSseRetryDurationMs = 1000;

// Should elements be patched using the ViewTransition API?
const DefaultElementsUseViewTransitions = false;

// Should a given set of signals patch if they are missing?
const DefaultPatchSignalsOnlyIfMissing = false;
const DatastarDatalineSelector = "selector"
const DatastarDatalinePatchMode = "mode"
const DatastarDatalineElements = "elements"
const DatastarDatalineUseViewTransition = "useViewTransition"
const DatastarDatalineSignals = "signals"
const DatastarDatalineOnlyIfMissing = "onlyIfMissing"
const DatastarDatalinePaths = "paths"

// The mode in which an element is patched into the DOM.
const ElementPatchModes = [
    // Morph entire element, preserving state
    "outer",
    // Morph inner HTML only, preserving state
    "inner",
    // Replace entire element, reset state
    "replace",
    // Insert at beginning inside target
    "prepend",
    // Insert at end inside target
    "append",
    // Insert before target element
    "before",
    // Insert after target element
    "after",
    // Remove target element from DOM
    "remove",
];

// Default value for ElementPatchMode
const DefaultElementPatchMode = "outer";

// The type protocol on top of SSE which allows for core pushed based communication between the server and the client.
const EventTypes = [
    // An event for patching HTML elements into the DOM.
    "datastar-patch-elements",
    // An event for patching signals.
    "datastar-patch-signals",
];

const DefaultMapping = {
  [DatastarDatalinePatchMode]: DefaultElementPatchMode,
  [DatastarDatalineUseViewTransition]: DefaultElementsUseViewTransitions,
  [DatastarDatalineOnlyIfMissing]: DefaultPatchSignalsOnlyIfMissing,
};

const sseHeaders = {
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "Content-Type": "text/event-stream",
};

/**
 * @param { unknown } obj
 * @return { obj is Record<string, Jsonifiable> }
 */
function isRecord(obj) {
  return typeof obj === "object" && obj !== null;
}


/**
 * ServerSentEventGenerator class, responsible for initializing and handling
 * server-sent events (SSE) as well as reading signals sent by the client.
 *
 * Cannot be instantiated directly, you must use the stream static method.
 */
export class ServerSentEventGenerator {
  /**
   * @type { ReadableStreamDefaultController }
   */
  controller;

  /**
   * @param { ReadableStreamDefaultController } controller
   */
  constructor(controller) {
    this.controller = controller;
  }

  /**
   * Initializes the server-sent event generator and executes the onStart callback.
   *
   * @param { (stream: ServerSentEventGenerator) => Promise<void> | void } onStart - A function that will be passed the initialized ServerSentEventGenerator class as it's first parameter.
   * @param { StreamOptions } [options] - An object that can contain options for the Response constructor onError and onCancel callbacks and a keepalive boolean.
   * The onAbort callback will be called whenever the request is aborted or the stream is cancelled
   *
   * The onError callback will be called whenever an error is met. If provided, the onAbort callback will also be executed.
   * If an onError callback is not provided, then the stream will be ended and the error will be thrown up.
   *
   * If responseInit is provided, then it will be passed to the Response constructor along with the default headers.
   *
   * The stream is always closed after the onStart callback ends.
   * If onStart is non blocking, but you still need the stream to stay open after it is called,
   * then the keepalive option will maintain it open until the request is aborted by the client.
   *
   * @returns { Response } an HTTP Response
   */
  static stream(
    onStart,
    options,
  ) {
    const readableStream = new ReadableStream({
      async start(controller) {
        const generator = new ServerSentEventGenerator(controller);

        try {
          const stream = onStart(generator);
          if (stream instanceof Promise) await stream;
          if (!options?.keepalive) {
            controller.close();
          }
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : "onStart callback threw an error";
          const abortResult = options?.onAbort
            ? options.onAbort(errorMsg)
            : null;

          if (abortResult instanceof Promise) await abortResult;
          if (options && options.onError) {
            const onError = options.onError(error);
            if (onError instanceof Promise) await onError;
            controller.close();
          } else {
            controller.close();
            throw error;
          }
        }
      },
      async cancel(reason) {
        const abortResult = options && options.onAbort
          ? options.onAbort(reason)
          : null;
        if (abortResult instanceof Promise) await abortResult;
      },
    });

    return new Response(
      readableStream,
      {
        ...options?.responseInit,
        headers: {
          ...sseHeaders,
          ...options?.responseInit?.headers,
        },
      },
    );
  }


  /**
   * Validates that the provided mode is a valid ElementPatchMode.
   * @param { string } mode - The mode to validate
   * @throws {Error} If the mode is invalid
   * @returns { asserts mode is ElementPatchMode }
   */
  #validateElementPatchMode(mode) {
    if (!ElementPatchModes.includes(mode)) {
      throw new Error(`Invalid ElementPatchMode: "${mode}". Valid modes are: ${ElementPatchModes.join(', ')}`);
    }
  }


  /**
   * Validates required parameters are not empty or undefined.
   * @param { string | undefined } value - The value to validate
   * @param { string } paramName - The parameter name for error messages
   * @throws {Error} If the value is empty or undefined
   * @returns { asserts value is string }
   */
  #validateRequired(value, paramName) {
    if (!value || value.trim() === '') {
      throw new Error(`${paramName} is required and cannot be empty`);
    }
  }

  /**
   * Sends a server-sent event (SSE) to the client.
   *
   * Runtimes should override this method by calling the parent function
   *  with `super.send(event, dataLines, options)`. That will return all the
   * datalines as an array of strings that should be streamed to the client.
   *
   * @param { EventType } event - The type of the event.
   * @param { string[] } dataLines - Lines of data to send.
   * @param { DatastarEventOptions } [sendOptions] - Additional options for sending events.
   * @returns { string[] }
   */
  send(
    event,
    dataLines,
    options,
  ) {
    const { eventId, retryDuration } = options || {};

    const typeLine = [`event: ${event}\n`];
    const idLine = eventId ? [`id: ${eventId}\n`] : [];
    const retryLine = !retryDuration || retryDuration === 1000 ? [] : [
      `retry: ${retryDuration ?? DefaultSseRetryDurationMs}\n`,
    ];

    const eventLines = typeLine.concat(
      idLine,
      retryLine,
      dataLines.map((data) => {
        return `data: ${data}\n`;
      }),
      ["\n"],
    );

    // Join all lines and encode as a single chunk to avoid extra newlines
    const eventText = eventLines.join('');
    this.controller?.enqueue(new TextEncoder().encode(eventText));

    return eventLines;
  }

  /**
   * Reads client sent signals based on HTTP methods
   *
   * @params { Request } request - The HTTP Request object.
   *
   * @returns { Promise<
    | { success: true; signals: Record<string, Jsonifiable> }
    | { success: false; error: string }
  >} An object containing a success boolean and either the client's signals or an error message.
   */
  static async readSignals(request) {
    try {
      if (request.method === "GET") {
        const url = new URL(request.url);
        const params = url.searchParams;
        if (params.has("datastar")) {
          const signals = JSON.parse(params.get("datastar"));

          if (isRecord(signals)) {
            return { success: true, signals };
          } else throw new Error("Datastar param is not a record");
        } else throw new Error("No datastar object in request");
      }

      const signals = await request.json();

      if (isRecord(signals)) {
        return { success: true, signals: signals };
      }

      throw new Error("Parsed JSON body is not of type record");
    } catch (e) {
      if (isRecord(e) && "message" in e && typeof e.message === "string") {
        return { success: false, error: e.message };
      }

      return { success: false, error: "unknown error when parsing request" };
    }
  }

  /**
   * @param { string } prefix
   * @param { string } data
   */
  #eachNewlineIsADataLine(prefix, data) {
    return data.split("\n").map((line) => {
      return `${prefix} ${line}`;
    });
  }

  /**
   * @param { string } key
   * @param { unknown } val
   * @returns { boolean }
   */
  #hasDefaultValue(key, val) {
    if (key in DefaultMapping) {
      return val === DefaultMapping[key];
    }

    return false;
  }

  /**
   * @param { Record<string, Jsonifiable> } options
   * @returns { string[] }
   */
  #eachOptionIsADataLine(options) {
    return Object.keys(options).filter((key) => {
      return !this.#hasDefaultValue(key, options[key]);
    }).flatMap((key) => {
      return this.#eachNewlineIsADataLine(
        key,
        options[key].toString(),
      );
    });
  }

  /**
   * Patches HTML elements into the DOM.
   *
   * Use this to insert, update, or remove elements in the client DOM. Supports various patch modes and options.
   *
   * Examples:
   * ```
   * // Insert new element inside #container
   * patchElements('<div id="new">Hello</div>', { selector: '#container', mode: 'append' });
   *
   * // Replace element by ID
   * patchElements('<div id="replaceMe">Replaced</div>');
   *
   * // Remove by selector, note that you can also use removeElements
   * patchElements('', { selector: '#toRemove', mode: 'remove' });
   *
   * // Remove by elements with IDs, note that you can also use removeElements
   * patchElements('<div id="first"></div><div id="second"></div>', { mode: 'remove' });
   * ```
   *
   * @param { string } elements - HTML string of elements to patch (must have IDs unless using selector).
   * @param { PatchElementsOptions } [options] - Patch options: selector, mode, useViewTransition, eventId, retryDuration.
   * @returns The SSE lines to send.
   */
  patchElements(elements, options) {
    const { eventId, retryDuration, ...renderOptions } = options || {};

    // Validate patch mode if provided
    /**
     * @type { string }
     */
    const patchMode = renderOptions[DatastarDatalinePatchMode];
    if (patchMode) {
      this.#validateElementPatchMode(patchMode);
    }

    // Check if we're in remove mode with a selector
    /**
     * @type { string }
     */
    const selector = renderOptions[DatastarDatalineSelector];
    const isRemoveWithSelector = patchMode === 'remove' && selector;

    // Validate required parameters - elements only required when not removing with selector
    if (!isRemoveWithSelector) {
      this.#validateRequired(elements, 'elements');
    }

    // Per spec: If no selector specified, elements must have IDs (this validation would be complex
    // and is better handled client-side, but we ensure elements is not empty)
    if (!selector && patchMode === 'remove') {
      // For remove mode, elements parameter may be omitted when selector is supplied
      // but since we have no selector, we need elements with IDs
      if (!elements || elements.trim() === '') {
        throw new Error('For remove mode without selector, elements parameter with IDs is required');
      }
    }

    // Build data lines - skip elements data line if empty in remove mode with selector
    const dataLines = this.#eachOptionIsADataLine(renderOptions);
    if (!isRemoveWithSelector || elements.trim() !== '') {
      dataLines.push(...this.#eachNewlineIsADataLine(DatastarDatalineElements, elements));
    }

    return this.send("datastar-patch-elements", dataLines, {
      eventId,
      retryDuration,
    });
  }

  /**
   * Patches signals into the signal store.
   *
   * Use this to update client-side signals using RFC 7386 JSON Merge Patch semantics.
   *
   * Examples:
   * ```
   * // Patch a single signal
   * patchSignals('{"show": true}');
   *
   * // Patch multiple signals with onlyIfMissing option
   * patchSignals('{"output": "Test", "user": {"name": "Alice"}}', { onlyIfMissing: true });
   * ```
   *
   * @param { string } signals - JSON string containing signal data to patch.
   * @param { PatchSignalsOptions } [options] - Patch options: onlyIfMissing, eventId, retryDuration.
   * @returns The SSE lines to send.
   */
  patchSignals(signals, options) {
    // Validate required parameters
    this.#validateRequired(signals, 'signals');

    const { eventId, retryDuration, ...eventOptions } = options || {};

    const dataLines = this.#eachOptionIsADataLine(eventOptions)
      .concat(this.#eachNewlineIsADataLine(DatastarDatalineSignals, signals));

    return this.send("datastar-patch-signals", dataLines, {
      eventId,
      retryDuration,
    });
  }

  /**
   * Executes a script on the client by sending a <script> tag via SSE.
   *
   * Use this to run JavaScript in the client browser. By default, the script tag will auto-remove after execution.
   *
   * Examples:
   * ```
   * // Execute a simple script
   * executeScript('console.log("Hello from server!")');
   *
   * // Execute a script and keep it in the DOM
   * executeScript('alert("Persistent!")', { autoRemove: false });
   *
   * // Execute with custom attributes (object form preferred)
   * executeScript('doSomething()', { attributes: { type: "module", async: "true" } });
   *
   * // (Advanced) Execute with custom attributes as array of strings
   * executeScript('doSomething()', { attributes: ['type="module"', 'async'] });
   * ```
   * 
   * @typedef { { autoRemove?: boolean; attributes?: string[] | Record<string, string>; eventId?: string; retryDuration?: number; } } ExecuteScriptOptions
   *
   * @param { string } script - The JavaScript code to execute.
   * @param { ExecuteScriptOptions } [options] - Options: autoRemove, attributes (object preferred), eventId, retryDuration.
   * @returns The SSE lines to send.
   */
  executeScript(script, options) {
    const {
      autoRemove = true,
      attributes = {},
      eventId,
      retryDuration,
    } = options || {};

    let attrString = "";

    // Handle attributes as object (preferred by test)
    if (attributes && typeof attributes === "object" && !Array.isArray(attributes)) {
      attrString = Object.entries(attributes)
        .map(([k, v]) => ` ${k}="${v}"`)
        .join("");
    } else if (Array.isArray(attributes)) {
      attrString = attributes.length > 0 ? " " + attributes.join(" ") : "";
    }

    // Only add data-effect if autoRemove is true
    if (autoRemove) {
      attrString += ' data-effect="el.remove()"';
    }

    const scriptTag = `<script${attrString}>${script}</script>`;

    const dataLines = [
      ...this.#eachNewlineIsADataLine("mode", "append"),
      ...this.#eachNewlineIsADataLine("selector", "body"),
      ...this.#eachNewlineIsADataLine("elements", scriptTag),
    ];

    return this.send("datastar-patch-elements", dataLines, {
      eventId,
      retryDuration,
    });
  }

  /**
   * Convenience method to remove elements from the DOM.
   *
   * Provide either a CSS selector (to remove all matching elements) OR an HTML string of elements with IDs (to remove specific elements by ID).
   *
   * - If `selector` is provided, it will be used to target elements for removal (elements param is ignored).
   * - If `selector` is not provided, `elements` must be a non-empty HTML string where each top-level element has an ID.
   *
   * Examples:
   * ```
   *   // Remove by selector
   *   removeElements('#feed, #otherid');
   *   // Remove by HTML elements with IDs
   *   removeElements(undefined, '<div id="first"></div><div id="second"></div>');
   * ```
   *
   * @typedef { { eventId?: string; retryDuration?: number; } } ExecuteScriptOptions
   *
   * @param { string } [selector] - CSS selector for elements to remove (optional; mutually exclusive with elements).
   * @param { string } [elements] - HTML string of elements with IDs to remove (optional; required if selector is not provided).
   * @param { RemoveElementsOptions } [options] - Additional options: eventId, retryDuration.
   * @returns The SSE lines to send.
   */
  removeElements(selector, elements, options) {
    // If selector is not provided, elements must be present and non-empty
    if (!selector && (!elements || elements.trim() === '')) {
      throw new Error('Either selector or elements (with IDs) must be provided to remove elements.');
    }
    return this.patchElements(elements ?? '', {
      selector,
      mode: 'remove',
      eventId: options?.eventId,
      retryDuration: options?.retryDuration,
    });
  }

  /**
   * Convenience method to remove one or more signals from the client signal store.
   *
   * This sends a JSON Merge Patch where each specified key is set to null, per RFC 7386 and the Datastar spec.
   *
   * Examples:
   * ```
   * // Remove a single signal
   * removeSignals('foo');
   *
   * // Remove multiple signals
   * removeSignals(['foo', 'bar']);
   *
   * // Remove with options
   * removeSignals('foo', { eventId: '123' });
   * ```
   *
   * @typedef { { onlyIfMissing?: boolean; eventId?: string; retryDuration?: number; } } RemoveSignalOptions
   *
   * @param { string | string[] } signalKeys - The signal key or array of keys to remove.
   * @param { RemoveSignalOptions } [options] - Patch options: onlyIfMissing, eventId, retryDuration.
   * @returns The SSE lines to send.
   */
  removeSignals(signalKeys, options) {
    const keys = Array.isArray(signalKeys) ? signalKeys : [signalKeys];
    const patch = {};
    for (const key of keys) {
      patch[key] = null;
    }
    return this.patchSignals(JSON.stringify(patch), options);
  }
}

// types.ts
// import {
//   DatastarDatalineElements,
//   DatastarDatalinePatchMode,
//   DatastarDatalineOnlyIfMissing,
//   DatastarDatalineSelector,
//   DatastarDatalineSignals,
//   DatastarDatalineUseViewTransition,
//   DefaultElementPatchMode,
//   DefaultElementsUseViewTransitions,
//   DefaultPatchSignalsOnlyIfMissing,
//   EventTypes,
//   ElementPatchModes,
// } from "./consts.ts";

// Simple Jsonifiable type definition to replace npm:type-fest dependency
/**
 * @typedef { string | number | boolean | null | undefined | Jsonifiable[] | { [key: string]: Jsonifiable }} Jsonifiable
 */

// type ElementPatchMode = typeof ElementPatchModes[number];
// type EventType = typeof EventTypes[number];

// type StreamOptions = Partial<{
//   onError: (error: unknown) => Promise<void> | void;
//   onAbort: (reason?: string) => Promise<void> | void;
//   responseInit: Record<string, unknown>;
//   keepalive: boolean;
// }>

// interface DatastarEventOptions {
//   eventId?: string;
//   retryDuration?: number;
// }

// interface ElementOptions extends DatastarEventOptions {
//   [DatastarDatalineUseViewTransition]?: boolean;
// }

// interface PatchElementsOptions extends ElementOptions {
//   [DatastarDatalinePatchMode]?: ElementPatchMode;
//   [DatastarDatalineSelector]?: string;
// }

// interface patchElementsEvent {
//   event: "datastar-patch-elements";
//   options: PatchElementsOptions;
//   [DatastarDatalineElements]: string;
// }

// interface PatchSignalsOptions extends DatastarEventOptions {
//   [DatastarDatalineOnlyIfMissing]?: boolean;
// }

// interface patchSignalsEvent {
//   event: "datastar-patch-signals";
//   options: PatchSignalsOptions;
//   [DatastarDatalineSignals]: Record<string, Jsonifiable>;
// }

// type MultilineDatalinePrefix =
//   | typeof DatastarDatalineElements
//   | typeof DatastarDatalineSignals;

// type DatastarEventOptionsUnion =
//   | PatchElementsOptions
//   | ElementOptions
//   | PatchSignalsOptions
//   | DatastarEventOptions;

// type DatastarEvent =
//   | patchElementsEvent
//   | patchSignalsEvent;
