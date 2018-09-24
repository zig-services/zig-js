import {IError, MoneyAmount} from '../_common/domain';
import {
    Command,
    CommandMessageTypes,
    GameStartedMessage,
    MessageClient,
    ParentMessageInterface,
    toErrorValue,
} from '../_common/message-client';
import {Logger} from '../_common/logging';
import {GameSettings} from '../_common/common';
import {appendGameConfigToURL, GameConfig} from '../_common/config';
import {executeRequest, registerRequestListener, Request, Result} from '../_common/request';


export interface UnplayedTicketInfo {
    type: 'BASKET' | 'BUNDLE' | 'PRICE' | 'UNFINISHED'

    // Display name of another game that has bought this ticket
    fromOtherGame?: string;

    // True if this ticket was bought using a basket process and can now be played
    fromBasket?: boolean;
}

export interface CustomerState {
    // Current balance of the customer. This one must be specified.
    balance: MoneyAmount;

    // Set this to true if the customer wont need to pay for the next game.
    hasVoucher?: boolean;

    // Specify a list of unplayed ticket infos of the customer.
    unplayedTicketInfos?: UnplayedTicketInfo[];
}

export interface UIState {
    // State of the main button that the ui shows.
    // Use this as main indicator to decide how to render the UI.
    buttonType: 'none' | 'login' | 'payin' | 'buy' | 'play' | 'unplayed' | 'voucher';

    // If this is true you might offer a demo ticket to the customer.
    allowFreeGame: boolean;

    // The current ticket price.
    ticketPrice: MoneyAmount;

    // True if the ticket price can be adjusted by switching a bet factor in the game
    ticketPriceIsVariable: boolean;

    // Flags if the user is allowed to interact with the overlay
    enabled: boolean;

    // This field is set if the player can continue with an existing ticket.
    unplayedTicketInfo?: UnplayedTicketInfo;
}


/**
 * Throw this instance to cancel the current request/response.
 */
export const CANCELED = {'cancel': true};

export abstract class Connector {
    protected readonly logger: Logger = Logger.get('zig.Connector');

    /**
     * Fetch the current customer state
     */
    public abstract async fetchCustomerState(): Promise<CustomerState>

    /**
     * Ask the customer for permission to pay for the game. The default
     * implementation will always return 'true'.
     */
    public async verifyTicketPurchase(): Promise<boolean> {
        return Promise.resolve(true);
    }

    /**
     * Ensure that the customer has the required balance. You could show
     * a pay in dialog for the customer here. The default implementation will
     * just return 'true' without doing any extra checking.
     */
    public async ensureCustomerBalance(amount: MoneyAmount): Promise<boolean> {
        return Promise.resolve(true);
    }

    /**
     * Show an error dialog to the customer. The method should return only
     * once the dialog closes.
     */
    public async showErrorDialog(error: IError): Promise<void> {
        this.logger.error('An error occurred:', error);
        return Promise.resolve(void 0);
    }

    /**
     * Executes the given http request in the context of the webpage.
     * The default implementation will just do so directly using XMLHttpRequest.
     */
    public async executeHttpRequest(req: Request): Promise<Result> {
        this.logger.debug('Executing http request: ', req);
        return executeRequest(req);
    }

    /**
     * Informs the connector that the game was loaded.
     */
    public onGameLoaded() {
    }

    /**
     * Informs the connector that a game was started.
     */
    public onGameStarted(event: GameStartedMessage) {
    }

    /**
     * A game was settled by the customer
     */
    public onGameSettled() {
    }
}

interface Config {
    price: MoneyAmount;
}

export class Game {
    private readonly logger: Logger;
    private readonly config: Config;

    constructor(private gameWindow: GameWindow,
                private connector: Connector) {

        this.logger = Logger.get(`zig.Game.demo`);

        this.config = {
            price: {
                amountInMinor: 150,
                amountInMajor: 1.5,
                currency: 'EUR',
            },
        };

        this.setupMessageHandlers();
    }

    /**
     * Get the message client to do some raw-communication with the backend.
     */
    public get rawMessageClient(): MessageClient {
        return this.gameWindow.messageClient;
    }

    public async initialize(): Promise<void> {
        const customerState$: Promise<CustomerState> = this.connector.fetchCustomerState();

        // wait for the game-frame to load
        this.logger.info('Wait for game to load...');
        await this.waitForGameEvent('gameLoaded');

        const customerState = await customerState$;
        // check if money is okay.

        this.logger.info('Game was loaded.');
        this.connector.onGameLoaded();
    }

    public async playGame(): Promise<void | null> {
        return this.err<void>(async (): Promise<void> => {
            const customerState = await this.connector.fetchCustomerState();

            this.logger.info('Check if the customer has enough money');
            if (customerState.balance.amountInMinor <= this.config.price.amountInMinor) {
                const okay = await this.connector.ensureCustomerBalance(this.config.price);
                if (!okay) {
                    throw CANCELED;
                }
            }

            this.logger.info('Verify that the customer really wants to buy this game');
            if (!await this.connector.verifyTicketPurchase()) {
                throw CANCELED;
            }

            this.logger.info('Tell the game to buy a ticket');
            this.gameWindow.interface.playGame();

            this.logger.info('Wait for game to start...');
            const gameStartedEvent = await this.waitForGameEvent('gameStarted');
            this.connector.onGameStarted(gameStartedEvent);

            this.logger.info('Wait for game to settle...');
            await this.waitForGameEvent('ticketSettled');
            this.connector.onGameSettled();

            this.logger.info('Wait for game to finish...');
            await this.waitForGameEvent('gameFinished');
            this.connector.onGameSettled();

            return void 0;
        });
    }

    private async err<T>(fn: () => Promise<T>): Promise<T | null> {
        try {
            return await fn();

        } catch (err) {
            if (err === CANCELED) {
                this.logger.info('Current process was canceled.');
                return null;
            }

            const errorValue: IError | null = toErrorValue(err);
            if (errorValue != null) {
                await this.connector.showErrorDialog(errorValue);
            }

            return null;
        }
    }

    private async waitForGameEvent<K extends Command>(type: K): Promise<CommandMessageTypes[K]> {
        return await this.gameWindow.interface.waitFor(type);
    }

    private setupMessageHandlers() {
        registerRequestListener(this.gameWindow.interface, (req: Request): Promise<Result> => {
            return this.connector.executeHttpRequest(req);
        });
    }
}

export interface InstallGameOptions {
    // target container where to place the game
    container: HTMLElement;

    // game url to load
    url: string;

    // game configuration
    gameConfig: GameConfig;

    // the platform connector to speak to.
    connector: Connector;
}

/**
 * Installs the game inside of the given element.
 */
export function installGame(opts: InstallGameOptions): Game {
    // create and insert the game window into the document
    const gameWindow = installGameElement(opts.container, opts.url, opts.gameConfig);

    // let the games begin!
    return new Game(gameWindow, opts.connector);
}

/**
 * A handle to the game window or frame.
 */
export class GameWindow {
    private readonly logger: Logger;

    readonly messageClient: MessageClient;
    readonly interface: ParentMessageInterface;

    constructor(private readonly gameName: string,
                private readonly wrapper: HTMLDivElement,
                private readonly frame: HTMLIFrameElement) {

        this.logger = Logger.get(`zig.GameWindow.${gameName}`);

        const contentWindow = frame.contentWindow;
        if (contentWindow == null) {
            throw new Error('content window of iframe is null.');
        }

        this.logger.debug('Registering event listeners on frame');
        this.messageClient = new MessageClient(contentWindow);
        this.interface = new ParentMessageInterface(this.messageClient, gameName);

        runAsync(async () => {
            await waitUntilChildGetsRemoved(wrapper, frame);
            this.destroy();
        });

        this.interface.registerGeneric({
            updateGameHeight: ev => this.updateGameHeight(ev.height),
            updateGameSettings: ev => this.updateGameSettings(ev.gameSettings),
        });
    }

    public destroy(): void {
        this.logger.debug('Remove event listeners from frame');
        this.messageClient.close();
    }

    private updateGameHeight(height: number): void {
        this.logger.debug(`Updating game height to ${height}px`);
        this.frame.style.height = height + 'px';
    }

    private updateGameSettings(gameSettings: GameSettings): void {
        if (gameSettings.aspect > 0) {
            this.logger.debug('Apply size from game settings:', gameSettings);

            this.wrapper.style.position = 'relative';
            this.wrapper.style.paddingBottom = (100 / gameSettings.aspect) + '%';

            this.frame.style.position = 'absolute';
            this.frame.style.height = '100%';
        }
    }
}

function installGameElement(container: HTMLElement, url: string, gameConfig: GameConfig): GameWindow {
    const frameSource = appendGameConfigToURL(url, gameConfig);

    // The iframe containing the game.
    const frame: HTMLIFrameElement = document.createElement('iframe');
    frame.src = frameSource;
    frame.allowFullscreen = true;
    frame.scrolling = 'no';
    frame.style.display = 'block';
    frame.style.border = '0';
    frame.style.width = '100%';

    // A div wrapping the iframe.
    // This one is used for aspect ratio based scaling of the iframe.
    const wrapper: HTMLDivElement = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.appendChild(frame);

    // and add it to the document
    container.appendChild(wrapper);

    return new GameWindow(gameConfig.canonicalGameName, wrapper, frame);
}


/**
 * Returns a promise that will resolve once the child of the given parent
 * element was removed from the dom tree.
 */
async function waitUntilChildGetsRemoved(parent: HTMLDivElement, child: HTMLIFrameElement): Promise<void> {
    return new Promise<void>(resolve => {
        const mutationObserver = new MutationObserver(mu => {
            for (const record of mu) {
                if (record.type !== 'childList') {
                    continue;
                }

                for (let idx = 0; idx < record.removedNodes.length; idx++) {
                    if (record.removedNodes.item(idx) === child) {
                        mutationObserver.disconnect();
                        resolve(void 0);
                        return;
                    }
                }
            }
        });

        mutationObserver.observe(parent, {childList: true});
    });
}

async function runAsync<T>(param: () => Promise<T>): Promise<T> {
    return param();
}