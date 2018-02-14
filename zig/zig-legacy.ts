/**
 * Test if we want do enable legacy game patching.
 */
import {IGameConfig, logger} from "../_common/common";
import {injectStyle} from "../_common/dom";

function replaceResponseText(xhr: XMLHttpRequest, statusCode: number, responseText: string): void {
    Object.defineProperty(xhr, "readyState", {get: () => 4});
    Object.defineProperty(xhr, "status", {get: () => statusCode});
    Object.defineProperty(xhr, "responseText", {get: () => responseText});
}

function patchXMLHttpRequest(gameConfig: IGameConfig) {
    const log = logger("[zig-xhr]");
    const XMLHttpRequest = window["XMLHttpRequest"];

    function ZigXMLHttpRequest() {
        const xhr: XMLHttpRequest = new XMLHttpRequest();

        // Do not let the script set its own headers.
        //
        const xhrSetRequestHeader = xhr.setRequestHeader;
        xhr.setRequestHeader = (key: string, value: string) => {
            if (key.toLowerCase() === "content-type") {
                if (xhr.readyState == XMLHttpRequest.OPENED) {
                    log(`Set Content-Type header with value ${value}`);
                    xhrSetRequestHeader.call(xhr, key, value);
                }

                return;
            }

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
        ZigXMLHttpRequest[key] = XMLHttpRequest[key];
    });

    window["XMLHttpRequest"] = ZigXMLHttpRequest;
}

function patchInstantWinGamingStyles() {
    // add script for old instant win gaming games to improve scaling
    // of the background screen
    injectStyle(`
        #loader img { 
          max-width: inherit;
          width: 100%;
          max-height: 100%;
        }
        #loaderImageHolder img { 
          -webkit-transform: none;
          transform: none;
          position: absolute;
          top: 0;
          left: 0;
        }
        #loaderImageHolder { 
          position: absolute;
          width: 100%; 
          top: 0;
          left: 0;
          -webkit-transform: none;
          transform: none;
          max-height: !inherit;
          height: 100%; 
        }
        #loadingBarHolder { z-index: 1; }
        #loadingBarHolder.loaded { display: none !important; }
    `);
}

function patchInstantWinGamingScripts() {
    const log = logger("[zig-legacy]");

    let ticketInfo: any = null;

    if (window["jQuery"]) {
        const jQuery: any = window["jQuery"];

        // jQuery ajax prefilter gets called with the options passed to jQuery.ajax before executing
        // the ajax request. We use it to replace the "success"-callback to inject a piece of code
        // to extract the ticket info from the response. The ticket info is then stored as "ticketInfo".
        jQuery.ajaxPrefilter((options: any) => {
            if ((options.url || "").match("/tickets$")) {
                const _success: any = options.success || function () {
                };
                options.success = function (data: any, status: number, xhr: XMLHttpRequest) {
                    try {
                        // extract data only if response looks good
                        if (data && data.id && data.externalId) {
                            log("Remember ticket info for later");

                            ticketInfo = {
                                ticketId: data.id,
                                externalId: data.externalId,
                                ticketNumber: data.ticketNumber
                            };
                        }
                    } catch (err) {
                        log("Could not get ticketInfo from response", err);
                    }

                    // call original function
                    return _success.call(this, data, status, xhr);
                };
            }
        });
    }

    const _parent = window.parent;
    const _postMessage = window.parent.postMessage;

    const parent: any = {
        location: window.parent.location,

        postMessage(message: any, ...args: any[]): void {
            try {
                // test if we need to intercept this message
                if (ticketInfo && message && message.command === "gameStarted") {
                    log("Intercepted gameStarted message");

                    // copy values to the object, not overwriting already set values
                    ["ticketId", "externalId", "ticketNumber"].forEach((name: string) => {
                        if (message[name] == null && ticketInfo[name] != null) {
                            log(`Adding ${name} = ${ticketInfo[name]} to post message`);
                            message[name] = ticketInfo[name];
                        }
                    });

                    // clear the info after using it as it belongs to only one /tickets request
                    ticketInfo = null;
                }
            } catch (err) {
                log("Could not add ticketInfo to message", err);
            }

            // call original function and forward parameters
            return _postMessage.call(_parent, message, ...args);
        }
    };

    Object.defineProperty(window, "parent", {get: () => parent});
}

export function isLegacyGame(): boolean {
    return /\blegacyGame=true\b/.test(location.href);
}


export function patchLegacyGame(gameConfig: IGameConfig) {
    // Inject code to rewrite request rules and everything.
    patchXMLHttpRequest(gameConfig);


    window.addEventListener("DOMContentLoaded", () => {
        let log = logger("[zig-legacy]");

        // check if it is an instant win gaming game
        if (document.querySelector("#gamecontainer") == null)
            return;

        log("Detected instant win gaming game.");

        // Add extra styles to fix scaling of loader screens and scroll bar.
        patchInstantWinGamingStyles();

        window.addEventListener("load", () => {
            log("Do extra monkey patching for instant win gaming games");
            try {
                // Add extra scripts for instant win gaming to save and restore extra ticket data.
                patchInstantWinGamingScripts();
            } catch (err) {
                log("Could not patch legacy game:", err)
            }
        });
    });
}
