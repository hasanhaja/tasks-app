export class EventBus extends EventTarget {
  /**
    * @param { "update" } type
    * @param { Event } event
    */
  emit(type, event) {
    this.dispatchEvent(type, event);
  }
}
