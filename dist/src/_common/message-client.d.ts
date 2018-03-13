import { IError } from "./common";
export declare type CommandType = string;
export interface IMessage {
    command: CommandType;
    [key: string]: any;
}
export declare class MessageClient {
    private partnerWindow;
    private readonly eventHandler;
    private readonly handlers;
    constructor(partnerWindow: Window);
    close(): void;
    send(message: any): void;
    sendError(err: any): void;
    register<T extends IMessage>(commandType: CommandType, handler: (message: T) => void): void;
    unregister<T extends IMessage>(commandType: CommandType, handler: (message: T) => void): void;
    registerWildcard(handler: (message: IMessage) => void): void;
    private handleEvent(ev);
    private dispatch(message, handlers);
}
/**
 * Tries to make sense of the response of a request.
 */
export declare function toErrorValue(err: any): IError | null;
