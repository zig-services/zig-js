export type Logger = (...args: any[]) => void

export function logger(prefix: string): Logger {
    if ((location.href || "").match(/sg-cloud|localhost|devstation/)) {
        return (...args: any[]): void => console.log(prefix, ...args);
    } else {
        return (...args: any[]): void => {
            // no logging on production
        };
    }
}


export type TicketId = string;

export interface ITicket {
    id: TicketId;
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
}

export interface IGameSettings {
    index: string;
    aspect: number;
    legacyGame: boolean;
}
