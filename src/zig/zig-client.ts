import {GameConfig, parseGameConfigFromURL} from '../_common/config';
import {Options} from '../_common/options';
import {GameMessageInterface, MessageClient} from '../_common/message-client';
import {executeRequestInParent} from '../_common/request';
import {Bundle, Ticket} from '../_common/domain';
import {Logger} from '../_common/logging';

const log = Logger.get('zig.client');

export interface BasketItem {
    // game name, e.g. bingo
    canonicalGameName: string

    // Für must be >= 1
    betFactor?: number

    // must be >= 1
    quantity?: number;

    // additional game input for sofortlotto or kenow encoded as bas64
    gameInput?: string

}

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

export interface ZigClient {
    /**
     * Exposes access to the raw message interface for event sending.
     */
    readonly Messages: GameMessageInterface;

    /**
     * The configuration object.
     */
    readonly gameConfig: Readonly<GameConfig>;

    /**
     * Request a ticket from the platform. Hold on to the returned ticket instance, you need
     * that one later. This method will also send a gameStarted message to the parent frame.
     *
     * @param payload Game input for the requested ticket. In case of sofortlotto, this is the rows
     * the player selected. You can omit this parameter if your game does not require a game input.
     *
     * @param options Additional options to buy the ticket, such as bet factor or quantity.
     */
    buyTicket(payload?: any, options?: BuyTicketOptions): Promise<Ticket>;

    /**
     * Put a basket into the webshops ticket.
     */
    buyBasketTickets(items: BasketItem[]): Promise<void>;

    /**
     * Request a demo ticket. See buyTicket for more information about the parameters.
     * This method will also send a gameStarted message to the parent frame.
     */
    demoTicket(payload?: any, options?: BuyTicketOptions): Promise<Ticket>;

    /**
     * Finishes a previously played ticket. You need to pass the 'id' field of the ticket
     * you received back in buyTicket or demoTicket. This will also send a ticketSettled message
     * back to the parent frame.
     *
     * @param id The ticket id.
     */
    settleTicket(id: string): Promise<void>;

    /**
     * Queries for the given bundle information. This is used in some of our games
     * to offer extended functionality.
     */
    bundle(bundleKey: number): Promise<Bundle>

    /**
     * Observes and tracks the position of the given marker element. Every time the
     * position changes an updateGameHeight message containing the new position
     * will be send to the parent to adjust the game frames height.
     */
    trackGameHeight(markerOrSelector: HTMLElement | string): void
}

export class ZigClientImpl implements ZigClient {
    readonly Messages: GameMessageInterface;

    constructor(readonly gameConfig: Readonly<GameConfig> = parseGameConfigFromURL()) {
        const messageClient = new MessageClient(window.parent);

        // start communication
        this.Messages = new GameMessageInterface(messageClient,
            gameConfig.canonicalGameName);
    }


    public async buyTicket(payload: any = {}, options: BuyTicketOptions = {}): Promise<Ticket> {
        if (Options.winningClassOverride) {
            log.warn('WinningClassOverride set, get a demo ticket instead of a real one.');
            return this.demoTicket(payload, options);
        }

        return this.propagateErrors(async () => {
            const quantity: number = options.quantity || guessQuantity(payload);

            let url = `/zig/games/${this.gameConfig.canonicalGameName}/tickets:buy?quantity=${quantity}`;
            if (options.betFactor) {
                url += `&betFactor=${options.betFactor}`;
            }
            const ticket = await this.request<Ticket>('POST', url, payload);

            this.sendGameStartedEvent(options, ticket);
            return ticket;
        });
    }

    /**
     * Puts multiple tickets of same game into the basket.
     *
     * @param items Items that should be added to the basket.
     */
    public async buyBasketTickets(items: BasketItem[]): Promise<void> {
        return this.propagateErrors(async () => {
            await this.request<any>('POST',
                `/zig/games/${this.gameConfig.canonicalGameName}/tickets:basket`,
                items, {'Content-Type': 'application/json'});

            if (this.gameConfig.basketPurchaseRedirect != null) {
                this.Messages.gotoUrl(this.gameConfig.basketPurchaseRedirect);
            }
        });
    }

    public async demoTicket(payload: any = {}, options: BuyTicketOptions = {}): Promise<Ticket> {
        return this.propagateErrors(async () => {
            const quantity: number = options.quantity || guessQuantity(payload);

            let url = `/zig/games/${this.gameConfig.canonicalGameName}/tickets:demo?quantity=${quantity}`;

            if (Options.winningClassOverride) {
                // append extra config parameters if the winning class
                url += `&wc=${Options.winningClassOverride.winningClass}`;
                url += `&scenario=${Options.winningClassOverride.scenarioId}`;
            }

            if (options.betFactor) {
                url += `&betFactor=${options.betFactor}`;
            }

            const ticket = await this.request<Ticket>('POST', url, payload);

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
            const url = `/zig/games/${this.gameConfig.canonicalGameName}/tickets:settle/${encodeURIComponent(id)}`;
            await this.request<any>('POST', url);

            this.Messages.ticketSettled();

            return;
        });
    }

    public async bundle(bundleKey: number): Promise<Bundle> {
        return await this.propagateErrors(async () => {
            return await this.request<Bundle>('GET', `/zig/bundles/${bundleKey}`);
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
            return await fn();
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
            return JSON.parse(result.body || 'null');
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

        // get the marker element
        let marker: HTMLElement | null = null;
        if (typeof markerOrSelector !== 'string') {
            marker = markerOrSelector;
        }

        const messageClient = this.Messages;

        function checkOnce() {
            // if we don't have a marker yet, we'll look for it
            if (marker == null && typeof markerOrSelector === 'string') {
                marker = document.querySelector(markerOrSelector) as HTMLElement;
            }

            // if we still don't have a marker, we can do nothing.
            if (marker == null) {
                return;
            }

            // get the new position and difference to the old one
            const markerTop = marker.getBoundingClientRect().top;
            const difference = Math.abs(markerTop - previousMarkerTop);

            // and send an update if the position changed by more than one pixel.
            if (difference > 1) {
                previousMarkerTop = markerTop;
                messageClient.updateGameHeight(markerTop);

                // check in the next frame again
                requestAnimationFrame(checkOnce);
            }
        }

        // start the first check right now
        checkOnce();

        // and schedule periodic checks
        window.setInterval(checkOnce, 100);
    }

    /**
     * Returns the 'Messages' field. This accessor is deprecated.
     *
     * @deprecated
     */
    public get interface(): GameMessageInterface {
        log.warn('Deprecated use of Zig.Client.interface, please use Zig.Client.Messages');
        return this.Messages;
    }
}

function guessQuantity(payload: any | undefined): number {
    if (payload != null && typeof payload === 'object') {
        if (payload.rows && payload.rows.length) {
            // sofortlotto like payload
            return payload.rows.length;
        }
    }

    return 1;
}
