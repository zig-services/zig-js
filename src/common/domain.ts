export type TicketId = string;
export type TicketNumber = string;
export type ExternalTicketId = string;

// Timestamp in seconds since the epoch.
export type Timestamp = number;

export type Currency = string;

export type CustomerNumber = string;

/**
 * An error that can be send to the backend. Use the provided function to turn
 * any error value (failed http response, exception, ...) into a compatible error value.
 */
export interface IError {
    // Error type, should be an urn: prefixed type name.
    readonly type: string;

    // The title string.
    readonly title: string;

    // Status code if available
    readonly status?: number;

    // A detailed description of the error. Could be taken from a caught exception.
    readonly details?: string;
}

export interface IMoneyAmount {
    readonly amountInMinor: number;
    readonly amountInMajor: number;
    readonly currency: Currency;
}

/**
 * A ticket that the games gets from the backend.
 */
export interface Ticket {
    // Local id of the ticket
    // This id needs to be send back with a `settle` call.
    readonly id: TicketId;

    // Some identifying alphanumeric string that does not need to be
    // unique but should identify the ticket given other information like an
    // approximate time or customer number
    readonly ticketNumber: TicketNumber;

    // The amount of money the customer payed for this ticket.
    readonly price: IMoneyAmount;

    // The bet factor that was used when purchasing this ticket.
    readonly betFactor: number;

    // The winning class of the ticket. Use this to extract the winnings
    // of this ticket. If the winnings are zero this was a loosing bet.
    readonly winningClass: WinningClass;

    // the tickets scenario coded as base64 json. You should not need
    // to use this field directly. A decoded version of it will be put into
    // the `decodedScenario` field.
    readonly scenario: string;

    // the decoded scenario object or undefined if the scenario
    // field could not be decoded. Basically `JSON.parse(atob(scenario))`
    readonly decodedScenario?: any;
}

export interface WinningClass {
    /**
     * The internal number of the winning class. This is an implementation detail
     * and normally this does not need to be used by a game frontend.
     * @private
     */
    readonly number: number;

    // The amount of money the customer won.
    readonly winnings: IMoneyAmount;
}

/**
 * A bundle of tickets BundleTickets.
 */
export interface Bundle {
    readonly tickets: BundleTicket[];
}

export interface BundleTicket {
    readonly activatable: boolean;
    readonly activated: boolean;
    readonly game: GameInfo;
    readonly id: TicketId;
    readonly playable: boolean;
    readonly playableFrom: Timestamp;
    readonly played: boolean;
    readonly prize: IMoneyAmount;
    readonly status: BundleTicketStatus;
}

export interface GameInfo {
    readonly displayName: string;
    readonly canonicalName: string;
}

// Different statuses of a bundle ticket.
export type BundleTicketStatus = 'NOT_ACTIVATED' | 'ACTIVATABLE' | 'PLAYABLE' | 'PLAYED';

export class MoneyAmount implements IMoneyAmount {
    public readonly amountInMajor: number;

    constructor(
        public readonly amountInMinor: number,
        public readonly currency: Currency) {

        this.amountInMajor = amountInMinor / 100;

        // this object is immutable.
        Object.freeze(this);
    }

    public scaled(factor: number): MoneyAmount {
        if (factor !== (factor | 0)) {
            throw new Error('factor must be integer');
        }

        return new MoneyAmount(this.amountInMinor * factor, this.currency);
    }

    public plus(rhs: IMoneyAmount): MoneyAmount {
        this.verifyCurrency(rhs);
        return new MoneyAmount(this.amountInMinor + rhs.amountInMinor, this.currency);
    }

    public minus(rhs: IMoneyAmount): MoneyAmount {
        this.verifyCurrency(rhs);
        return this.plus(MoneyAmount.of(rhs).scaled(-1));
    }

    public lessThan(rhs: IMoneyAmount): boolean {
        this.verifyCurrency(rhs);
        return this.amountInMinor < rhs.amountInMinor;
    }

    public lessThanOrEqual(rhs: IMoneyAmount): boolean {
        this.verifyCurrency(rhs);
        return this.amountInMinor <= rhs.amountInMinor;
    }

    public greaterThan(rhs: IMoneyAmount): boolean {
        this.verifyCurrency(rhs);
        return this.amountInMinor > rhs.amountInMinor;
    }

    public greaterThanOrEqual(rhs: IMoneyAmount): boolean {
        this.verifyCurrency(rhs);
        return this.amountInMinor >= rhs.amountInMinor;
    }

    public equalTo(rhs: IMoneyAmount): boolean {
        this.verifyCurrency(rhs);
        return this.amountInMinor === rhs.amountInMinor;
    }

    private verifyCurrency(other: IMoneyAmount) {
        if (this.currency !== other.currency) {
            throw new Error(`expected currency ${this.currency}, got ${other.currency}`);
        }
    }

    static of(amount: IMoneyAmount): MoneyAmount;
    static of(amountInMinor: number, currency: Currency): MoneyAmount;
    static of(amount: IMoneyAmount | number, currency?: Currency): MoneyAmount {
        // check for dynamic javascript fuck up.
        if (amount as any == null) {
            throw new Error('Can not build MoneyAmount from \'null\'');
        }

        if (typeof amount === 'number') {
            if (currency == null) {
                throw new Error('currency not set');
            }

            return new MoneyAmount(amount, currency);
        }

        return new MoneyAmount(amount.amountInMinor, amount.currency);
    }

    static zero(currency: Currency): MoneyAmount {
        return new MoneyAmount(0, currency);
    }

    static isZero(amount: IMoneyAmount | null | undefined): amount is IMoneyAmount {
        return !amount || amount.amountInMinor === 0;
    }

    static isNotZero(amount: IMoneyAmount | null | undefined): amount is IMoneyAmount {
        return !MoneyAmount.isZero(amount);
    }
}
