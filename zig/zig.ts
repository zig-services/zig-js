///<reference path="../_common/common.ts"/>

const log = logger("[zig-client]");

class ZigClientImpl {
    private readonly messageClient: PostMessageCommunication;

    constructor(private gameConfig: IGameConfig) {
        this.messageClient = new PostMessageCommunication(window.parent);
    }

    public async buyTicket(payload: any = {}): Promise<ITicket> {
        return await this.propagateErrors(async () => {
            const ticket = await this.request<ITicket>("POST", this.gameConfig.endpoint + "/tickets", payload);

            this.messageClient.send({
                command: "gameStarted",
                ticket: ticket,
            });

            return ticket
        });
    }

    public async demoTicket(payload: any = {}): Promise<ITicket> {
        return await this.propagateErrors(async () => {
            let ticket = await this.request<ITicket>("POST", this.gameConfig.endpoint + "/demo", payload);

            this.messageClient.send({
                command: "gameStarted",
                ticket: ticket,
            });

            return ticket;
        });
    }

    public async settleTicket(id: string): Promise<void> {
        return await this.propagateErrors(async () => {
            const url = this.gameConfig.endpoint + "/tickets/" + encodeURIComponent(id) + "/settle";
            const response = await this.request<any>("POST", url);

            this.messageClient.send({
                command: "gameSettled",
                response: response,
            });

            return
        });
    }

    private async propagateErrors<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn()
        } catch (err) {
            this.messageClient.sendError(err);
            throw err;
        }
    }

    private async request<T>(method: string, url: string, body: any = null): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const req = new XMLHttpRequest();

            req.onreadystatechange = () => {
                if (req.readyState === XMLHttpRequest.DONE) {
                    if (Math.floor(req.status / 100) === 2) {
                        resolve(JSON.parse(req.responseText || "null"));
                    } else {
                        reject(toErrorValue(req));
                    }
                }
            };

            req.withCredentials = (this.gameConfig.withCredentials === true);

            req.open(method, url, true);

            // forward the requested headers
            for (const headerName of Object.keys(this.gameConfig.headers)) {
                const headerValue = this.gameConfig.headers[headerName];
                log(headerName, headerValue);
                req.setRequestHeader(headerName, headerValue);
            }

            req.send(body !== null ? JSON.stringify(body) : null);
        });
    }

    public trackGameHeight(marker: HTMLElement): void {
        let previousMarkerTop = 0;

        function topOf(element: HTMLElement): number {
            const top = element.offsetTop;
            if (!element.offsetParent) {
                return top;
            }

            return topOf(<HTMLElement>element.offsetParent) + element.offsetTop;
        }

        window.setInterval(() => {
            const markerTop = topOf(marker);
            const difference = Math.abs(markerTop - previousMarkerTop);

            if (difference > 1) {
                previousMarkerTop = markerTop;
                this.publishMessage("updateGameHeight", {height: markerTop});
            }
        }, 100);
    }

    private publishMessage(command: string, extras: object): void {
        const message = Object.assign({command}, extras);
        log("Publishing message ", message);
        window.parent.postMessage(message, "*");
    }
}

/**
 * Extracts the game config from the pages url.
 * Throws an error if extraction is not possible.
 */
function extractGameConfig(): IGameConfig {
    const match = /\?.*\bconfig=([a-zA-Z0-9+-]+=*)/.exec(location.href);
    if (match == null) {
        throw new Error("no config parameter found")
    }

    const config: IGameConfig = JSON.parse(atob(match[1]));
    if (!config) {
        throw new Error("config is empty");
    }

    if (config.endpoint == null) {
        throw new Error("endpoint not set in config")
    }

    config.headers = config.headers || {};
    return config;
}

function monkeyPatchLegacyGames(gameConfig: IGameConfig) {
    const log = logger("[zig-xhr]");
    const XMLHttpRequest = window["XMLHttpRequest"];

    function XHR() {
        const xhr: XMLHttpRequest = new XMLHttpRequest();

        const xhrOpen = xhr.open;
        xhr.open = function (method: string, url: string, ...args: any[]): void {
            if (new RegExp("/product/iwg/[a-z]+/tickets(\\?|$)").test(url)) {
                log("rewrite buy ticket url");
                url = gameConfig.endpoint + "/tickets";
            }

            if (new RegExp("/product/iwg/[a-z]+/demoticket(\\?|$)").test(url)) {
                log("rewrite demo ticket url");
                url = gameConfig.endpoint + "/demo";
            }

            const match = new RegExp("/product/iwg/crossword/tickets/([^/]+)/settle(\\?|$)").exec(url);
            if (match !== null) {
                log("rewrite settle url");

                const id = match[1];
                url = gameConfig.endpoint + "/tickets/" + encodeURIComponent(id) + "/settle";
            }

            // if (url.indexOf("/state") !== -1) {
            //     xhr.setRequestHeader = () => {
            //     };
            //
            //     xhr.send = function () {
            //         Object.defineProperty(xhr, "readyState", {get: () => -1});
            //         (xhr as any).onreadystatechange(xhr, null);
            //     };
            //
            //     return;
            // }

            xhr.withCredentials = (gameConfig.withCredentials === true);
            xhrOpen.call(xhr, method, url, ...args);

            // forward the requested headers
            for (const headerName of Object.keys(gameConfig.headers)) {
                const headerValue = gameConfig.headers[headerName];
                xhr.setRequestHeader(headerName, headerValue);
            }
        };


        return xhr;
    }

    Object.keys(XMLHttpRequest).forEach(key => {
        XHR[key] = XMLHttpRequest[key];
    });

    window["XMLHttpRequest"] = XHR;
}

const gameConfig = extractGameConfig();

monkeyPatchLegacyGames(gameConfig);

window["ZigClient"] = new ZigClientImpl(gameConfig);

