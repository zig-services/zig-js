import {IError, IGameConfig, IGameSettings, logger} from "../_common/common";
import {MessageClient} from "../_common/message-client";
import {injectStyle} from "../_common/dom";
import {clientVersion} from "../_common/vars";
import {delegateToVersion} from "../_common/delegate";
import {onDOMLoad} from "../_common/events";
import {Options} from "../_common/options";

const log = logger("[zig-wrapper]");

/**
 * Get game config from window
 */
const GameSettings = <IGameSettings>window["GameSettings"];
if (GameSettings == null) {
    throw new Error("window.GameConfig must be initialized.");
}

const GameConfig: IGameConfig = JSON.parse(atob(extractConfigParameter()));


/**
 * Get the config parameter from the current location. This parameter will be
 * forwarded to the inner iframe.
 */
function extractConfigParameter(): string {
    const match = /\?.*\bconfig=([a-zA-Z0-9+-]+=*)/.exec(location.href);
    if (match == null) {
        throw new Error("no config parameter found.")
    }

    return match[1];
}

// Initializes the css styles for the wrapper frame.
declare function require(module: string): string;

function initializeStyle() {
    injectStyle(require("./style.css"));
}

/**
 * Create and load the real game inside the iframe.
 * This method will add the iframe to the body of the page.
 */
function initializeGame(): HTMLIFrameElement {
    const config = extractConfigParameter();

    const sep = GameSettings.index.indexOf("?") === -1 ? "?" : "&";
    let url = GameSettings.index + sep + "config=" + config;

    if (GameSettings.legacyGame === true) {
        url += "&legacyGame=true";
    }

    log(`Creating iframe with URL ${url}`);

    // create iframe and insert into document.
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.allowFullscreen = true;
    iframe.scrolling = "no";

    // send the new config to the parent so it can update the frame size
    const parentMessageClient = new MessageClient(window.parent);
    parentMessageClient.send({command: "updateGameSettings", gameSettings: GameSettings});

    // add game to window
    document.body.appendChild(iframe);

    function trySetupMessageClient(): void {
        if (iframe.contentWindow == null) {
            log("contentWindow not yet available, waiting...");
            setTimeout(trySetupMessageClient, 250);
            return;
        }

        const innerMessageClient = new MessageClient(iframe.contentWindow);
        initializeMessageProxy(parentMessageClient, innerMessageClient);

        window.onfocus = () => {
            log("got focus, focusing iframe now.");
            setTimeout(() => iframe.contentWindow.focus(), 100);
        };
    }

    trySetupMessageClient();

    return iframe;
}

/**
 * Shows an error dialog for the given error.
 */
function showErrorDialog(error: IError) {
    let message = error.details;

    if (error.type === "urn:x-tipp24:remote-client-error") {
        message = "An error occurred while communicating with the game backend, please try again.";
    }

    const div = document.createElement("div");
    div.innerHTML = `
      <div class='zig-overlay'>
        <div class='zig-alert'>
          <div class='zig-alert__title'></div>
          <div class='zig-alert__text'></div>
          <a href='#' class='zig-alert__button'>Close</a>
        </div>
      </div>`;

    div.querySelector<HTMLElement>(".zig-alert__title").innerText = error.title;
    div.querySelector<HTMLElement>(".zig-alert__text").innerText = message;
    div.querySelector<HTMLElement>(".zig-alert__button").onclick = () => div.parentNode.removeChild(div);

    document.body.appendChild(div);
}

/**
 * Set up a proxy for post messages. Everything coming from the iframe will be forwarded
 * to the parent, and everything coming from the parent will be send to the iframe.
 */
function initializeMessageProxy(parentMessageClient: MessageClient, innerMessageClient: MessageClient): void {
    // proxy between both windows
    innerMessageClient.registerWildcard(ev => parentMessageClient.send(ev));
    parentMessageClient.registerWildcard(ev => innerMessageClient.send(ev));

    if (!GameConfig.noOverlay) {
        log("Register messages listeners for overlay");

        // handle some messages in the integration
        innerMessageClient.register("gameLoaded", () => showControls(innerMessageClient));
        innerMessageClient.register("gameFinished", () => showControls(innerMessageClient));
        innerMessageClient.register("error", ev => showErrorDialog(ev as any));
    }
}

function showControls(messageClient: MessageClient) {
    if (document.querySelector(".zig-start-button") != null) {
        return
    }

    const div = document.createElement("a");
    div.className = "zig-start-button";
    div.innerText = "Start game";
    div.href = "#";
    document.body.appendChild(div);

    div.onclick = ev => {
        ev.preventDefault();

        messageClient.send("playGame");
        div.parentNode.removeChild(div);
    }
}

function replaceGameConfig(gameConfig: IGameConfig) {
    log("Reload with game config replaced with:", gameConfig);
    const config = btoa(JSON.stringify(gameConfig));
    location.href = location.href.replace(/\bconfig=[^&]+/, `config=${config}`);
}

function initializeWinningClassOverride(): boolean {
    const override = Options.winningClassOverride;
    if (override == null)
        return false;

    const params = `&wc=${override.winningClass}&scenario=${override.scenarioId}`;
    if (location.href.indexOf(params) === -1) {
        const url = location.href.replace(/\b(scenario|wc)=[^&]+/g, "") + params;

        log("Reload outer.html with updated url:", url);
        location.href = url;

        return true;
    }

    return false;
}

onDOMLoad(() => {
    log(`Initializing zig wrapper in ${clientVersion}`);

    if (delegateToVersion("wrapper.min.js")) {
        return;
    }

    if (initializeWinningClassOverride()) {
        return;
    }

    initializeStyle();

    initializeGame();

    if (Options.debuggingLayer) {
        document.body.style.borderTop = "0.5em solid red";
    }
});
