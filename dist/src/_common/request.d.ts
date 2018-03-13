import { MessageClient } from "./message-client";
export interface Request {
    method: string;
    path: string;
    headers: {
        [key: string]: string;
    };
    body: string;
    extraSettings?: any;
}
export interface Response {
    statusCode: number;
    body: string;
    xhr?: XMLHttpRequest;
}
export interface Result {
    response?: Response;
    error?: string;
}
export declare function executeRequestLocally(req: Request): Promise<Response>;
export declare function registerRequestListener(mc: MessageClient, handler?: (req: Request) => Promise<Result>): void;
/**
 * Executes the givne request in the parent frame
 */
export declare function executeRequestInParent(mc: MessageClient, req: Request): Promise<Response>;
