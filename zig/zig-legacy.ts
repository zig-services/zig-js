///<reference path="../_common/common.ts"/>
///<reference path="../_common/dom.ts"/>

/**
 * Test if we want do enable legacy game patching.
 */
function isLegacyGame(): boolean {
    return /\blegacyGame=true\b/.test(location.href);
}

function patchLegacyGame(gameConfig: IGameConfig) {
    const log = logger("[zig-xhr]");

    const XMLHttpRequest = window["XMLHttpRequest"];

    function replaceResponseText(xhr: XMLHttpRequest, statusCode: number, responseText: string): void {
        Object.defineProperty(xhr, "readyState", {get: () => 4});
        Object.defineProperty(xhr, "status", {get: () => statusCode});
        Object.defineProperty(xhr, "responseText", {get: () => responseText});
    }

    function FakeXHR() {
        const xhr: XMLHttpRequest = new XMLHttpRequest();

        // Do not let the script set its own headers.
        //
        const xhrSetRequestHeader = xhr.setRequestHeader;
        xhr.setRequestHeader = (key: string, value: string) => {
            log(`Ignoring '${key}: ${value}' header set by script.`)
        };

        // Override the open function to intercept all requests by the client.
        //
        const xhrOpen = xhr.open;
        xhr.open = function (method: string, url: string, ...args: any[]): void {
            log(`Script wants to do ${method} request with url ${url}`);

            // mojimoney is wrongly requesting "../resource", so we change it to "./resource".
            url = url.replace(/^\.\.\//, "./");

            if (url.match("/product/iwg/[^/]+/tickets(\\?|$)")) {
                log(`Rewrite buy ticket url using game config endpoint ${gameConfig.endpoint}`);
                url = gameConfig.endpoint + "/tickets";
            }

            if (url.match("/product/iwg/[^/]+/demoticket(\\?|$)")) {
                log(`Rewrite demo ticket url using game config endpoint ${gameConfig.endpoint}`);
                url = gameConfig.endpoint + "/demo";
            }

            const matchSettle = url.match("/product/iwg/[^/]+/tickets/([^/]+)/settle");
            if (matchSettle !== null) {
                log(`Rewrite settle url using game config endpoint ${gameConfig.endpoint}`);

                const id = matchSettle[1];
                url = gameConfig.endpoint + "/tickets/" + encodeURIComponent(id) + "/settle";
            }

            // Handle the key/value endpoint by delegating it to localStorage.
            const matchState = url.match("/product/iwg/[^/]+/tickets/([^/]+)/state$");
            if (matchState !== null) {
                log(`Simulate game-state kv endpoint using localStorage`);

                const [, ticketId] = matchState;

                xhr.send = function (body: any) {
                    const key = "zig-state." + ticketId;

                    if (method === "POST") {
                        localStorage.setItem(key, body);
                        replaceResponseText(xhr, 200, "");
                        return;
                    }

                    if (method === "GET") {
                        const value = localStorage.getItem(key);
                        if (value == null) {
                            replaceResponseText(xhr, 404, "{}");
                        } else {
                            replaceResponseText(xhr, 200, value);
                        }
                    }

                    if (xhr.onreadystatechange) {
                        (xhr as any).onreadystatechange(xhr, null);
                    }
                };

                return;
            }

            // for testing we might need to send credentials
            xhr.withCredentials = (gameConfig.withCredentials === true);

            // do the real open call with the rewritten parameters.
            xhrOpen.call(xhr, method, url, ...args);

            // also forward the "normal" requested headers
            for (const headerName of Object.keys(gameConfig.headers)) {
                const headerValue = gameConfig.headers[headerName];
                xhrSetRequestHeader.call(xhr, headerName, headerValue);
            }
        };

        // elferliga is using addEventListener("load")
        const xhrAddEventListener = xhr.addEventListener;
        xhr.addEventListener = (eventType: string, handler: (this: XMLHttpRequest, ev: Event) => void) => {
            if (eventType === "load") {
                log(`Fake 'load' event handler using onreadystatechange.`);

                xhr.onreadystatechange = ev => {
                    if (xhr.readyState === XMLHttpRequest.DONE) {
                        handler.call(xhr, ev);
                    }
                };

                return;
            }

            if (eventType === "readystatechange") {
                xhr.onreadystatechange = handler;
                return;
            }

            xhrAddEventListener.call(xhr, eventType, handler);
        };

        return xhr;
    }

    // Copy static fields from the original XMLHttpRequest
    Object.keys(XMLHttpRequest).forEach(key => {
        log(`Copy static field ${key} to fake XHR object.`);
        FakeXHR[key] = XMLHttpRequest[key];
    });

    window["XMLHttpRequest"] = FakeXHR;


    // add script for old instant win gaming games to improve scaling
    // of the background screen
    injectStyle(`
        #loaderImageHolder > img {
            width: 100;
            max-width: unset !important;
        }
    `);
}
