import { MessageClient } from "../_common/message-client";
import { Request, Result } from "../_common/request";
import { IGameConfig } from "../_common/config";
export declare function zigObserveGame(wrapper: HTMLDivElement, frame: HTMLIFrameElement): MessageClient;
export declare function includeZigGame(targetSelector: string, url: string, config: IGameConfig): MessageClient;
export declare function registerHTTPHandlerOnly(frame: HTMLIFrameElement, handler?: (r: Request) => Promise<Result>): void;
export declare const Zig: {
    include: typeof includeZigGame;
    observe: typeof zigObserveGame;
    registerHTTPHandlerOnly: typeof registerHTTPHandlerOnly;
};
