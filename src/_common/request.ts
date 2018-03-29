import {GameMessageInterface, ParentMessageInterface} from "./message-client";
import {logger} from "./common";

export interface Request {
    method: string;
    path: string;
    headers: { [key: string]: string };
    body: string;

    extraSettings?: any;
}

export interface Response {
    statusCode: number;
    body: string;

    // the raw response
    xhr?: XMLHttpRequest;
}

export interface Result {
    response?: Response;
    error?: string;
}

export interface WithCID<T> {
    data: T;
    cid: string;
}

export async function executeRequestLocally(req: Request): Promise<Response> {
    const result = await _executeRequestLocally(req);
    if (result.error) {
        throw result.error;
    }

    return result.response;
}

const log = logger("[zig-xhr]");

const RealXMLHttpRequest = XMLHttpRequest;

async function _executeRequestLocally(req: Request): Promise<Result> {
    log("Execute http request", req);

    const xhr = new RealXMLHttpRequest();

    xhr.open(req.method, req.path);

    // copy request headers to request
    Object.keys(req.headers || {}).forEach(key => {
        xhr.setRequestHeader(key, req.headers[key]);
    });

    // copy extra properties.
    Object.keys(req.extraSettings || {}).forEach(key => {
        xhr[key] = req.extraSettings[key];
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
                let body: string | null = null;

                if (xhr.responseType === "" || xhr.responseType === "text") {
                    body = xhr.responseText;
                }

                const result: Result = {
                    response: {
                        statusCode: xhr.status,
                        body: body,
                        xhr: xhr,
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

export function registerRequestListener(iface: ParentMessageInterface,
                                        handler: (req: Request) => Promise<Result> = _executeRequestLocally) {

    iface.register("zig.XMLHttpRequest.request", async (message) => {
        const req: WithCID<Request> = message.request;
        const result = await handler(req.data);

        if (result.response) {
            // remove xhr instance before sending it via post message.
            delete result.response["xhr"];
        }

        iface.xhrResult({cid: req.cid, data: result});
    });
}

let cidUniqueNumber = 1;

/**
 * Executes the givne request in the parent frame
 */
export async function executeRequestInParent(iface: GameMessageInterface, req: Request): Promise<Response> {
    const cid = req.path + ":" + Date.now() + ":" + cidUniqueNumber++;

    return new Promise<Response>((resolve, reject) => {
        // we are interested in results from our partner
        const unregister = iface.register("zig.XMLHttpRequest.result", message => {
            const result: WithCID<Result> = message.result;
            if (result.cid !== cid) {
                return;
            }

            // cleanup
            unregister();

            // handle rejection on connection errors or similar
            if (result.data.error != null) {
                reject(result.data.error);
            }

            // we got a good result.
            resolve(result.data.response);
        });

        if (req.body === null) {
            req.body = '{}';
        }

        // send the request to the partner.
        iface.xhrRequest({cid, data: req});
    });
}