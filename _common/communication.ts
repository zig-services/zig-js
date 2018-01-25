type CommandType = string

interface IMessage {
    command: CommandType;

    // message specific payload
    [key: string]: any;
}

class PostMessageCommunication {
    private readonly eventHandler: (ev) => void;
    private readonly handlers: { [key: string]: ((msg: IMessage) => void)[]; } = {};

    constructor(private partnerWindow: Window) {
        this.eventHandler = ev => this.handleEvent(ev);
        window.addEventListener("message", this.eventHandler);
    }

    public close(): void {
        window.removeEventListener("message", this.eventHandler);
    }

    public send(message: IMessage): void {
        this.partnerWindow.postMessage(message, "*");
    }

    public sendError(err: any): void {
        const errorValue = toErrorValue(err);
        if (errorValue != null) {
            this.partnerWindow.postMessage(errorValue, "*");
        }
    }

    public register<T extends IMessage>(commandType: CommandType, handler: (message: T) => void) {
        this.handlers[commandType] = (this.handlers[commandType] || []).concat(handler);
    }

    public registerWildcard(handler: (message: IMessage) => void): void {
        this.register("*" as CommandType, handler);
    }

    private handleEvent(ev: MessageEvent): void {
        const commandType = (ev.data || {}).command || ev.data;

        if (typeof commandType !== "string") {
            return;
        }

        const message: IMessage = typeof ev.data === "string" ? {command: commandType} : ev.data;

        // now dispatch to the registered handlers and to all wildcard handlers.
        this.dispatch(message, this.handlers[commandType] || []);
        this.dispatch(message, this.handlers["*"] || []);
    }

    private dispatch(message: IMessage, handlers: ((msg: IMessage) => void)[]) {
        handlers.forEach(handler => {
            try {
                handler(message);
            } catch (err) {
                log("Error in handling message %s: %s", message, err);
            }
        })
    }
}

/**
 * Tries to make sense of the response of a request.
 */
function toErrorValue(err: any): IError | null {
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

    if (typeof err.responseText === "string") {
        try {
            const parsed = JSON.parse(err.responseText);
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
