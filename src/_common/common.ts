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
    // set to true to enable overlay in the outer.html
    overlay?: boolean;
}

export interface IGameSettings {
    index: string;
    aspect: number;
    legacyGame: boolean;
}
