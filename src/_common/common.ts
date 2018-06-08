import {Options} from "./options";

export interface Logger {
    (...args: any[]): void;

    debug(...args: any[]): void;

    info(...args: any[]): void;

    warn(...args: any[]): void;
}

export function logger(prefix: string): Logger {
    const l: any = (...args: any[]): void => {
        if (Options.logging) {
            console.log(prefix, ...args);
        }
    };

    l.info = (...args: any[]): void => l("INFO", ...args);
    l.warn = (...args: any[]): void => l("WARN", ...args);
    l.debug = (...args: any[]): void => l("DEBUG", ...args);

    return l as Logger;
}

export function sleep(millis: number): Promise<{}> {
    return new Promise<{}>((resolve => window.setTimeout(resolve, millis)));
}

export type TicketId = string;

export type TicketNumber = string;

export type BundleKey = string;

export interface IGame {
    supportsResume: boolean;
    canonicalName: string;
}

export interface ITicket {
    id: TicketId;
    ticketNumber: TicketNumber;
    bundleKey: BundleKey;
    game: IGame;
    played: boolean;
}

export interface IGameSettings {
    index: string;
    aspect: number;
    legacyGame: boolean;
}

export interface IBundle {
    tickets: ITicket[];
}
