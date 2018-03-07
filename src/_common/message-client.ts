import {IError, logger} from "./common";

export type CommandType = string

export interface IMessage {
    command: CommandType;

    // message specific payload
    [key: string]: any;
}

const log = logger("[zig-msg]");

export class MessageClient {
    private readonly eventHandler: (ev) => void;
    private readonly handlers: { [key: string]: ((msg: IMessage) => void)[]; } = {};

    constructor(private partnerWindow: Window) {
        this.eventHandler = ev => this.handleEvent(ev);
        window.addEventListener("message", this.eventHandler);
    }

    public close(): void {
        window.removeEventListener("message", this.eventHandler);
    }

    public send(message: any): void {
        if (message == null) {
            return;
        }

        log(`Send message of type ${message.command || message}`, message);
        this.partnerWindow.postMessage(message, "*");
    }

    public sendError(err: any): void {
        const errorValue = toErrorValue(err);
        if (errorValue != null) {
            log("Sending error value:", errorValue);
            this.partnerWindow.postMessage(errorValue, "*");
        }
    }

    public register<T extends IMessage>(commandType: CommandType, handler: (message: T) => void) {
        this.handlers[commandType] = (this.handlers[commandType] || []).concat(handler);
    }

    public unregister<T extends IMessage>(commandType: CommandType, handler: (message: T) => void) {
        this.handlers[commandType] = (this.handlers[commandType] || []).filter(h => h !== handler);
    }

    public registerWildcard(handler: (message: IMessage) => void): void {
        this.register("*" as CommandType, handler);
    }

    private handleEvent(ev: MessageEvent): void {
        if (ev.source !== this.partnerWindow) {
            return;
        }

        let commandType = typeof ev.data === "string" ? ev.data : (ev.data || {}).command;
        if (commandType == null && ev.data && ev.data.type != null) {
            commandType = "error";
        }

        if (typeof commandType !== "string") {
            return;
        }

        const message = ev.data;

        // now dispatch to the registered handlers and to all wildcard handlers.
        const handlers = this.handlers[commandType] || [];
        if (handlers && handlers.length) {
            this.dispatch(message, handlers);
        } else {
            this.dispatch(message, this.handlers["*"] || []);
        }
    }

    private dispatch(message: IMessage, handlers: ((msg: IMessage) => void)[]) {
        handlers.forEach(handler => {
            try {
                handler(message);
            } catch (err) {
                log(`Error in handling message ${message}:`, err);
            }
        })
    }
}

/**
 * Tries to make sense of the response of a request.
 */
export function toErrorValue(err: any): IError | null {
    if (err == null) {
        return null;
    }

    if (err.type && err.title && err.status !== undefined && err.details !== undefined) {
        return err;
    }

    if (typeof err.type === "string" && typeof err.message === "string") {
        return {
            type: "urn:x-tipp24:remote-client-error",
            title: "Remote error",
            status: err.type,
            details: err.message,
        }
    }

    const responseText = err.responseText || err.body;

    if (typeof responseText === "string") {
        try {
            const parsed = JSON.parse(responseText);
            if (parsed.error && parsed.status) {
                return {
                    type: "urn:x-tipp24:remote-client-error",
                    title: "Remote error",
                    details: parsed.error,
                    status: parsed.status
                }
            }

            // looks like a properly formatted error
            if (parsed.type && parsed.title && parsed.details) {
                return <IError> parsed;
            }
        } catch {
            // probably json decoding error, just continue with a default error.
        }
    }

    return {
        type: "urn:x-tipp24:remote-client-error",
        title: "Remote error",
        status: 500,
        details: err.toString(),
    }
}
