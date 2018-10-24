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
    type: string;

    // The title string.
    title: string;

    // Status code if available
    status?: number;

    // A detailed description of the error. Could be taken from a caught exception.
    details?: string;
}

export interface GameInfo {
    displayName: string;
    canonicalName: string;

    // True if the game supports resume.
    supportsResume: boolean;
}

export interface IMoneyAmount {
    amountInMinor: number;
    amountInMajor: number;
    currency: Currency;
}

export interface Ticket {
    // id of the ticket. This id needs to be send back with a `settle` call.
    id: TicketId;
    externalId: ExternalTicketId;
    ticketNumber: TicketNumber;

    customerNumber: CustomerNumber;

    price: IMoneyAmount;
    winningClass: WinningClass;

    // A bundle key. If this ticket is part of a bundle, the bundleKey will be
    // the id of the parent ticket, otherwise the bundleKey has the same value
    // as the id field.
    bundleKey: TicketId;

    // information about the game
    game: GameInfo;

    // the tickets scenario coded as base64.
    scenario: string;

    // the decoded scenario object or undefined if the scenario
    // field could not be decoded.
    decodedScenario?: any;
}

export interface WinningClass {
    number: number;
    winnings: IMoneyAmount;
}

export interface Bundle {
    tickets: BundleTicket[];
}

export interface BundleTicket {
    activatable: boolean;
    activated: boolean;
    game: GameInfo;
    id: TicketId;
    playable: boolean;
    playableFrom: Timestamp;
    played: boolean;
    prize: IMoneyAmount;
    status: BundleTicketStatus;
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
