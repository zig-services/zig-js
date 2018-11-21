import '../common/polyfills';

import {IError, IMoneyAmount, MoneyAmount} from '../common/domain';
import {GameLoadedMessage, MessageClient, ParentMessageInterface, toErrorValue} from '../common/message-client';
import {Logger} from '../common/logging';
import {registerRequestListener} from '../common/request';
import {BaseCustomerState, CANCELED, Connector, CustomerState, GameRequest, UIState} from './connector';
import {GameWindow} from './game-window';
import {GameSettings} from '../common/config';
import {FullscreenService} from './fullscreen';
import {deepFreezeClone} from '../common/common';

type GameResult = 'success' | 'failure' | 'canceled';

interface Config {
    canonicalGameName: string;
    ticketPrice: IMoneyAmount;
}

interface Scaling {
    betFactor: number;
    quantity: number;
}

type InitGame = (scaling: Scaling) => Promise<void>

/**
 * Holds all information about the costs of a ticket.
 */
class TicketPrice {
    constructor(
        readonly baseNormalTicketPrice: MoneyAmount,
        readonly baseDiscountedTicketPrice: MoneyAmount,
        readonly betFactor: number, readonly quantity: number) {
    }

    /**
     * The ticket price that the customer needs to pay. This one has
     * is the discounted ticket price as a base and scales it by bet factor and quantity.
     */
    get customerTicketPrice(): MoneyAmount {
        return this.baseDiscountedTicketPrice.scaled(this.betFactor * this.quantity);
    }
}

export class Game {
    private readonly logger: Logger;
    private readonly config: Config;

    private readonly fullscreenService: FullscreenService;

    // the ui state. Should not be modified directly, always use "updateUIState"
    private _uiState?: Readonly<UIState>;

    // the game wants to use inGamePurchase
    private _gameSettings?: GameSettings;

    // set to true to disable further free games.
    private disallowFreeGames: boolean = false;

    constructor(private readonly gameWindow: GameWindow,
                private readonly connector: Connector) {

        this.fullscreenService = new FullscreenService(gameWindow.wrapper);

        this.config = {
            canonicalGameName: 'demo',
            ticketPrice: MoneyAmount.of(150, 'EUR'),
        };

        this.logger = Logger.get(`zig.Game.${this.config.canonicalGameName}`);

        // publish initial ui state to hide any ui there is. We define it as a variable here to
        // ensure that we don't miss any initial values.
        const baseUIState: UIState = {
            ticketPriceIsVariable: false,
            enabled: false,
            allowFreeGame: false,
            buttonType: 'loading',
            normalTicketPrice: MoneyAmount.of(this.config.ticketPrice).scaled(0),
            isFreeGame: false,
            busy: false,
        };

        this.updateUIState(baseUIState);

        this.setupMessageHandlers();
    }

    /**
     * Initializes the game and wait for it to load.
     */
    public async initialize(gameInput?: any): Promise<void> {
        await this.flow(async (): Promise<GameResult> => {
            const customerState$: Promise<CustomerState> = this.connector.fetchCustomerState();

            this.logger.info('Wait for game settings');
            const gameSettingsEvent = await this.interface.waitForGameEvent('updateGameSettings');

            this._gameSettings = gameSettingsEvent.gameSettings;

            // We can only do purchaseInGame if we requesting chromeless mode.
            if (this.gameSettings.chromeless && !this.gameSettings.purchaseInGame) {
                throw new Error('gameSettings.chromeless implies gameSettings.purchaseInGame');
            }

            if (gameInput !== undefined) {
                this.logger.info('Got game input, wait for game to request it.');
                await this.interface.waitForGameEvent('requestGameInput');

                this.logger.info('Sending game input to game frame now.');
                this.gameWindow.interface.gameInput(gameInput);
            }

            // wait for the game-frame to load
            this.logger.info('Wait for game to load...');

            const gameLoadedEvent = await this.interface.waitForGameEvent('gameLoaded');
            verifyInGamePurchaseFlag(this.gameSettings, gameLoadedEvent);

            const customerState = await customerState$;

            if (customerState.loggedIn && MoneyAmount.isNotZero(customerState.voucher)) {
                this.logger.info('Send voucher info to game.');
                this.interface.newVoucher(customerState.voucher.amountInMinor);
            }

            this.logger.info('Game was loaded.');
            this.connector.onGameLoaded();

            this.resetUIState(customerState);

            if (this.gameSettings.chromeless) {
                // spawn the gameloop in background
                void this.startChromelessGameLoop();
            }

            return 'success';
        }, false);
    }

    private get gameSettings(): GameSettings {
        if (!this._gameSettings) {
            throw new Error('gameSettings not yet set.');
        }

        return this._gameSettings!;
    }

    private setupMessageHandlers(): void {
        registerRequestListener(this.gameWindow.interface, req => {
            let request = req;
            try {
                const parsedGameRequest = parseGameRequestFromInternalPath(req.path);
                const requestPath = this.connector.buildRequestPath(parsedGameRequest);
                if (requestPath) {
                    request = {...request, path: requestPath};
                    this.logger.info(`Rewritten request path to: ${request.path}`);
                }

            } catch (err) {
                this.logger.warn(`Could not parse path ${req.path}: ${err}`);
            }

            return this.connector.executeHttpRequest(request);
        });
    }

    /**
     * Get the message client to do some raw-communication with the backend.
     */
    public get rawMessageClient(): MessageClient {
        return this.gameWindow.messageClient;
    }

    /**
     * Access to the communications interface
     */
    private get interface(): ParentMessageInterface {
        return this.gameWindow.interface;
    }

    /**
     * Returns true if the service should try to jump into fullscreen mode.
     */
    private get allowFullscreen(): boolean {
        if (this.gameSettings.chromeless) {
            // never allow fullscreen for chromeless games.
            return false;
        }

        return this.connector.allowFullscreen;
    }

    public async playGame(): Promise<GameResult> {
        return this.play(false, async scaling => {
            await this.verifyPreConditions(scaling);

            this.logger.info('Tell the game to buy a ticket');
            this.gameWindow.interface.playGame();
        });
    }

    public async playDemoGame(): Promise<GameResult> {
        return this.play(true, async () => {
            this.logger.info('Tell the game to fetch a demo ticket');
            this.gameWindow.interface.playDemoGame();
        });
    }

    private async play(demoGame: boolean, initGame: InitGame): Promise<GameResult> {
        // disable the button to prevent double click issues-
        this.updateUIState({enabled: false, isFreeGame: demoGame});

        return this.flow(async (): Promise<GameResult> => {
            if (this.gameSettings.purchaseInGame) {
                return this.handlePurchaseInGameGameFlow(demoGame, initGame);
            } else {
                return this.handleSingleRoundGameFlow(initGame);
            }
        });
    }

    private async handleSingleRoundGameFlow(initGame: InitGame): Promise<GameResult> {
        // always run with a unity quantity
        await initGame({quantity: 1, betFactor: 1});

        // show the ui as busy
        this.updateUIState({busy: true});

        // goto fullscreen
        if (this.allowFullscreen) {
            this.fullscreenService.enable();
        }

        this.logger.info('Wait for game to start...');
        const gameStartedEvent = await this.interface.waitForGameEvent('gameStarted');
        this.connector.onGameStarted(gameStartedEvent);

        // hide the ui
        this.updateUIState({busy: false, buttonType: 'none'});

        this.logger.info('Wait for game to settle...');
        await this.interface.waitForGameEvent('ticketSettled');
        this.connector.onGameSettled();

        this.logger.info('Wait for game to finish...');
        await this.interface.waitForGameEvent('gameFinished');

        return 'success';
    }

    private async handlePurchaseInGameGameFlow(demoGame: boolean, initGame: InitGame): Promise<GameResult> {
        // hide ui
        this.updateUIState({buttonType: 'none'});

        // go to fullscreen mode
        if (this.allowFullscreen) {
            this.fullscreenService.enable();
        }

        // check if the customer has an unplayed ticket he wants to resume
        const state = await this.connector.fetchCustomerState();
        let requirePrepareGame: boolean = !state.loggedIn || !state.unplayedTicketInfos
            || state.unplayedTicketInfos.length === 0;

        if (requirePrepareGame) {
            // jump directly into the game.
            this.logger.info('Set the game into prepare mode');
            this.gameWindow.interface.prepareGame(demoGame);

            this.logger.info('Wait for player to start a game');
        }

        // Need to keep the options around. After getting a ticketPriceChanged method with
        // a quantity, it is possible for the game to send one or more extra ticketPriceChanged
        // events before we need it when the game sends a requestStartGame request.
        const gameScaling: Scaling = {quantity: 1, betFactor: 1};

        do {
            if (requirePrepareGame) {
                const event = await this.interface.waitForGameEvents('buy', 'requestStartGame', 'ticketPriceChanged', 'gameFinished');
                if (event.gameFinished) {
                    return 'success';
                }

                if (event.ticketPriceChanged) {
                    gameScaling.quantity = event.ticketPriceChanged.quantity;
                    gameScaling.betFactor = 1;
                    continue;
                }

                if (event.buy) {
                    gameScaling.quantity = event.buy.quantity;
                    gameScaling.betFactor = event.buy.betFactor;
                }
            }

            // even if we dont require to prepare the game in the first loop
            // and we don't need to wait for the customer to start the game,
            // we require it for the second loop
            requirePrepareGame = true;

            try {
                this.logger.info(`Call initGame(quantity=${gameScaling.quantity}, bet factor=${gameScaling.betFactor}) now`);

                // verify if customer is allowed to play
                // and start the game inside the frame
                await initGame(gameScaling);

            } catch (err) {
                this.logger.info('Cancel game preparations');
                this.interface.cancelRequestStartGame();

                throw err;
            }

            this.logger.info('Wait for game to start...');
            const gameStartedEvent = await this.interface.waitForGameEvent('gameStarted');
            this.connector.onGameStarted(gameStartedEvent);

            this.logger.info('Wait for game to settle...');
            await this.interface.waitForGameEvent('ticketSettled');
            this.connector.onGameSettled();

        } while (!demoGame);

        this.logger.info('Leaving inGame flow');
        return 'success';
    }


    /**
     * Validate that the customer can play a ticket. If the customer is not allowed
     * to play or has not enought money this method will throw an exception.
     */
    private async verifyPreConditions(scaling: Scaling): Promise<void> {
        const customerState = await this.connector.fetchCustomerState();

        this.logger.info('Check if the customer is logged in');
        if (!customerState.loggedIn) {
            await this.connector.loginCustomer();
            throw CANCELED;
        }

        const order = calculateTicketPrice(scaling, customerState, this.config.ticketPrice);

        const isFreeGame = customerState.unplayedTicketInfos != null || MoneyAmount.isNotZero(customerState.voucher);
        if (!isFreeGame) {
            this.logger.info('Check if the customer has enough money');

            if (MoneyAmount.of(customerState.balance).lessThan(order.customerTicketPrice)) {
                await this.connector.ensureCustomerBalance(this.config.ticketPrice);
                throw CANCELED;
            }

            this.logger.info('Verify that the customer really wants to buy this game');
            if (!await this.connector.verifyTicketPurchase()) {
                throw CANCELED;
            }
        }
    }

    /**
     * Executes the given flow and catches all error values.
     */
    private async flow(fn: () => Promise<GameResult>, resetUIState: boolean = true): Promise<GameResult> {
        try {
            try {
                const result = await fn();

                // disable further free demo games after the first round
                this.disallowFreeGames = true;
                return result;

            } finally {
                this.fullscreenService.disable();
            }

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
        } finally {
            if (resetUIState) {
                await this.flow(async () => void (await this.resetUIState()) || 'success', false);
            }
        }
    }

    private updateUIState(override: Partial<UIState>): void {
        // update copy of previous UI state
        const uiState: UIState = deepFreezeClone({...(this._uiState || {}), ...override}) as UIState;

        this._uiState = uiState;

        try {
            // and publish it
            this.connector.updateUIState(uiState, this);
        } catch (err) {
            this.logger.warn('Ignoring error when updating ui state:', err);
        }
    }

    resetUIState(customerState: CustomerState): void
    async resetUIState(): Promise<void>
    async resetUIState(customerState?: CustomerState): Promise<void> {
        if (customerState == null) {
            customerState = await this.connector.fetchCustomerState();
        }

        type Modifyable<T> = { -readonly [P in keyof T]: T[P]; };

        const uiStateUpdate: Modifyable<UIState> = {
            enabled: true,
            unplayedTicketInfo: undefined,
            allowFreeGame: !this.disallowFreeGames,
            buttonType: 'play',
            normalTicketPrice: MoneyAmount.of(this.config.ticketPrice),
            ticketPriceIsVariable: false,
            isFreeGame: false,
            busy: false,
        };

        // take the price from the customer state if possible.
        const personalized = customerState.personalizedTicketPrice;
        if (personalized) {
            uiStateUpdate.normalTicketPrice = personalized.normalTicketPrice;
            uiStateUpdate.discountedTicketPrice = personalized.discountedTicketPrice;
        }

        if (this.gameSettings.chromeless) {
            uiStateUpdate.buttonType = 'none';

        } else if (customerState.loggedIn) {
            if (this.gameSettings.purchaseInGame) {
                uiStateUpdate.buttonType = 'play';
                uiStateUpdate.ticketPriceIsVariable = true;

            } else if (customerState.unplayedTicketInfos && customerState.unplayedTicketInfos.length) {
                uiStateUpdate.allowFreeGame = false;
                uiStateUpdate.unplayedTicketInfo = customerState.unplayedTicketInfos[0];
                uiStateUpdate.buttonType = 'unplayed';

            } else if (MoneyAmount.isNotZero(customerState.voucher)) {
                uiStateUpdate.allowFreeGame = false;
                uiStateUpdate.buttonType = 'voucher';

            } else if (MoneyAmount.of(customerState.balance).lessThan(this.config.ticketPrice)) {
                uiStateUpdate.buttonType = 'payin';

            } else {
                uiStateUpdate.buttonType = 'buy';
            }
        } else {
            uiStateUpdate.buttonType = 'login';
        }

        this.updateUIState(uiStateUpdate);
    }

    private async startChromelessGameLoop() {
        // noinspection InfiniteLoopJS
        while (true) {
            await this.flow(() => this.playGame());
        }
    }
}

function calculateTicketPrice(scaling: Scaling, customerState: BaseCustomerState, baseTicketPrice: IMoneyAmount): TicketPrice {
    let baseNormalTicketPrice = MoneyAmount.of(baseTicketPrice);
    let baseDiscountedTicketPrice = MoneyAmount.of(baseTicketPrice);

    if (customerState.personalizedTicketPrice) {
        const p = customerState.personalizedTicketPrice;
        baseNormalTicketPrice = MoneyAmount.of(p.normalTicketPrice);
        baseDiscountedTicketPrice = MoneyAmount.of(p.discountedTicketPrice);
    }

    return new TicketPrice(baseNormalTicketPrice, baseDiscountedTicketPrice, scaling.betFactor, scaling.quantity);
}

function verifyInGamePurchaseFlag(gameSettings: GameSettings, gameLoadedEvent: GameLoadedMessage) {
    // If there is an inGamePurchase field on the gameLoadedEvent, we'll verify that
    // it matches the configured game settings.
    if (gameLoadedEvent.inGamePurchase !== undefined) {
        const fromEvent: boolean = gameLoadedEvent.inGamePurchase;

        // noinspection PointlessBooleanExpressionJS
        const fromSettings: boolean = !!gameSettings.purchaseInGame;

        if (fromSettings != fromEvent) {
            throw new Error('purchaseInGame does not match inGamePurchase flag in gameLoaded event!');
        }
    }
}

function parseGameRequestFromInternalPath(path: string): GameRequest {
    const match = new RegExp('^/+zig/+games/+([^/]+)/+tickets:(settle|buy|demo)').exec(path);
    if (!match) {
        throw new Error(`Cannot parse url: ${path}`);
    }

    const [, gameName, op] = match;

    switch (op) {
        case 'settle': {
            const match = new RegExp('tickets:settle/+([^/?]+)').exec(path);
            if (!match) {
                throw new Error(`Can not extract ticket id from url: ${path}`);
            }

            const [, ticketId] = match;
            return {type: 'settle', gameName, ticketId};
        }

        case 'buy':
        case 'demo':
            const rex = new RegExp('(bet-factor|betFactor|quantitiy)=([0-9]+)', 'g');

            const query: { [key: string]: number } = {};

            let match: RegExpMatchArray | null;
            while ((match = rex.exec(path)) != null) {
                const [, name, value] = match;
                query[name] = parseInt(value);
            }

            return {
                type: op, gameName,
                quantity: query.quantity || 1,
                betFactor: query.betFactor || query['bet-factor'] || 1,
            };

        default:
            // unreachable
            throw new Error(`Invalid op: ${op}`);
    }
}
