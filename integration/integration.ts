///<reference path="../_common/common.ts"/>

const log = logger("[zig-int]");

class Integration {
    private readonly boundMessageListener: (event: MessageEvent) => void;

    constructor(private wrapper: HTMLDivElement, private frame: HTMLIFrameElement) {
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

        if (message.command === "updateGameSettings") {
            this.updateGameSettings(message.gameSettings);
        }
    }

    private updateGameHeight(height: number): void {
        this.frame.style.height = height + "px";
    }

    private updateGameSettings(gameSettings: IGameSettings): void {
        if (gameSettings.aspect > 0) {
            this.wrapper.style.position = "relative";
            this.wrapper.style.paddingBottom = (100 / gameSettings.aspect) + "%";

            this.frame.style.position = "absolute";
            this.frame.style.height = "100%";
        }
    }
}

function zigObserveGame(wrapper: HTMLDivElement, frame: HTMLIFrameElement) {
    const game = new Integration(wrapper, frame);

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

    mutationObserver.observe(wrapper, {childList: true});
}

function includeZigGame(targetSelector: string, url: string, config: IGameConfig): void {
    const encodedConfig = btoa(JSON.stringify(config));
    const frameSource = url = url + "?config=" + encodedConfig;

    const frame = document.createElement("iframe");
    frame.src = frameSource;
    frame.allowFullscreen = true;
    frame.scrolling = "no";
    frame.style.border = "0";
    frame.style.width = "100%";

    const wrapper = document.createElement("div");
    wrapper.style.width = "100%";
    wrapper.appendChild(frame);

    const target = document.querySelector(targetSelector);
    target.appendChild(wrapper);

    zigObserveGame(wrapper, frame);
}

// expose to the client.
window["includeZigGame"] = includeZigGame;