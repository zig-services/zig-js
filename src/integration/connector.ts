import {IError, IMoneyAmount, MoneyAmount} from '../common/domain';
import {Logger} from '../common/logging';
import {executeRequest, Request, Result} from '../common/request';
import {GameStartedMessage} from '../common/message-client';
import {Game} from './webpage';
import {GameSettings} from '../common/config';

export interface UnplayedTicketInfo {
    readonly type: 'BASKET' | 'BUNDLE' | 'PRIZE' | 'UNFINISHED'

    // Display name of another game that has bought this ticket
    readonly fromOtherGame?: string;

    // True if this ticket was bought using a basket process and can now be played
    readonly fromBasket?: boolean;
}

export interface TicketPricing {
    readonly normalTicketPrice: MoneyAmount;

    // Provide a discounted ticket price that is less than the normal ticket price if
    // the customer gets the ticket cheaper. Set it to the same value as
    // the normal ticket price if the customer gets no discount on the ticket.
    readonly discountedTicketPrice: MoneyAmount;
}

export interface BaseCustomerState {
    readonly loggedIn: boolean;

    // The personalized ticket price for this customer.
    // You can use this to apply a discount for the customer. Leave it out if
    // the standard pricing should apply.
    readonly personalizedTicketPrice?: TicketPricing;
}

export interface AnonymousCustomerState extends BaseCustomerState {
    // Customer is not logged in.
    readonly loggedIn: false;
}

export interface AuthorizedCustomerState extends BaseCustomerState {
    // Customer is logged in.
    readonly loggedIn: true;

    // Current balance of the customer. This one must be specified.
    readonly balance: MoneyAmount;

    // Set this if the customer has a voucher for a free game. The voucher amount
    // must cover a games ticket price.
    readonly voucher?: MoneyAmount;

    // Specify a list of unplayed ticket infos of the customer.
    readonly unplayedTicketInfos?: UnplayedTicketInfo[];
}

export type CustomerState = AuthorizedCustomerState | AnonymousCustomerState

export interface UIState {
    // State of the main button that the ui shows.
    // Use this as main indicator to decide how to render the UI.
    // A type of 'none' should not render any UI.
    readonly buttonType: 'none' | 'loading' | 'login' | 'payin' | 'buy' | 'play' | 'unplayed' | 'voucher';

    // If this is true you might offer a demo ticket to the customer.
    readonly allowFreeGame: boolean;

    // The normal ticket price
    readonly normalTicketPrice: MoneyAmount;

    // The discounted ticket price. Only set if there is a discount on the ticket.
    readonly discountedTicketPrice?: MoneyAmount;

    // True if the ticket price can be adjusted by switching a bet factor in the game
    readonly ticketPriceIsVariable: boolean;

    // Flags if the user is allowed to interact with the overlay
    readonly enabled: boolean;

    // This field is set if the player can continue with an existing ticket.
    readonly unplayedTicketInfo?: UnplayedTicketInfo;

    // True if the player is _currently_ playing a free demo game round.
    readonly isFreeGame: boolean;

    // Marks the ui as busy - e.g. because a request to buy a ticket
    // is currently running.
    readonly busy: boolean;

    // The current balance of the player as returned by the most recent
    // fetchCustomerState call. Unset, if the customer is not logged in.
    readonly balance?: MoneyAmount;
}

export interface SettleGameRequest {
    readonly type: 'settle';
    readonly gameName: string;
    readonly ticketId: string;
}

export interface PurchaseGameRequest {
    readonly type: 'demo' | 'buy';
    readonly gameName: string;
    readonly quantity: number;
    readonly betFactor: number;
}

export type GameRequest = PurchaseGameRequest | SettleGameRequest;

/**
 * Throw this instance to cancel the current request/response.
 */
export const CANCELED = Object.freeze({'cancel': true});

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
    public async verifyTicketPurchase(amount: IMoneyAmount): Promise<boolean> {
        return true;
    }

    /**
     * Ensure that the customer has the required balance. You could show
     * a pay in dialog for the customer here. The default implementation will
     * just fail with 'false', as it can not do any payin or similar.
     */
    public async ensureCustomerBalance(amount: IMoneyAmount): Promise<boolean> {
        return false;
    }

    /**
     * Ensures that the customer is logged in. If you dont want to sign in the customer
     * just return false. The default will return false.
     */
    public async loginCustomer(): Promise<boolean> {
        return false;
    }

    /**
     * Show an error dialog to the customer. The method should return only
     * once the dialog closes.
     */
    public async showErrorDialog(error: IError): Promise<void> {
        this.logger.error('An error occurred:', error);
    }

    /**
     * Build a url suitable for your backend by implementing this method
     * and transforming the given `request` object into a url path.
     */
    public buildRequestPath(r: GameRequest): string {
        switch (r.type) {
            case 'buy':
            case 'demo':
                return `/zig/games/${r.gameName}/tickets:${r.type}?quantity=${r.quantity}&betFactor=${r.betFactor}`;

            case 'settle':
                return `/zig/games/${r.gameName}/tickets:settle/${r.ticketId}`;

            default:
                throw new Error(`invalid type in ${JSON.stringify(r)}`);
        }
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
     * Override to disable fullscreen mode.
     */
    public get allowFullscreen(): boolean {
        return true;
    }

    /**
     * The game settings that might be used by the integrating code.
     * This method will be called some time before onGameLoaded.
     */
    public onGameSettings(gameSettings: GameSettings) {
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
