import {IError, IMoneyAmount, MoneyAmount} from '../_common/domain';
import {MessageClient, ParentMessageInterface, toErrorValue} from '../_common/message-client';
import {Logger} from '../_common/logging';
import {registerRequestListener} from '../_common/request';
import TsDeepCopy from 'ts-deepcopy';
import {BaseCustomerState, CANCELED, Connector, CustomerState, UIState} from './connector';
import {GameWindow} from './game-window';
import {GameSettings} from '../_common/common';

type GameResult = 'success' | 'failure' | 'canceled';

interface Config {
    canonicalGameName: string;
    ticketPrice: IMoneyAmount;
}

interface Scaling {
    betFactor: number;
    quantity: number;
}

class Order {
    constructor(
        readonly baseNormalTicketPrice: MoneyAmount,
        readonly baseDiscountedTicketPrice: MoneyAmount,
        readonly betFactor: number = 1, readonly quantity: number = 1) {
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
    private uiState: UIState;

    // the game wants to use inGamePurchase
    private gameSettings: GameSettings;

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
            buttonType: 'none',
            normalTicketPrice: MoneyAmount.of(this.config.ticketPrice).scaled(0),
            isDemoGame: false,
        };

        this.updateUIState(baseUIState);

        this.setupMessageHandlers();
    }

    private setupMessageHandlers(): void {
        registerRequestListener(this.gameWindow.interface, req => {
            return this.connector.executeHttpRequest(req);
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
     * Initializes the game and wait for it to load.
     */
    public async initialize(gameInput?: any): Promise<void> {
        await this.flow(async (): Promise<GameResult> => {
            const customerState$: Promise<CustomerState> = this.connector.fetchCustomerState();

            this.logger.info('Wait for game settings');
            const gameSettingsEvent = await this.interface.waitForGameEvent('updateGameSettings');
            this.gameSettings = gameSettingsEvent.gameSettings;

            if (gameInput !== undefined) {
                this.logger.info('Got game input, wait for game to request it.');
                await this.interface.waitForGameEvent('requestGameInput');

                this.logger.info('Sending game input to game frame now.');
                this.gameWindow.interface.gameInput(gameInput);
            }

            // wait for the game-frame to load
            this.logger.info('Wait for game to load...');
            const gameLoadedEvent = await this.interface.waitForGameEvent('gameLoaded');

            if (gameLoadedEvent.inGamePurchase !== undefined) {
                if ((this.gameSettings.purchaseInGame === true) !== gameLoadedEvent.inGamePurchase) {
                    throw new Error('purchaseInGame does not match inGamePurchase flag in gameLoaded event');
                }
            }

            const customerState = await customerState$;
            // check if money is okay.

            this.logger.info('Game was loaded.');
            this.connector.onGameLoaded();

            this.resetUIState(customerState);

            if (this.gameSettings.chromeless) {
                this.startChromelessGameLoop();
            }

            return 'success';
        }, false);
    }

    public async playGame(): Promise<GameResult> {
        return this.play(async () => {
            await this.verifyPreConditions({quantity: 1, betFactor: 1});

            this.logger.info('Tell the game to buy a ticket');
            this.gameWindow.interface.playGame();
        });
    }

    public async playDemoGame(): Promise<GameResult> {
        return this.play(async () => {
            this.logger.info('Tell the game to fetch a demo ticket');
            this.gameWindow.interface.playDemoGame();

            this.updateUIState({isDemoGame: true});
        });
    }

    private async play(initGame: () => Promise<void>): Promise<GameResult> {
        // disable the button to prevent double click issues-
        this.updateUIState({enabled: false});

        return this.flow(async (): Promise<GameResult> => {
            if (this.gameSettings.purchaseInGame) {
                return this.handleInGameBuyGameFlow();
            }

            await initGame();

            // hide ui
            this.updateUIState({buttonType: 'none'});

            this.fullscreenService.enable();

            return this.handleNormalGameFlow();
        });
    }

    private async handleNormalGameFlow(): Promise<GameResult> {
        this.logger.info('Wait for game to start...');
        const gameStartedEvent = await this.interface.waitForGameEvent('gameStarted');
        this.connector.onGameStarted(gameStartedEvent);

        this.logger.info('Wait for game to settle...');
        await this.interface.waitForGameEvent('ticketSettled');
        this.connector.onGameSettled();

        this.logger.info('Wait for game to finish...');
        await this.interface.waitForGameEvent('gameFinished');

        return 'success';
    }

    async handleInGameBuyGameFlow(): Promise<GameResult> {
        // hide ui
        this.updateUIState({buttonType: 'none'});

        // jump directly into the game.
        this.logger.info('Set the game into prepare mode');
        this.gameWindow.interface.prepareGame(false);

        this.logger.info('Wait for player to buy a game');

        let gameScaling: Scaling = {quantity: 1, betFactor: 1};
        while (true) {
            const event = await this.interface.waitForGameEvents('buy', 'requestStartGame', 'ticketPriceChanged', 'gameFinished');
            if (event.gameFinished) {
                return 'success';
            }

            if (event.ticketPriceChanged) {
                gameScaling.quantity = event.ticketPriceChanged.rowCount;
                gameScaling.betFactor = 1;
                continue;
            }

            if (event.buy) {
                gameScaling.quantity = 1;
                gameScaling.betFactor = event.buy.betFactor || 1;
            }

            // Looks like the customer wants to start a game.
            await this.verifyPreConditions(gameScaling);

            this.logger.info('Tell the game to buy a ticket');
            this.interface.playGame();

            this.logger.info('Wait for game to start...');
            const gameStartedEvent = await this.interface.waitForGameEvent('gameStarted');
            this.connector.onGameStarted(gameStartedEvent);

            this.logger.info('Wait for game to settle...');
            await this.interface.waitForGameEvent('ticketSettled');
            this.connector.onGameSettled();
        }
    }


    /**
     * Validate that the customer
     */
    private async verifyPreConditions(scaling: Scaling): Promise<Order> {
        const customerState = await this.connector.fetchCustomerState();

        this.logger.info('Check if the customer is logged in');
        if (!customerState.loggedIn) {
            throw CANCELED;
        }

        const order = makeOrder(scaling, customerState, this.config.ticketPrice);

        const isFreeGame = customerState.unplayedTicketInfos != null || customerState.hasVoucher;
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

        return order;
    }

    /**
     * Executes the given flow and catches all error values.
     */
    private async flow(fn: () => Promise<GameResult>, resetUIState: boolean = true): Promise<GameResult> {
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
        } finally {
            if (resetUIState) {
                await this.flow(async () => void (await this.resetUIState()) || 'success', false);
            }
        }
    }

    private updateUIState(override: Partial<UIState>): void {
        // update local ui state
        const uiState: UIState = TsDeepCopy(this.uiState || {});
        Object.assign(uiState, override);

        this.uiState = uiState;

        try {
            // and publish it
            this.connector.updateUIState(TsDeepCopy(uiState), this);
        } catch (err) {
            this.logger.warn('Ignoring error when updating iu state:', err);
        }
    }

    async resetUIState(customerState?: CustomerState): Promise<unknown> {
        if (customerState == null) {
            customerState = await this.connector.fetchCustomerState();
        }

        const uiStateUpdate: UIState = {
            enabled: true,
            unplayedTicketInfo: undefined,
            allowFreeGame: true,
            buttonType: 'play',
            normalTicketPrice: MoneyAmount.of(this.config.ticketPrice),
            ticketPriceIsVariable: false,
            isDemoGame: false,
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

            } else if (customerState.hasVoucher) {
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
            await this.flow(() => this.handleInGameBuyGameFlow());
        }
    }
}

function makeOrder(scaling: Scaling, customerState: BaseCustomerState, baseTicketPrice: IMoneyAmount): Order {
    let baseNormalTicketPrice = MoneyAmount.of(baseTicketPrice);
    let baseDiscountedTicketPrice = MoneyAmount.of(baseTicketPrice);

    if (customerState.personalizedTicketPrice) {
        const p = customerState.personalizedTicketPrice;
        baseNormalTicketPrice = MoneyAmount.of(p.normalTicketPrice);
        baseDiscountedTicketPrice = MoneyAmount.of(p.discountedTicketPrice);
    }

    return new Order(baseNormalTicketPrice, baseDiscountedTicketPrice, scaling.betFactor, scaling.quantity);
}


var requestFullscreen = Element.prototype.requestFullscreen
    || Element.prototype.webkitRequestFullScreen;

class FullscreenService {
    private readonly logger = Logger.get('zig.Fullscreen');
    private isInFullscreen: boolean = false;

    constructor(private node: HTMLElement) {
    }

    public async enable(): Promise<void> {
        const parent = this.node.parentElement;
        if (parent) {
            parent.removeChild(this.node);
        }

        const wrapper = document.createElement('div');
        wrapper.style.position = 'fixed';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.width = '100vh';
        wrapper.style.height = '100vw';
        wrapper.style.background = 'black';
        wrapper.style.zIndex = '9999';
        wrapper.style.transform = 'rotate(90deg)';

        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'center';

        this.node.style.position = 'relative';
        this.node.style.top = '0';
        this.node.style.left = '0';
        this.node.style.width = '100vw';
        this.node.style.height = '100vh';

        wrapper.appendChild(this.node);
        document.body.appendChild(wrapper);

        // if (document.fullscreenElement == null) {
        //     requestFullscreen.call(this.node);
        // }
    }

    public disable() {
        document.exitFullscreen();
    }
}
