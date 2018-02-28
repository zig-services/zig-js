import {Options} from "./options";

export type Logger = (...args: any[]) => void

export function logger(prefix: string): Logger {
    return (...args: any[]): void => {
        if (Options.logging) {
            console.log(prefix, ...args);
        }
    };
}

export function sleep(millis: number): Promise<{}> {
    return new Promise<{}>((resolve => window.setTimeout(resolve, millis)));
}

export type TicketId = string;

export interface IGame {
    supportsResume: boolean;
}

export interface ITicket {
    id: TicketId;
    game: IGame;
}

export interface IError {
    type: string;
    title: string;
    status?: number;
    details?: string;
}

export interface IGameConfig {
    endpoint: string;
    headers: { [key: string]: string; };

    // disable overlay in the outer.html
    noOverlay?: boolean;

    // for testing only. Enables xhr.withCredentials if set.
    withCredentials?: boolean;

    // for development. Will be added to the url.
    dev?: {
        scenario: string;
        winningClass: string;
    }
}

export interface IGameSettings {
    index: string;
    aspect: number;
    legacyGame: boolean;
}
