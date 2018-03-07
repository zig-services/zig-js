import {MessageClient} from "./message-client";
import {logger} from "./common";

export interface Request {
    method: string;
    path: string;
    headers: { [key: string]: string };
    body: string;
}

export interface Response {
    statusCode: number;
    body: string;
}

export interface Result {
    response?: Response;
    error?: string;
}

interface WithCID<T> {
    data: T;
    cid: string;
}

export async function executeRequestLocally(req: Request): Promise<Response> {
    const result = await _executeRequestLocally(this.request);
    if (result.error) {
        throw result.error;
    }

    return result.response;
}

const log = logger("[zig-xhr]");

async function _executeRequestLocally(req: Request): Promise<Result> {
    log("Execute http request", req);

    const xhr = new XMLHttpRequest();

    xhr.open(req.method, req.path);

    // copy request headers to request
    Object.keys(req.headers || {}).forEach(key => {
        xhr.setRequestHeader(key, req.headers[key]);
    });

    // set the x-csrf header based on the cookie value.
    const match = /X-CSRF-TOKEN=([^;]+)/.exec(document.cookie || "");
    if (match && match[1]) {
        xhr.setRequestHeader("X-CSRF-TOKEN", match[1]);
    }

    xhr.send(req.body);

    return new Promise<Result>(resolve => {
        // forward request results
        xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                const result: Result = {
                    response: {
                        statusCode: xhr.status,
                        body: xhr.responseText,
                    }
                };

                resolve(result);
            }
        };

        // forward connection errors or something like that
        xhr.onerror = err => {
            resolve({error: err.message || ""});
        };
    });
}

export function registerRequestListener(mc: MessageClient, handler: (req: Request) => Promise<Result> = _executeRequestLocally) {
    mc.register("zig.XMLHttpRequest.request", async (message) => {
        const req: WithCID<Request> = message.request;
        const result = await handler(req.data);
        mc.send({
            command: "zig.XMLHttpRequest.result",
            result: <WithCID<Response>>{cid: req.cid, data: result},
        });
    });
}

let cidUniqueNumber = 1;

/**
 * Executes the givne request in the parent frame
 */
export async function executeRequestInParent(mc: MessageClient, req: Request): Promise<Response> {
    const cid = req.path + ":" + Date.now() + ":" + cidUniqueNumber++;

    return new Promise<Response>(((resolve, reject) => {
        const handler = message => {
            const result: WithCID<Result> = message.result;
            if (result.cid !== cid) {
                return;
            }

            // cleanup
            mc.unregister("zig.XMLHttpRequest.result", handler);

            // handle rejection on connection errors or similar
            if (result.data.error != null) {
                reject(result.data.error);
            }

            // we got a good result.
            resolve(result.data.response);
        };

        // we are interested in results from our partner
        mc.register("zig.XMLHttpRequest.result", handler);

        // send the request to the partner.
        mc.send({
            command: "zig.XMLHttpRequest.request",
            request: <WithCID<Request>>{cid, data: req},
        })
    }));
}