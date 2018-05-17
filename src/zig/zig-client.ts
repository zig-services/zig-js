import {ITicket, logger} from "../_common/common";
import {IGameConfig, parseGameConfigFromURL} from "../_common/config";
import {Options} from "../_common/options";
import {GameMessageInterface, MessageClient} from "../_common/message-client";
import {executeRequestInParent} from "../_common/request";

const log = logger("[zig-client]");

export interface BuyTicketOptions {
    // Set to true if the ticket is seen as immediately settled.
    alreadySettled?: boolean

    // Set to a positive value if more than one ticket is requested (e.g. sofort games)
    quantity?: number

    // Set to a positive value if bet factor is required by a game.
    betFactor?: number
}

export class ZigClient {
    readonly interface: GameMessageInterface;

    constructor(readonly gameConfig: Readonly<IGameConfig> = parseGameConfigFromURL()) {
        const messageClient = new MessageClient(window.parent);
        this.interface = new GameMessageInterface(messageClient,
            gameConfig.canonicalGameName);
    }

    public async buyTicket(payload: any = {}, options: BuyTicketOptions = {}): Promise<ITicket> {
        return await this.propagateErrors(async () => {
            const quantity: number = options.quantity || guessQuantity(payload);

            let url = `/product/iwg/${this.gameConfig.canonicalGameName}/tickets?quantity=${quantity}`;
            if (options.betFactor) {
                url += `&betFactor=${options.betFactor}`
            }
            const ticket = await this.request<ITicket>("POST", url, payload);

            this.sendGameStartedEvent(options, ticket);
            return ticket
        });
    }

    public async demoTicket(payload: any = {}, options: BuyTicketOptions = {}): Promise<ITicket> {
        return await this.propagateErrors(async () => {
            const quantity: number = options.quantity || guessQuantity(payload);

            let url = `/product/iwg/${this.gameConfig.canonicalGameName}/demo?quantity=${quantity}`;

            if (Options.winningClassOverride) {
                // append extra config parameters if the winning class
                url += `&wc=${Options.winningClassOverride.winningClass}`;
                url += `&scenarioId=${Options.winningClassOverride.scenarioId}`;
            }
            if (options.betFactor) {
                url += `&betFactor=${options.betFactor}`
            }

            const ticket = await this.request<ITicket>("POST", url, payload);

            this.sendGameStartedEvent(options, ticket);
            return ticket;
        });
    }

    private sendGameStartedEvent(options: BuyTicketOptions, ticket: ITicket) {
        let alreadySettled = options.alreadySettled;
        if (alreadySettled === undefined) {
            alreadySettled = !(ticket.game || {supportsResume: true}).supportsResume;
        }

        this.interface.gameStarted(ticket.id, ticket.id, alreadySettled === true);
    }

    public async settleTicket(id: string): Promise<void> {
        return await this.propagateErrors(async () => {
            const url = `/product/iwg/${this.gameConfig.canonicalGameName}/tickets/${encodeURIComponent(id)}/settle`;
            await this.request<any>("POST", url);

            this.interface.ticketSettled();

            return
        });
    }

    private async propagateErrors<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn()
        } catch (err) {
            this.interface.error(err);
            throw err;
        }
    }

    private async request<T>(method: string, url: string, body: any = null, headers: { [key: string]: string } = {}): Promise<T> {
        const result = await executeRequestInParent(this.interface, {
            method,
            path: url,
            body: body === null ? null : JSON.stringify(body),
            headers: headers,
        });

        if (Math.floor(result.statusCode / 100) === 2) {
            return JSON.parse(result.body || "null");
        } else {
            throw result;
        }
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
                marker = document.querySelector(markerOrSelector) as HTMLElement;
            }

            // if we still don't have a marker, we'll fail.
            if (marker == null) {
                return;
            }

            const markerTop = topOf(marker);
            const difference = Math.abs(markerTop - previousMarkerTop);

            if (difference > 1) {
                previousMarkerTop = markerTop;
                this.interface.updateGameHeight(markerTop);
            }
        }, 100);
    }
}

function guessQuantity(payload: any | undefined): number {
    if (payload != null && typeof payload === "object") {
        if (payload.rows && payload.rows.length) {
            // sofortlotto like payload
            return payload.rows.length;
        }
    }

    return 1;
}
