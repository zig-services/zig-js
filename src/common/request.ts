import {FetchRequestMessage, FetchResultMessage, GameMessageInterface, ParentMessageInterface} from './message-client';
import {Logger} from './logging';

const log = Logger.get('zig.Request');

export interface Request {
    method: string;
    path: string;
    headers: { [key: string]: string };
    body: string | null;
}

export interface Response {
    statusCode: number;
    body: string | null;

    // the raw response
    xhr?: XMLHttpRequest;
}

export type ResponseResult = { response: Response; }

/**
 * A 'Result' is either a 'Response' or an error string.
 */
export type Result = ResponseResult | { error: string }

/**
 * Adds a unique id to an object. This is used to correlate
 * request and response messages.
 */
export interface WithCID<T> {
    data: T;
    cid: string;
}

function hasResponse(r: Result): r is ResponseResult {
    return 'response' in r && typeof r.response !== 'undefined';
}

/**
 * Executes/Performs the given requests locally by converting it into a XMLHttpRequest.
 * In case of an error (like failed a connection), the error will be thrown as an exception.
 */
export async function executeRequestLocally(req: Request): Promise<Response> {
    const result = await executeRequest(req);
    if (hasResponse(result)) {
        return result.response;
    } else {
        throw result.error;
    }
}

// Need to keep a reference to the original XMLHttpRequest class before
// monkey patching it for legacy games.
const OriginalXMLHttpRequest = XMLHttpRequest;

export async function executeRequest(req: Request): Promise<Result> {
    log.info('Execute http request locally', req);

    const xhr = new OriginalXMLHttpRequest();

    log.debug(`Open request ${req.method} ${req.path}`);
    xhr.open(req.method, req.path);

    // copy request headers to request
    Object.keys(req.headers || {}).forEach(key => {
        const value = req.headers[key];

        log.debug(`Add request header ${key}: ${value}`);
        xhr.setRequestHeader(key, value);
    });

    // set the x-csrf header based on the cookie value.
    const match = /X-CSRF-TOKEN=([^;]+)/.exec(document.cookie || '');
    if (match && match[1]) {
        log.debug('Set csrf token header based on document cookie');
        xhr.setRequestHeader('X-CSRF-TOKEN', match[1]);
    }

    log.debug('Sending XMLHttpRequest with body', req.body);
    xhr.send(req.body === null ? undefined : req.body);

    return new Promise<Result>(resolve => {
        // forward request results
        xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                log.debug(`Request for ${req.path} finished with status code ${xhr.status}`);

                // get body (only type = text is allowed)
                let body: string | null = null;
                if (xhr.responseType === '' || xhr.responseType === 'text') {
                    body = xhr.responseText;
                }

                const result: Result = {
                    response: {
                        statusCode: xhr.status,
                        body: body,
                        xhr: xhr,
                    },
                };

                resolve(result);
            }
        };

        // forward connection errors or something like that
        xhr.onerror = err => {
            log.debug('Request failed with error:', err);
            const result: Result = {error: (err as any).message || ''};
            resolve(result);
        };
    });
}

/**
 * Registers a handler for Request messages. By default, this calls _executeRequestLocally to handle
 * the request locally.
 */
export function registerRequestListener(iface: ParentMessageInterface,
                                        handler: ((req: Request) => Promise<Result>) | null = null) {

    const h = handler || executeRequest;

    iface.register('zig.XMLHttpRequest.request', async (message: FetchRequestMessage) => {
        const req: WithCID<Request> = message.request;
        const result = await h(req.data);

        if (hasResponse(result)) {
            // remove xhr instance before sending it via post message.
            delete result.response['xhr'];
        }

        iface.xhrResult({cid: req.cid, data: result});
    });
}

let cidUniqueNumber = 1;

/**
 * Executes the given request in the parent frame. This sends the request as a message using the
 * given GameMessageInterface instance to the parent. The parent needs to execute the request
 * using XMLHttpRequests. After executing the request, it will respond with the requests result.
 *
 * This method will wait for the result to the request and provide it as a promise to a Response object.
 */
export async function forwardRequestToParent(iface: GameMessageInterface, req: Request): Promise<Response> {
    // a unique id that identifies the response to this request
    const cid = [Date.now(), cidUniqueNumber++, req.path].join(':');

    return await new Promise<Response>((resolve, reject) => {
        // we are interested in results from our partner
        const unregister = iface.register('zig.XMLHttpRequest.result', (message: FetchResultMessage) => {
            const result: WithCID<Result> = message.result;
            if (result.cid !== cid) {
                return;
            }

            // remove the listener, we got the message we are interested in.
            unregister();

            if (!hasResponse(result.data)) {
                // handle rejection on connection errors or similar
                reject(result.data.error);

            } else {
                // we got a good result.
                resolve(result.data.response);
            }
        });

        const reqCopy = {...req};

        // set a empty json body if no body is set.
        if (reqCopy.body == null) {
            reqCopy.body = '{}';
        }

        // send the request to the partner.
        iface.xhrRequest({cid, data: reqCopy});
    });
}
