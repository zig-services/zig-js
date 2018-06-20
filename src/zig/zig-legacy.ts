/**
 * Test if we want do enable legacy game patching.
 */
import {logger} from "../_common/common";
import {injectStyle, onDOMLoad, onLoad} from "../_common/dom";
import {GameMessageInterface, MessageClient} from "../_common/message-client";
import {executeRequestInParent, Request, Response} from "../_common/request";
import {parseGameConfigFromURL} from "../_common/config";

function XMLHttpRequestUsingMessageClient() {
    const log = logger("zig.legacy.xhr");

    const gameConfig = parseGameConfigFromURL();

    const iface = new GameMessageInterface(
        new MessageClient(window.parent),
        gameConfig.canonicalGameName);

    const RealXMLHttpRequest: typeof XMLHttpRequest = window["XMLHttpRequest"];

    function _XMLHttpRequest() {
        const xhr = new RealXMLHttpRequest();

        function replace<K extends keyof XMLHttpRequest>(name: K, fn: (original: XMLHttpRequest[K]) => XMLHttpRequest[K]): void {
            const original = xhr[name];
            let replacement = fn(original.bind(xhr));
            Object.defineProperty(xhr, name, {get: () => replacement});
        }

        function replaceSimple<K extends keyof XMLHttpRequest>(name: K, fn: XMLHttpRequest[K]): void {
            replace(name, () => fn);
        }

        function replaceWithResponse(resp: Response): void {
            Object.defineProperty(xhr, "responseText", {get: () => resp.body});
            Object.defineProperty(xhr, "status", {get: () => resp.statusCode});
            Object.defineProperty(xhr, "readyState", {get: () => XMLHttpRequest.DONE});
        }

        let req: Request = null;
        let listeners: { [eventType: string]: any[] } = {};

        async function executeInParent() {
            try {
                const response = await executeRequestInParent(iface, req);
                log.info("Got response from parent: ", response);

                replaceWithResponse(response);

                dispatchEvent("readystatechange");
                dispatchEvent("load")
            } catch (err) {
                dispatchEvent("error", err);
                dispatchEvent("Error", err);
            }
        }

        function dispatchEvent(type: string, ...args: any[]) {
            const handler = xhr["on" + type];
            if (handler) {
                log.debug(`Dispatching to event handler: `, handler);
                handler.call(xhr, xhr, ...args);
            }

            (listeners[type] || []).forEach(handler => {
                log.debug(`Dispatching to event handler: `, handler);
                handler(xhr, xhr, ...args)
            });
        }

        replace("open", open => {
            return (method, url, async = true) => {

                // mojimoney is wrongly requesting "../resource", so we change it to "./resource".
                if (location.href.indexOf("mojimoney") !== -1) {
                    url = url.replace(/^\.\.\//, "./");
                }

                const needsIntercept = new RegExp("^(?:https?://[^/]+)?(/product/iwg/|/iwg/)").test(url);
                if (needsIntercept) {
                    log.info(`Intercepting xhr request: ${method} ${url}`);

                    const ukGameURL = `/iwg/${gameConfig.canonicalGameName}uk/`;
                    if (url.indexOf(ukGameURL) !== -1) {
                        log.info(`Detected a legacy uk game, rewriting to ${gameConfig.canonicalGameName}`);
                        url = url.replace(ukGameURL, `/iwg/${gameConfig.canonicalGameName}/`);
                    }

                    // .ie games shared a pool with the .com games and are using the old canonical name
                    // in requests without /ie$/ ending. This is no longer the case.
                    // Therefore we need to rewrite the url to use the real canonicalGameName if it is
                    // one of the ie games.
                    const ieGames = [
                        "cashbusterie", "brilliantie", "bingoie", "crosswordie", "bonusbingoie",
                        "instantcashie", "instantcashplatinumie", "latwayie", "nesteggie", "cashcowie",
                    ];

                    if (ieGames.indexOf(gameConfig.canonicalGameName) !== -1) {
                        const ieGameURL = `/iwg/${gameConfig.canonicalGameName.replace(/ie$/, "")}/`;
                        if (url.indexOf(ieGameURL) !== -1) {
                            log.info(`Detected a legacy ie game, rewriting to ${gameConfig.canonicalGameName}`);
                            url = url.replace(ieGameURL, `/iwg/${gameConfig.canonicalGameName}/`);
                        }
                    }

                    req = {
                        method: method,
                        path: url.replace('https://mylotto24.frontend.zig.services', ''),
                        body: null,
                        headers: {},
                    };

                    replaceSimple("setRequestHeader", (header, value) => {
                        // let the parent fill this one in.
                        if (header.toUpperCase() === "X-CSRF-TOKEN") {
                            return;
                        }

                        req.headers[header] = value;
                    });

                    replaceSimple("addEventListener", (type, listener) => {
                        listeners[type] = (listeners[type] || []).concat(listener);
                    });

                    replaceSimple("send", (arg?: any): void => {
                        req.body = arg;

                        log.info("Executing intercepted xhr request: ", req);
                        void executeInParent();
                    });

                } else {
                    open(method, url, async);
                }
            };
        });

        return xhr;
    }

    _XMLHttpRequest["DONE"] = RealXMLHttpRequest.DONE;
    _XMLHttpRequest["LOADING"] = RealXMLHttpRequest.LOADING;
    _XMLHttpRequest["HEADERS_RECEIVED"] = RealXMLHttpRequest.HEADERS_RECEIVED;
    _XMLHttpRequest["OPENED"] = RealXMLHttpRequest.OPENED;
    _XMLHttpRequest["UNSENT"] = RealXMLHttpRequest.UNSENT;

    return _XMLHttpRequest;
}

function patchInstantWinGamingStyles() {
    // add script for old instant win gaming games to improve scaling
    // of the background screen
    injectStyle(require("./legacy.css"));
}

function patchInstantWinGamingScripts() {
    let ticketInfo: any = null;

    if (window["jQuery"]) {
        const log = logger("zig.legacy.jQuery");
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
                            log.debug("Remember ticket info for later");

                            ticketInfo = {
                                ticketId: data.id,
                                externalId: data.externalId,
                                ticketNumber: data.ticketNumber
                            };
                        }
                    } catch (err) {
                        log.warn("Could not get ticketInfo from response", err);
                    }

                    // call original function
                    return _success.call(this, data, status, xhr);
                };
            }
        });
    }

    const parent = (function _parentWindow() {
        const log = logger("zig.legacy.parent");

        const _parent = window.parent;
        const _postMessage = window.parent.postMessage;

        return {
            location: window.parent.location,

            postMessage(message: any, ...args: any[]): void {
                try {
                    // test if we need to intercept this message
                    if (ticketInfo && message && message.command === "gameStarted") {
                        log.info("Intercepted gameStarted message");

                        // copy values to the object, not overwriting already set values
                        ["ticketId", "externalId", "ticketNumber"].forEach((name: string) => {
                            if (message[name] == null && ticketInfo[name] != null) {
                                log.debug(`Adding ${name} = ${ticketInfo[name]} to post message`);
                                message[name] = ticketInfo[name];
                            }
                        });

                        // clear the info after using it as it belongs to only one /tickets request
                        ticketInfo = null;
                    }
                } catch (err) {
                    log.warn("Could not add ticketInfo to message", err);
                }

                // call original function and forward parameters
                return _postMessage.call(_parent, message, ...args);
            }
        };
    }());

    Object.defineProperty(window, "parent", {get: () => parent});
}

export function isLegacyGame(): boolean {
    return /\blegacyGame=true\b/.test(location.href);
}


export function patchLegacyGame() {
    // Inject code to rewrite request rules and everything.
    window["XMLHttpRequest"] = XMLHttpRequestUsingMessageClient();

    onDOMLoad(() => {
        let log = logger("zig.legacy");

        // check if it is an instant win gaming game
        if (document.querySelector("#gamecontainer") == null)
            return;

        log.info("Detected instant win gaming game.");

        // Add extra styles to fix scaling of loader screens and scroll bar.
        patchInstantWinGamingStyles();

        onLoad(() => {
            log.info("Do extra monkey patching for instant win gaming games");
            try {
                // Add extra scripts for instant win gaming to save and restore extra ticket data.
                patchInstantWinGamingScripts();
            } catch (err) {
                log.warn("Could not patch legacy game:", err)
            }
        });
    });
}
