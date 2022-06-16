
export class VexEventEmitter {
    handlers: { [key: string | symbol]: ((...args: any[]) => void)[] };

    constructor() {
        this.handlers = {};
    }
    on(eventName: string | symbol, listener: (...args: any[]) => void) {
        this.handlers[eventName] = this.handlers[eventName] || [];
        this.handlers[eventName].push(listener);
    }
    remove(eventName: string | symbol, listener: (...args: any[]) => void) {
        this.handlers[eventName] = this.handlers[eventName] || [];

        let index = this.handlers[eventName].indexOf(listener);
        if (index > -1) {
            this.handlers[eventName].splice(index, 1);
        }
    }
    emit(eventName: string | symbol, data: any) {
        (this.handlers[eventName] || []).forEach((callback => {
            callback(data);
        }))
    }
    clearListeners() {
        Object.keys(this.handlers).forEach((e => {
            delete this.handlers[e];
        }))
    }
}

export class VexEventTarget {
    emitter: VexEventEmitter;

    constructor() {
        this.emitter = new VexEventEmitter();
    }
    emit(eventName: string | symbol, data: any) {
        this.emitter.emit(String(eventName), data);
    }
    on(eventName: string | symbol, listener: (...args: any[]) => void) {
        this.emitter.on(String(eventName), listener);
    }
    remove(eventName: string | symbol, listener: (...args: any[]) => void) {
        this.emitter.remove(String(eventName), listener);
    }
    clearListeners() {
        this.emitter.clearListeners();
    }
}