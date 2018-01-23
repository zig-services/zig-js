type TicketId = string;

interface ITicket {
    id: TicketId;
}

interface IError {
    type: string;
    title: string;
    status?: number;
    details?: string;
}

interface ZigClient {
    /**
     * Buy a ticket for the current game. Will return the ITicket instance on success
     * and reject the promise with an IError if an error occurs.
     */
    buyTicket(gameInput?: object): PromiseLike<ITicket>;

    /**
     * Settles the ticket identified by the given id.
     */
    settleTicket(id: TicketId): PromiseLike<void>;

    /**
     * Tracks the height of the game by tracking the top position of
     * the given marker object.
     */
    trackGameHeight(marker: HTMLElement): void;
}

interface IGameConfig {
    endpoint: string;
    headers: { [key: string]: string; };

    // for testing only. Enables xhr.withCredentials if set.
    withCredentials?: boolean
}

const ZigClient: ZigClient = (function () {
    class ZigClientImpl implements ZigClient {
        constructor(private gameConfig: IGameConfig) {
        }

        public buyTicket(payload: any = {}): Promise<ITicket> {
            return this.request<ITicket>("POST", this.gameConfig.endpoint + "/tickets", payload);
        }

        public settleTicket(id: string): Promise<void> {
            return this.request<void>("POST", this.gameConfig.endpoint + "/settle/" + id);
        }

        private async request<T>(method: string, url: string, body: any = null): Promise<T> {
            return new Promise<T>((resolve, reject) => {
                const req = new XMLHttpRequest();

                req.onreadystatechange = () => {
                    if (req.readyState === XMLHttpRequest.DONE) {
                        if (Math.floor(req.status / 100) === 2) {
                            resolve(JSON.parse(req.responseText));
                        } else {
                            reject(parseErrorValue(req));
                        }
                    }
                };

                req.withCredentials = (this.gameConfig.withCredentials === true);

                req.open(method, url, true);

                // forward the requested headers
                for (const headerName of Object.keys(this.gameConfig.headers)) {
                    const headerValue = this.gameConfig.headers[headerName];
                    console.log(headerName, headerValue);
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
                    this.publish("updateGameHeight", {height: markerTop});
                }
            }, 100);
        }

        private publish(command: string, extras: object): void {
            const message = Object.assign({command}, extras);
            console.log("Publishing message ", message);
            window.parent.postMessage(message, "*");
        }
    }

    /**
     * Tries to make sense of the response of a request.
     * @param {XMLHttpRequest} req
     * @returns {IError}
     */
    function parseErrorValue(req: XMLHttpRequest): IError {
        try {
            const parsed = JSON.parse(req.responseText);
            if (parsed.error && parsed.status) {
                return {
                    type: "urn:x-tipp24:remote-client-error",
                    title: "Remote error",
                    details: parsed.error,
                    status: parsed.status
                }
            }

            // looks like a properly formatted error
            if (parsed.type && parsed.title && parsed.details) {
                return <IError> parsed;
            }
        } catch {
            // probably json decoding error, just continue with a default error.
        }

        return {
            type: "urn:x-tipp24:remote-client-error",
            title: "Remote error",
            status: req.status,
            details: req.responseText,
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

    return new ZigClientImpl(extractGameConfig());
})();
