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

export type TicketNumber = string;

export interface IGame {
    supportsResume: boolean;
}

export interface ITicket {
    id: TicketId;
    game: IGame;
}

export interface IGameSettings {
    index: string;
    aspect: number;
    legacyGame: boolean;
}
