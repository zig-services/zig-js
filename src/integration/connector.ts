import {IError, IMoneyAmount} from '../_common/domain';
import {Logger} from '../_common/logging';
import {executeRequest, Request, Result} from '../_common/request';
import {GameStartedMessage} from '../_common/message-client';
import {Game} from './webpage';

export interface UnplayedTicketInfo {
    type: 'BASKET' | 'BUNDLE' | 'PRICE' | 'UNFINISHED'

    // Display name of another game that has bought this ticket
    fromOtherGame?: string;

    // True if this ticket was bought using a basket process and can now be played
    fromBasket?: boolean;
}

export interface TicketPricing {
    normalTicketPrice: IMoneyAmount;

    // Provide a discounted ticket price that is less than the normal ticket price if
    // the customer gets the ticket cheaper. Set it to the same value as
    // the normal ticket price if the customer gets no discount on the ticket.
    discountedTicketPrice: IMoneyAmount;
}

export interface BaseCustomerState {
    loggedIn: boolean;

    // The personalized ticket price for this customer.
    // You can use this to apply a discount for the customer. Leave it out if
    // the standard pricing should apply.
    personalizedTicketPrice?: TicketPricing;
}

export interface AnonymousCustomerState extends BaseCustomerState {
    // Customer is not logged in.
    loggedIn: false;
}

export interface AuthorizedCustomerState extends BaseCustomerState {
    // Customer is logged in.
    loggedIn: true;

    // Current balance of the customer. This one must be specified.
    balance: IMoneyAmount;

    // Set this to true if the customer wont need to pay for the next game.
    hasVoucher?: boolean;

    // Specify a list of unplayed ticket infos of the customer.
    unplayedTicketInfos?: UnplayedTicketInfo[];
}

export type CustomerState = AuthorizedCustomerState | AnonymousCustomerState


export interface UIState {
    // State of the main button that the ui shows.
    // Use this as main indicator to decide how to render the UI.
    buttonType: 'none' | 'login' | 'payin' | 'buy' | 'play' | 'unplayed' | 'voucher';

    // If this is true you might offer a demo ticket to the customer.
    allowFreeGame: boolean;

    // The current ticket price.
    ticketPrice: IMoneyAmount;

    // A discount on the ticket price. Might be a zero value.
    ticketPriceDiscount: IMoneyAmount;

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
    public async ensureCustomerBalance(amount: IMoneyAmount): Promise<true> {
        return Promise.resolve<true>(true);
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
