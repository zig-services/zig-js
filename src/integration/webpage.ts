import '../common/polyfills';

import {IError, IMoneyAmount, MoneyAmount} from '../common/domain';
import {
    GameLoadedMessage,
    MessageClient,
    ParentMessageInterface,
    TicketPriceChangedMessage,
    toErrorValue,
} from '../common/message-client';
import {Logger} from '../common/logging';
import {registerRequestListener} from '../common/request';
import {BaseCustomerState, CANCELED, Connector, CustomerState, GameRequest, UIState} from './connector';
import {GameWindow} from './game-window';
import {GameConfig, GameSettings} from '../common/config';
import {FullscreenService} from './fullscreen';
import {arrayIsEmpty, arrayNotEmpty, deepFreezeClone} from '../common/common';

type GameResult = 'success' | 'failure' | 'canceled';

export interface LocalGameConfig extends GameConfig {
    readonly ticketPrice: IMoneyAmount;
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

    private readonly fullscreenService: FullscreenService;

    // the ui state. Should not be modified directly, always use "updateUIState"
    private _uiState?: Readonly<UIState>;

    private _gameSettings?: GameSettings;

    // set to true to disable further free games.
    private disallowFreeGames: boolean = false;

    private latestTicketPriceChangedMessage: TicketPriceChangedMessage | null = null;

    constructor(private readonly gameWindow: GameWindow,
                private readonly connector: Connector,
                private readonly config: LocalGameConfig) {

        this.fullscreenService = new FullscreenService(gameWindow.wrapper);

        this.logger = Logger.get(`zig.Game.${this.config.canonicalGameName}`);

        // publish initial ui state to hide any ui there is. We define it as a variable here to
        // ensure that we don't miss any initial values.
        const baseUIState: UIState = {
            ticketPriceIsVariable: false,
            enabled: false,
            allowFreeGame: false,
            buttonType: 'loading',
            balance: MoneyAmount.of(this.config.ticketPrice).scaled(0),
            normalTicketPrice: MoneyAmount.of(this.config.ticketPrice),
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
            const customerState$: Promise<CustomerState> = this.fetchCustomerState();

            this.logger.info('Wait for game settings');
            const gameSettingsEvent = await this.interface.waitForGameEvent('updateGameSettings');

            this._gameSettings = gameSettingsEvent.gameSettings;
            this.connector.onGameSettings(gameSettingsEvent.gameSettings);

            // We can only do purchaseInGame if we requesting chromeless mode.
            if (this.gameSettings.chromeless && !this.gameSettings.purchaseInGame) {
                throw new Error('gameSettings.chromeless implies gameSettings.purchaseInGame');
            }

            // There are two possibilities: The game might request game input, if it needs some,
            // or it will just tell us that the game was loaded successfully.
            this.logger.info('Wait for game to load or to request game input');
            //
            const event = await this.interface.waitForGameEvents('requestGameInput', 'gameLoaded');
            if (event.requestGameInput) {
                this.logger.info('Sending game input to game frame now.');
                this.gameWindow.interface.gameInput(gameInput);
            }

            this.gameWindow.interface.register('ticketPriceChanged', (message: TicketPriceChangedMessage) => {
                this.latestTicketPriceChangedMessage = message;
            });


            // take the game loaded event that we've got.
            let gameLoadedEvent: GameLoadedMessage | undefined = undefined;
            if (event.gameLoaded) {
                this.logger.info('Got a game loaded event, no game input requested.');
                gameLoadedEvent = event.gameLoaded;
            } else {
                // wait for the game-frame to load
                this.logger.info('Wait for game to load...');
                gameLoadedEvent = await this.interface.waitForGameEvent('gameLoaded');
            }

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

        this.interface.registerGeneric({
            gotoUrl: event => {
                this.connector.goToUrl(event.destination);
            },

            gotoGame: event => {
                this.connector.goToGame(event.destinationGame);
            },
        });
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
        if (this.gameSettings.chromeless || this.gameSettings.fullscreenNotSupported) {
            // never allow fullscreen for chromeless games.
            return false;
        }

        return this.connector.allowFullscreen;
    }

    private enableFullscreenIfAllowed(): void {
        if (this.allowFullscreen) {
            this.fullscreenService.enable();
        }
    }

    /**
     * Jumps out of fullscreen to run the given action. Use this if you need to
     * show something out of the game frame during game flow. Do not use it, if
     * your action does not take a short time.
     */
    public async runOutsideOfFullscreen<T>(action: () => Promise<T>): Promise<T> {
        this.fullscreenService.disable();
        const result = await action();

        this.enableFullscreenIfAllowed();
        return result;
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
            if (this.config.remoteAccessToken) {
                return await this.handleRemoteGameFlow(demoGame, initGame);

            } else if (this.gameSettings.purchaseInGame) {
                return await this.handlePurchaseInGameGameFlow(demoGame, initGame);

            } else {
                return await this.handleSingleRoundGameFlow(initGame);
            }
        });
    }

    private async handleSingleRoundGameFlow(initGame: InitGame): Promise<GameResult> {
        // always run with a unity quantity
        await initGame({quantity: 1, betFactor: 1});

        // goto fullscreen
        this.enableFullscreenIfAllowed();

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
        this.enableFullscreenIfAllowed();

        let state = await this.fetchCustomerState();

        // check if the customer has an unplayed ticket he wants to resume
        let requirePrepareGame: boolean = !state.loggedIn || arrayIsEmpty(state.unplayedTicketInfos);
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

        // TODO remove once 'ticketPriceChanged' is gone.
        if (this.latestTicketPriceChangedMessage) {
            gameScaling.quantity = this.latestTicketPriceChangedMessage.quantity;
            gameScaling.betFactor = this.latestTicketPriceChangedMessage.betFactor || 1;
        }

        do {
            if (requirePrepareGame) {
                const event = await this.interface.waitForGameEvents(
                    'buy', 'requestStartGame', 'ticketPriceChanged', 'gameFinished');

                if (event.gameFinished) {
                    return 'success';
                }

                if (event.ticketPriceChanged) {
                    gameScaling.quantity = event.ticketPriceChanged.quantity;
                    gameScaling.betFactor = event.ticketPriceChanged.betFactor || 1;
                    continue;
                }

                if (event.buy) {
                    gameScaling.quantity = event.buy.quantity;
                    gameScaling.betFactor = event.buy.betFactor;
                }

                if (event.requestStartGame) {
                    // do nothing
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
                this.interface.cancelRequestStartGame();
                this.logger.info('Error during game init, cancel the start request but keep running.', err);
                continue;
            }

            // gameStarted/ticketSettle
            await this.handleOneGameCycle();

            // if we had a voucher, we update now.
            if (state.loggedIn && MoneyAmount.isNotZero(state.voucher)) {
                state = await this.fetchCustomerState();
            }

        } while (true);
    }

    private async handleRemoteGameFlow(demoGame: boolean, initGame: InitGame): Promise<GameResult> {
        // always run with a unity quantity
        await initGame({quantity: 1, betFactor: 1});

        // hide the ui
        this.updateUIState({busy: false, buttonType: 'none'});

        // goto fullscreen
        this.enableFullscreenIfAllowed();

        // jump directly into the game.
        this.logger.info('Set the game into prepare mode');
        this.gameWindow.interface.prepareGame(demoGame);

        this.logger.info('Wait for player to start a game');

        // noinspection InfiniteLoopJS
        while (true) {
            try {
                if (demoGame) {
                    const event = await this.interface.waitForGameEvents('gameFinished');

                    if (event.gameFinished) {
                        return 'success';
                    }
                }

                await this.handleOneGameCycle();
            } catch (err) {
                const errorValue = toErrorValue(err);
                if (isTransientRemoteError(errorValue)) {
                    // publish error directly...
                    await this.connector.showErrorDialog(errorValue);

                    // and continue the game.
                    continue;
                }

                // re-throw the error value
                throw err;
            }
        }
    }

    private async handleOneGameCycle() {
        this.logger.info('Wait for game to start...');
        const gameStartedEvent = await this.interface.waitForGameEvent('gameStarted');
        this.connector.onGameStarted(gameStartedEvent);

        this.logger.info('Wait for game to settle...');
        await this.interface.waitForGameEvent('ticketSettled');
        this.connector.onGameSettled();
    }

    /**
     * Validate that the customer can play a ticket. If the customer is not allowed
     * to play or has not enought money this method will throw an exception.
     */
    private async verifyPreConditions(scaling: Scaling): Promise<void> {
        const customerState = await this.fetchCustomerState();

        this.logger.info('Check if the customer is logged in');
        if (!customerState.loggedIn) {
            this.fullscreenService.disable();

            await this.connector.loginCustomer();
            throw CANCELED;
        }

        const order = calculateTicketPrice(scaling, customerState, this.config.ticketPrice);

        const isFreeGame = arrayNotEmpty(customerState.unplayedTicketInfos) || MoneyAmount.isNotZero(customerState.voucher);
        if (!isFreeGame) {
            this.logger.info('Check if the customer has enough money');

            if (MoneyAmount.of(customerState.balance).lessThan(order.customerTicketPrice)) {
                await this.runOutsideOfFullscreen(async () => {
                    if (!await this.connector.ensureCustomerBalance(order.customerTicketPrice)) {
                        throw CANCELED;
                    }
                });

                // at this point we expect the customer to have the required money amount.
                // we could do a second check here and fail on error, but that's not needed,
                // the game will just fail when purchasing the ticket.
            }

            this.logger.info('Verify that the customer really wants to buy this game');
            if (!await this.connector.verifyTicketPurchase(order.customerTicketPrice)) {
                throw CANCELED;
            }
        }
    }

    /**
     * Executes the given flow and catches all error values.
     */
    private async flow(fn: () => Promise<GameResult>, resetUIState: boolean = true): Promise<GameResult> {
        try {
            // show the ui as busy
            this.updateUIState({busy: true});

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
            uiStateUpdate.balance = customerState.balance;

            if (arrayNotEmpty(customerState.unplayedTicketInfos)) {
                uiStateUpdate.allowFreeGame = false;
                uiStateUpdate.unplayedTicketInfo = customerState.unplayedTicketInfos[0];
                uiStateUpdate.buttonType = 'unplayed';

            } else if (MoneyAmount.isNotZero(customerState.voucher)) {
                uiStateUpdate.allowFreeGame = false;
                uiStateUpdate.buttonType = 'voucher';

            } else if (this.gameSettings.purchaseInGame) {
                uiStateUpdate.buttonType = 'play';
                uiStateUpdate.ticketPriceIsVariable = true;

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

    private async fetchCustomerState(): Promise<CustomerState> {
        const customerState = await this.connector.fetchCustomerState();
        if (customerState.loggedIn) {
            // publish update in balance.
            this.updateUIState({balance: customerState.balance});

            // always send voucher to game
            this.logger.info('Send voucher info to game.');
            const voucherAmountInMinor = (customerState.voucher && customerState.voucher.amountInMinor) || 0;
            this.interface.newVoucher(voucherAmountInMinor);
        }


        return customerState;
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
        case 'demo': {
            const rex = new RegExp('(bet-factor|betFactor|quantity)=([0-9]+)', 'g');

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
        }

        default:
            // unreachable
            throw new Error(`Invalid op: ${op}`);
    }
}

function isTransientRemoteError(err: IError) {
    return err.type === 'urn:x-tipp24:realitycheck-limit-reached'
        || err.type === 'urn:x-tipp24:daily-iwg-limit-reached';
}
