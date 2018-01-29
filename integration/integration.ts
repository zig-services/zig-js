import {IGameConfig, IGameSettings, logger} from "../_common/common";
import {MessageClient} from "../_common/communication";

const log = logger("[zig-int]");

class Integration {
    private readonly messageClient: MessageClient;

    constructor(private wrapper: HTMLDivElement, private frame: HTMLIFrameElement) {
        this.messageClient = new MessageClient(frame.contentWindow);
        this.messageClient.register("updateGameHeight", ev => this.updateGameHeight(ev.height));
        this.messageClient.register("updateGameSettings", ev => this.updateGameSettings(ev.gameSettings));
        this.messageClient.registerWildcard(ev => log(`Got message of type ${ev.command}`))
    }

    public destroy(): void {
        log("Destroy event listeners from frame");
        this.messageClient.close();
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
