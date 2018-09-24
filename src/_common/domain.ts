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

export interface MoneyAmount {
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

    price: MoneyAmount;
    winningClass: WinningClass;

    // A bundle key. If this ticket is part of a bundle, the bundleKey will be
    // the id of the parent ticket, otherwise the bundleKey has the same value
    // as the id field.
    bundleKey: TicketId;

    // information about the game
    game: GameInfo;

    // the tickets scenario coded as base64.
    scenario: string;
}

export interface WinningClass {
    winnings: MoneyAmount;
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
    prize: MoneyAmount;
    status: BundleTicketStatus;
}

// Different statuses of a bundle ticket.
export type BundleTicketStatus = 'NOT_ACTIVATED' | 'ACTIVATABLE' | 'PLAYABLE' | 'PLAYED';
