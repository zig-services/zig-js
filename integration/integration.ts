///<reference path="../_common/common.ts"/>

const log = logger("[zig-int]");

class Integration {
    private readonly boundMessageListener: (event: MessageEvent) => void;

    constructor(private frame: HTMLIFrameElement) {
        // create a listener for message events that arrive from the game frame.
        this.boundMessageListener = ev => this.frameMessageListener(ev);
        window.addEventListener("message", this.boundMessageListener);
    }

    public destroy(): void {
        log("Destroy event listeners from frame");
        window.removeEventListener("message", this.boundMessageListener);
    }

    private frameMessageListener(event: MessageEvent): void {
        if (event.source !== this.frame.contentWindow) {
            // skip messages from different sources.
            return;
        }

        // get the message content and dispatch to the
        // message handler functions
        const message = event.data || {};
        log("Got message from game: ", message);

        if (message.command === "updateGameHeight") {
            this.updateGameHeight(message.height);
            return;
        }
    }

    private updateGameHeight(height: number): void {
        this.frame.style.height = height + "px";
    }
}

function zigObserveGame(frame: HTMLIFrameElement) {
    const game = new Integration(frame);

    const mutationObserver = new MutationObserver(mu => {
        for (const record of mu) {
            if (record.type !== "childList") {
                continue;
            }

            for (let idx = 0; idx < record.removedNodes.length; idx++) {
                if (record.removedNodes.item(idx) === frame) {
                    mutationObserver.disconnect();
                    game.destroy();
                    return;
                }
            }
        }
    });

    mutationObserver.observe(frame.parentNode, {childList: true});
}

function includeZigGame(targetSelector: string, url: string, config: IGameConfig): void {
    const encodedConfig = btoa(JSON.stringify(config));
    const frameSource = url = url + "?config=" + encodedConfig;

    const frame = document.createElement("iframe");
    frame.src = frameSource;
    frame.allowFullscreen = true;
    frame.scrolling = "no";
    frame.style.border = "0";

    const target = document.querySelector(targetSelector);
    target.appendChild(frame);

    zigObserveGame(frame);
}

// expose to the client.
window["includeZigGame"] = includeZigGame;