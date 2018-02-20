import {isLegacyGame, patchLegacyGame} from "./zig-legacy";
import {IGameConfig, ITicket, logger} from "../_common/common";
import {MessageClient, toErrorValue} from "../_common/message-client";
import {objectAssignPolyfill} from "../_common/polyfill";
import {buildTime, clientVersion} from "../_common/vars";
import {delegateToVersion} from "../_common/delegate";

const log = logger("[zig-client]");

function guessQuantity(payload: any | undefined): number {
    if (payload != null && typeof payload === "object") {
        if (payload.rows && payload.rows.length) {
            // sofortlotto like payload
            return payload.rows.length;
        }
    }

    return 1;
}

export interface BuyTicketOptions {
    // Set to true if the ticket is seen as immediately settled.
    alreadySettled?: boolean

    // Set to a positive value if more than one ticket is requested (e.g. sofort games)
    quantity?: number
}

class ZigClient {
    private readonly messageClient: MessageClient;

    constructor(private gameConfig: IGameConfig) {
        this.messageClient = new MessageClient(window.parent);
    }

    public async buyTicket(payload: any = {}, options: BuyTicketOptions = {}): Promise<ITicket> {
        return await this.propagateErrors(async () => {
            const quantity: number = options.quantity || guessQuantity(payload);

            const url = this.gameConfig.endpoint + "/tickets?quantity=" + quantity;
            const ticket = await this.request<ITicket>("POST", url, payload);

            this.sendGameStartedEvent(options, ticket);

            return ticket
        });
    }

    public async demoTicket(payload: any = {}, options: BuyTicketOptions = {}): Promise<ITicket> {
        return await this.propagateErrors(async () => {
            const quantity: number = options.quantity || guessQuantity(payload);

            const url = this.gameConfig.endpoint + "/demo?quantity=" + quantity;
            let ticket = await this.request<ITicket>("POST", url, payload);

            this.sendGameStartedEvent(options, ticket);

            return ticket;
        });
    }

    private sendGameStartedEvent(options: BuyTicketOptions, ticket: ITicket) {
        let alreadySettled = options.alreadySettled;
        if (alreadySettled === undefined) {
            alreadySettled = !(ticket.game || {supportsResume: true}).supportsResume;
        }

        this.messageClient.send({
            command: "gameStarted",
            ticket: ticket,
            alreadySettled: !!alreadySettled,
        });
    }

    public async settleTicket(id: string): Promise<void> {
        return await this.propagateErrors(async () => {
            const url = this.gameConfig.endpoint + "/tickets/" + encodeURIComponent(id) + "/settle";
            const response = await this.request<any>("POST", url);

            this.messageClient.send({
                command: "gameSettled",
                response: response,
            });

            return
        });
    }

    private async propagateErrors<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn()
        } catch (err) {
            this.messageClient.sendError(err);
            throw err;
        }
    }

    private async request<T>(method: string, url: string, body: any = null): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const req = new XMLHttpRequest();

            req.onreadystatechange = () => {
                if (req.readyState === XMLHttpRequest.DONE) {
                    if (Math.floor(req.status / 100) === 2) {
                        resolve(JSON.parse(req.responseText || "null"));
                    } else {
                        reject(toErrorValue(req));
                    }
                }
            };

            req.withCredentials = (this.gameConfig.withCredentials === true);

            req.open(method, url, true);

            // forward the requested headers
            for (const headerName of Object.keys(this.gameConfig.headers)) {
                const headerValue = this.gameConfig.headers[headerName];
                log(headerName, headerValue);
                req.setRequestHeader(headerName, headerValue);
            }

            req.send(body !== null ? JSON.stringify(body) : null);
        });
    }

    public trackGameHeight(markerOrSelector: HTMLElement | string): void {
        let previousMarkerTop = 0;

        function topOf(element: HTMLElement): number {
            const top = element.offsetTop;
            if (!element.offsetParent) {
                return top;
            }

            return topOf(<HTMLElement>element.offsetParent) + element.offsetTop;
        }

        let marker: HTMLElement | null = null;
        if (typeof markerOrSelector !== "string") {
            marker = markerOrSelector;
        }

        window.setInterval(() => {
            // if we don't have a marker yet, we'll look for it
            if (marker == null && typeof markerOrSelector === "string") {
                marker = document.querySelector(markerOrSelector);
            }

            // if we still don't have a marker, we'll fail.
            if (marker == null) {
                return;
            }

            const markerTop = topOf(marker);
            const difference = Math.abs(markerTop - previousMarkerTop);

            if (difference > 1) {
                previousMarkerTop = markerTop;
                this.publishMessage("updateGameHeight", {height: markerTop});
            }
        }, 100);
    }

    private publishMessage(command: string, extras: object): void {
        const message = Object.assign({command}, extras);
        log("Publishing message ", message);
        window.parent.postMessage(message, "*");
    }
}

/**
 * Extracts the game config from the pages url.
 * Throws an error if extraction is not possible.
 */
function extractGameConfig(): IGameConfig {
    const match = /\?.*\bconfig=([a-zA-Z0-9+-]+=*)/.exec(location.href);
    if (match == null) {
        throw new Error("no config parameter found")
    }

    const config: IGameConfig = JSON.parse(atob(match[1]));
    if (!config) {
        throw new Error("config is empty");
    }

    if (config.endpoint == null) {
        throw new Error("endpoint not set in config")
    }

    config.headers = config.headers || {};
    return config;
}

class UpdatingGameConfig implements IGameConfig {
    endpoint: string;
    headers: { [p: string]: string };

    constructor(config: IGameConfig) {
        Object.assign(this, config);

        const messageClient = new MessageClient(window.parent);
        messageClient.register("updateRequestHeaders", message => {
            if (typeof message.headers === "object") {
                this.headers = message.headers;
            }
        });
    }
}

function main() {
    // initialize Object.assign polyfill for ie11.
    objectAssignPolyfill();

    const gameConfig = new UpdatingGameConfig(extractGameConfig());

    if (isLegacyGame()) {
        log("Enable legacy game patches");
        patchLegacyGame(gameConfig);
    }

    // expose types to user of this library
    window["ZigMessageClient"] = MessageClient;
    window["ZigClient"] = new ZigClient(gameConfig);
}

if (!delegateToVersion("zig.min.js")) {
    if (window.console && console.log) {
        console.log("");
        console.log(`[zig] Initializing zig client in version ${clientVersion}`);
        console.log(`[zig] compiled ${(Date.now() - buildTime) / 1000.0}sec ago`);
        console.log("");
    }

    main();
}