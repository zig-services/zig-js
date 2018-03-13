export declare type Logger = (...args: any[]) => void;
export declare function logger(prefix: string): Logger;
export declare function sleep(millis: number): Promise<{}>;
export declare type TicketId = string;
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
export interface IGameSettings {
    index: string;
    aspect: number;
    legacyGame: boolean;
}
