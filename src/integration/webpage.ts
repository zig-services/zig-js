import {IError, IMoneyAmount, MoneyAmount} from '../_common/domain';
import {MessageClient, ParentMessageInterface, toErrorValue} from '../_common/message-client';
import {Logger} from '../_common/logging';
import {registerRequestListener} from '../_common/request';
import TsDeepCopy from 'ts-deepcopy';
import {CANCELED, Connector, CustomerState, UIState} from './connector';
import {GameWindow} from './game-window';
import {GameSettings} from '../_common/common';

type GameResult = 'success' | 'failure' | 'canceled';

interface Config {
    canonicalGameName: string;
    ticketPrice: IMoneyAmount;
}

class GameContext {
    // Multiplicand for price and winnings
    betFactor: number = 1;

    // this describes the multitude of tickets to buy. This is primarily used
    // for the number of rows in games like sofortlotto
    quantity: number = 1;

    // discount for the next ticket
    discount?: IMoneyAmount;

    /**
     * Returns the given money amount scaled by the current bet factor and quantity.
     */
    scaledMoneyAmount(amount: IMoneyAmount): IMoneyAmount {
        if (this.discount) {
            amount = MoneyAmount.of(amount).minus(this.discount);
        }

        return MoneyAmount.of(amount).scaled(this.betFactor * this.quantity);
    }
}

export class Game {
    private readonly logger: Logger;
    private readonly config: Config;

    // the ui state. Should not be modified directly.
    private uiState: UIState;

    // the game wants to use inGamePurchase
    private gameSettings: GameSettings;

    // the latest game state context.
    private latestGameContext: GameContext = new GameContext();

    constructor(private readonly gameWindow: GameWindow,
                private readonly connector: Connector) {

        this.config = {
            canonicalGameName: 'demo',
            ticketPrice: MoneyAmount.of(150, 'EUR'),
        };

        this.logger = Logger.get(`zig.Game.${this.config.canonicalGameName}`);

        // publish initial ui state to hide any ui there is.
        this.updateUIState({
            ticketPrice: this.config.ticketPrice,
            ticketPriceIsVariable: false,
            enabled: false,
            allowFreeGame: false,
            buttonType: 'none',
        });

        this.setupMessageHandlers();
    }

    private setupMessageHandlers(): void {
        registerRequestListener(this.gameWindow.interface, req => {
            return this.connector.executeHttpRequest(req);
        });
    }

    /**
     * Current ticket price.
     * This is the amount that the game would cost right now.
     */
    get currentTicketPrice(): IMoneyAmount {
        return this.latestGameContext.scaledMoneyAmount(this.config.ticketPrice);
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
        // disable the button to prevent double click issues-
        this.updateUIState({enabled: false});

        return this.flow(async (): Promise<GameResult> => {
            if (this.gameSettings.purchaseInGame) {
                return this.handleInGameBuyGameFlow();
            }

            await this.verifyPreConditions(new GameContext());

            // hide ui
            this.updateUIState({buttonType: 'none'});

            this.logger.info('Tell the game to buy a ticket');
            this.gameWindow.interface.playGame();

            return this.handleNormalGameFlow();
        });
    }

    public async playDemoGame(): Promise<GameResult> {
        // disable the button to prevent double click issues-
        this.updateUIState({enabled: false});

        return this.flow(async (): Promise<GameResult> => {
            if (this.gameSettings.purchaseInGame) {
                return this.handleInGameBuyGameFlow();
            }

            // hide ui
            this.updateUIState({buttonType: 'none'});

            this.logger.info('Tell the game to fetch a demo ticket');
            this.gameWindow.interface.playDemoGame();

            return this.handleNormalGameFlow();
        });
    }

    private async requestStartGame() {
        // hide ui, shouldn't be there anyways.
        this.updateUIState({buttonType: 'none'});

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


    async handleNormalGameFlow(): Promise<GameResult> {
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

        const gameContext = new GameContext();

        while (true) {
            const event = await this.interface.waitForGameEvents('buy', 'requestStartGame', 'ticketPriceChanged', 'gameFinished');
            if (event.gameFinished) {
                return 'success';
            }

            if (event.ticketPriceChanged) {
                gameContext.quantity = event.ticketPriceChanged.rowCount;
                gameContext.betFactor = 1;
                continue;
            }

            if (event.buy) {
                gameContext.quantity = 1;
                gameContext.betFactor = event.buy.betFactor || 1;
            }

            // Looks like the customer wants to start a game.

            await this.verifyPreConditions(gameContext);

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
    private async verifyPreConditions(context: GameContext): Promise<void> {
        const customerState = await this.connector.fetchCustomerState();

        this.logger.info('Check if the customer is logged in');
        if (!customerState.loggedIn) {
            throw CANCELED;
        }

        const isFreeGame = customerState.unplayedTicketInfos != null || customerState.hasVoucher;
        if (!isFreeGame) {
            this.logger.info('Check if the customer has enough money');
            if (MoneyAmount.of(customerState.balance).lessThan(this.currentTicketPrice)) {
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
        const state = TsDeepCopy(this.uiState || {});
        Object.assign(state, override);
        this.uiState = state;

        try {
            // and publish it
            this.connector.updateUIState(TsDeepCopy(state), this);
        } catch (err) {
            this.logger.warn('Ignoring error when updating iu state:', err);
        }
    }

    private async resetUIState(customerState?: CustomerState) {
        if (customerState == null) {
            customerState = await this.connector.fetchCustomerState();
        }

        const uiStateUpdate: Partial<UIState> = {
            enabled: true,
            unplayedTicketInfo: undefined,
            allowFreeGame: true,
            ticketPrice: this.config.ticketPrice,
            ticketPriceDiscount: MoneyAmount.of(this.config.ticketPrice).scaled(0),
        };

        if (this.gameSettings.chromeless) {
            uiStateUpdate.buttonType = 'none';

        } else if (customerState.loggedIn) {
            if (this.gameSettings.purchaseInGame) {
                uiStateUpdate.buttonType = 'play';

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

    private static newGameContext(customerState: CustomerState) {
        if (customerState.personalizedTicketPrice) {
            const normalTicketPrice = MoneyAmount.of(customerState.personalizedTicketPrice.normalTicketPrice);
            const discountedTicketPrice = MoneyAmount.of(customerState.personalizedTicketPrice.discountedTicketPrice);

            const ctx = new GameContext();
            ctx.discount = normalTicketPrice.minus(discountedTicketPrice);
            return ctx;
        }

        // just a normal and game context.
        return new GameContext();
    }

    private async startChromelessGameLoop() {
        // noinspection InfiniteLoopJS
        while (true) {
            await this.flow(() => this.handleInGameBuyGameFlow());
        }
    }
}
