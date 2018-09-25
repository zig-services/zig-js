import {IError, MoneyAmount} from '../_common/domain';
import {
    Command,
    CommandMessageTypes,
    GameStartedMessage,
    MessageClient,
    ParentMessageInterface,
    TicketPriceChangedMessage,
    toErrorValue,
    Unregister,
} from '../_common/message-client';
import {Logger} from '../_common/logging';
import {GameSettings} from '../_common/common';
import {appendGameConfigToURL, GameConfig} from '../_common/config';
import {executeRequest, registerRequestListener, Request, Result} from '../_common/request';
import TsDeepCopy from 'ts-deepcopy';


export interface UnplayedTicketInfo {
    type: 'BASKET' | 'BUNDLE' | 'PRICE' | 'UNFINISHED'

    // Display name of another game that has bought this ticket
    fromOtherGame?: string;

    // True if this ticket was bought using a basket process and can now be played
    fromBasket?: boolean;
}

export interface AuthorizedCustomerState {
    // Customer is logged in.
    loggedIn: true;

    // Current balance of the customer. This one must be specified.
    balance: MoneyAmount;

    // Set this to true if the customer wont need to pay for the next game.
    hasVoucher?: boolean;

    // Specify a list of unplayed ticket infos of the customer.
    unplayedTicketInfos?: UnplayedTicketInfo[];
}

export type CustomerState = AuthorizedCustomerState | {
    // Customer is not logged in.
    loggedIn: false;
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

    /**
     * Update the ui state.
     */
    public updateUIState(state: UIState, game: Game) {
    }
}

type GameResult = 'success' | 'failure' | 'canceled';

interface Config {
    canonicalGameName: string;
    ticketPrice: MoneyAmount;
}

function moneyScale(amount: MoneyAmount, factor: number): MoneyAmount {
    if (Math.round(factor) !== factor) {
        throw new Error('Can only scale money by an integer value');
    }

    const minor = factor * amount.amountInMinor;
    return {
        currency: amount.currency,
        amountInMinor: minor,
        amountInMajor: 0.01 * minor,
    };
}

type MultiPick<K extends keyof T, T> = { [P in K]: T[P] }

export class Game {
    private readonly logger: Logger;
    private readonly config: Config;

    private uiState: UIState;

    private inGamePurchase: boolean = false;

    // scaling options
    private quantity: number = 1;
    private betFactor: number = 1;

    constructor(private readonly gameWindow: GameWindow,
                private readonly connector: Connector) {

        this.config = {
            canonicalGameName: 'demo',
            ticketPrice: {
                amountInMinor: 150,
                amountInMajor: 1.5,
                currency: 'EUR',
            },
        };

        this.logger = Logger.get(`zig.Game.${this.config.canonicalGameName}`);

        this.uiState = {
            ticketPrice: this.config.ticketPrice,
            ticketPriceIsVariable: false,
            enabled: false,
            allowFreeGame: false,
            buttonType: 'none',
        };

        this.setupMessageHandlers();
    }

    /**
     * Current ticket price.
     * This is the amount that the game would cost right now.
     */
    get currentTicketPrice(): MoneyAmount {
        return moneyScale(this.config.ticketPrice, this.quantity * this.betFactor);
    }

    /**
     * Get the message client to do some raw-communication with the backend.
     */
    public get rawMessageClient(): MessageClient {
        return this.gameWindow.messageClient;
    }

    /**
     * Initializes the game and wait for it to load.
     */
    public async initialize(gameInput?: any): Promise<void> {
        const customerState$: Promise<CustomerState> = this.connector.fetchCustomerState();

        if (gameInput !== undefined) {
            this.logger.info('Got game input, wait for game to request it.');
            await this.waitForGameEvent('requestGameInput');

            this.logger.info('Sending game input to game frame now.');
            this.gameWindow.interface.gameInput(gameInput);
        }

        // wait for the game-frame to load
        this.logger.info('Wait for game to load...');
        const gameLoadedEvent = await this.waitForGameEvent('gameLoaded');

        if (gameLoadedEvent.inGamePurchase) {
            this.logger.info('The game has the \'inGamePurchase\' flag set.');
            this.inGamePurchase = true;
        }

        const customerState = await customerState$;
        // check if money is okay.

        this.logger.info('Game was loaded.');
        this.connector.onGameLoaded();

        const uiStateUpdate: Partial<UIState> = {
            enabled: true,
            unplayedTicketInfo: undefined,
            allowFreeGame: true,
        };

        if (customerState.loggedIn) {
            if (this.inGamePurchase) {
                uiStateUpdate.buttonType = 'play';

            } else if (customerState.unplayedTicketInfos && customerState.unplayedTicketInfos.length) {
                uiStateUpdate.allowFreeGame = false;
                uiStateUpdate.unplayedTicketInfo = customerState.unplayedTicketInfos[0];
                uiStateUpdate.buttonType = 'unplayed';

            } else if (customerState.hasVoucher) {
                uiStateUpdate.allowFreeGame = false;
                uiStateUpdate.buttonType = 'voucher';

            } else if (moneyLessThan(customerState.balance, this.config.ticketPrice)) {
                uiStateUpdate.buttonType = 'buy';
            } else {
                uiStateUpdate.buttonType = 'payin';
            }

        } else {
            uiStateUpdate.buttonType = 'login';
        }

        this.updateUIState(uiStateUpdate);
    }

    public async playGame(): Promise<GameResult> {
        return this.flow(async (): Promise<GameResult> => {
            if (this.inGamePurchase) {
                // jump directly into the game.
                this.gameWindow.interface.prepareGame(false);
                return this.handleInGameBuyGameFlow();
            }

            await this.verifyPreConditions();

            this.logger.info('Tell the game to buy a ticket');
            this.gameWindow.interface.playGame();

            return this.handleNormalGameFlow();
        });
    }

    public async playDemoGame(): Promise<GameResult> {
        return this.flow(async (): Promise<GameResult> => {
            if (this.inGamePurchase) {
                // jump directly into the game.
                this.gameWindow.interface.prepareGame(true);
                return this.handleInGameBuyGameFlow();
            }

            this.logger.info('Tell the game to fetch a demo ticket');
            this.gameWindow.interface.playDemoGame();

            return this.handleNormalGameFlow();
        });
    }

    private async requestStartGame() {
        return this.flow(async (): Promise<GameResult> => {
            try {
                return await this.playGame();

            } catch (err) {
                // in case of errors, we need to tell the game that starting
                // the game failed.
                this.gameWindow.interface.cancelRequestStartGame();

                // continue with the error message
                throw err;
            }
        });
    }

    /**
     * Executes the given flow and catches all error values.
     */
    private async flow(fn: () => Promise<GameResult>): Promise<GameResult> {
        try {
            return await fn();

        } catch (err) {
            if (err === CANCELED) {
                this.logger.info('Current process was canceled.');
                return 'canceled';
            }

            const errorValue: IError | null = toErrorValue(err);
            if (errorValue != null) {
                await this.connector.showErrorDialog(errorValue);
            }

            return 'failure';
        }
    }

    /**
     * Waits for the given game event type.
     * If an error occurs, it will be thrown as an exception.
     */
    private async waitForGameEvent<K extends Command>(type: K): Promise<CommandMessageTypes[K]> {
        const result = await this.waitForGameEvents(type);
        return result[type]!;
    }

    /**
     * Waits for one of the given game events to occur.
     * If an error occurs, it will be thrown as an exception.
     */
    private async waitForGameEvents<K extends keyof CommandMessageTypes>(...types: K[]): Promise<Partial<Pick<CommandMessageTypes, K>>> {
        return new Promise<Partial<Pick<CommandMessageTypes, K>>>((resolve, reject) => {
            const unregister: Unregister[] = [];

            // register event handlers
            types.forEach(k => {
                unregister.push(this.gameWindow.interface.register(k, (event: CommandMessageTypes[K]) => {
                    unregisterAll();

                    const result: Partial<Pick<CommandMessageTypes, K>> = {};
                    result[k] = event;
                    resolve(result);
                }));
            });

            // register a handler for errors
            unregister.push(this.gameWindow.interface.register('error', (error: IError) => {
                unregisterAll();
                reject(error);
            }));

            function unregisterAll() {
                unregister.forEach(fn => fn());
            }
        });
    }

    private setupMessageHandlers(): void {
        registerRequestListener(this.gameWindow.interface, (req: Request): Promise<Result> => {
            return this.connector.executeHttpRequest(req);
        });

        this.gameWindow.interface.registerGeneric({
            requestStartGame: () => this.requestStartGame(),
            ticketPriceChanged: event => this.ticketPriceChanged(event),
        });
    }

    /**
     * Validate that the customer
     */
    private async verifyPreConditions(): Promise<void> {
        const customerState = await this.connector.fetchCustomerState();

        this.logger.info('Check if the customer is logged in');
        if (!customerState.loggedIn) {
            throw CANCELED;
        }

        this.logger.info('Check if the customer has enough money');
        if (moneyLessThan(customerState.balance, this.currentTicketPrice)) {
            const okay = await this.connector.ensureCustomerBalance(this.config.ticketPrice);
            if (!okay) {
                throw CANCELED;
            }
        }

        this.logger.info('Verify that the customer really wants to buy this game');
        if (!await this.connector.verifyTicketPurchase()) {
            throw CANCELED;
        }
    }

    private async handleNormalGameFlow(): Promise<GameResult> {
        this.logger.info('Wait for game to start...');
        const gameStartedEvent = await this.waitForGameEvent('gameStarted');
        this.connector.onGameStarted(gameStartedEvent);

        this.logger.info('Wait for game to settle...');
        await this.waitForGameEvent('ticketSettled');
        this.connector.onGameSettled();

        this.logger.info('Wait for game to finish...');
        await this.waitForGameEvent('gameFinished');
        this.connector.onGameSettled();

        return 'success';
    }

    private async handleInGameBuyGameFlow(): Promise<GameResult> {
        this.logger.info('Wait for player to buy a game');

        while (true) {
            const event = await this.waitForGameEvents('buy', 'gameFinished', 'ticketSettled');
            if (event.gameFinished) {
                return 'success';
            }

            if (event.buy) {
                this.quantity = 1;
                this.betFactor = event.buy.betFactor || 1;
                await this.verifyPreConditions();

                this.logger.info('Tell the game to buy a ticket');
                this.gameWindow.interface.playGame();
            }
        }
    }

    private updateUIState(override: Partial<UIState>): void {
        // update local ui state
        const state = TsDeepCopy(this.uiState);
        Object.assign(state, override);
        this.uiState = state;

        // and publish it
        this.connector.updateUIState(TsDeepCopy(state), this);
    }

    private ticketPriceChanged(event: TicketPriceChangedMessage) {
        if (event.rowCount) {
            this.quantity = event.rowCount;
            this.updateUIState({ticketPrice: this.currentTicketPrice});
        }
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

function moneyLessThan(lhs: MoneyAmount, rhs: MoneyAmount): boolean {
    return lhs.amountInMinor < rhs.amountInMinor;
}
