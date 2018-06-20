import {logger} from "../_common/common";
import {GameConfig, parseGameConfigFromURL} from "../_common/config";
import {Options} from "../_common/options";
import {GameMessageInterface, MessageClient} from "../_common/message-client";
import {executeRequestInParent} from "../_common/request";
import {Bundle, Ticket} from "../_common/domain";

const log = logger("zig.client");

export interface BuyTicketOptions {
    // Set to true if the ticket is seen as immediately settled.
    // This is the case for games like sofortlotto - you can not resume a
    // sofortlotto game.
    alreadySettled?: boolean

    // Set to a positive value if more than one ticket or row is requested
    // (e.g. sofort games or maybe sevenup). You can leave this value undefined
    // to use the default value of one.
    quantity?: number

    // Set to a positive value if bet factor is required by a game. A bet factor must
    // be a positive integer. Leave this undefined for the default value of one.
    betFactor?: number
}

export class ZigClient {
    readonly Messages: GameMessageInterface;

    constructor(readonly gameConfig: Readonly<GameConfig> = parseGameConfigFromURL()) {
        const messageClient = new MessageClient(window.parent);
        this.Messages = new GameMessageInterface(messageClient,
            gameConfig.canonicalGameName);
    }

    /**
     * Request a ticket from the platform.
     *
     * @param payload Game input for the requested ticket. In case of sofortlotto, this is the rows
     * the player selected. You can omit this parameter if your game does not require a game input.
     *
     * @param options Additional options to buy the ticket, such as bet factor or quantity.
     */
    public async buyTicket(payload: any = {}, options: BuyTicketOptions = {}): Promise<Ticket> {
        if (Options.winningClassOverride) {
            log.warn("WinningClassOverride set, get a demo ticket instead of a real one.");
            return this.demoTicket(payload, options);
        }

        return this.propagateErrors(async () => {
            const quantity: number = options.quantity || guessQuantity(payload);

            let url = `/product/iwg/${this.gameConfig.canonicalGameName}/tickets?quantity=${quantity}`;
            if (options.betFactor) {
                url += `&betFactor=${options.betFactor}`
            }
            const ticket = await this.request<Ticket>("POST", url, payload);

            this.sendGameStartedEvent(options, ticket);
            return ticket
        });
    }

    /**
     * Request a demo ticket. See buyTicket for more information about the parameters.
     */
    public async demoTicket(payload: any = {}, options: BuyTicketOptions = {}): Promise<Ticket> {
        return this.propagateErrors(async () => {
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

            const ticket = await this.request<Ticket>("POST", url, payload);

            this.sendGameStartedEvent(options, ticket);
            return ticket;
        });
    }

    /**
     * Settles the ticket. You need to specify the id of the ticket that
     * was returned buy buyTicket or demoTicket.
     */
    public async settleTicket(id: string): Promise<void> {
        return await this.propagateErrors(async () => {
            const url = `/product/iwg/${this.gameConfig.canonicalGameName}/tickets/${encodeURIComponent(id)}/settle`;
            await this.request<any>("POST", url);

            this.Messages.ticketSettled();

            return
        });
    }

    public async bundle(bundleKey: number): Promise<Bundle> {
        return await this.propagateErrors(async () => {
            return await this.request<Bundle>("GET", `/iwg/bundles/${bundleKey}`);
        });
    }

    private sendGameStartedEvent(options: BuyTicketOptions, ticket: Ticket) {
        let alreadySettled = options.alreadySettled;
        if (alreadySettled === undefined) {
            alreadySettled = !(ticket.game || {supportsResume: true}).supportsResume;
        }

        this.Messages.gameStarted(ticket.id, ticket.id, alreadySettled === true);
    }

    private async propagateErrors<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn()
        } catch (err) {
            this.Messages.error(err);
            throw err;
        }
    }

    private async request<T>(method: string, url: string, body: any = null, headers: { [key: string]: string } = {}): Promise<T> {
        const result = await executeRequestInParent(this.Messages, {
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

    /**
     * Tracks the height of the current window by checking the position of a marker element.
     * The marker element should be an empty element that is placed directly above the </body> tag.
     * The parameters value must be a selector or a reference to the marker element.
     */
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

            // if we still don't have a marker, we can do nothing.
            if (marker == null) {
                return;
            }

            const markerTop = topOf(marker);
            const difference = Math.abs(markerTop - previousMarkerTop);

            if (difference > 1) {
                previousMarkerTop = markerTop;
                this.Messages.updateGameHeight(markerTop);
            }
        }, 100);
    }


    /**
     * Returns the 'Messages' field. This accessor is deprecated.
     *
     * @deprecated
     */
    public get interface(): GameMessageInterface {
        log.warn("Deprecated use of Zig.Client.interface, please use Zig.Client.Messages");
        return this.Messages
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
