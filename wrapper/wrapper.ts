import {IError, IGameConfig, IGameSettings, logger} from "../_common/common";
import {MessageClient} from "../_common/communication";
import {injectStyle} from "../_common/dom";
import {clientVersion} from "../_common/vars";
import {delegateToVersion} from "../_common/delegate";
import {onDOMLoaded} from "../_common/events";

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
function initializeStyle() {
    injectStyle(`
        html, body, iframe {
            width: 100vw;
            height: 100vh;
            
            border: 0;
            margin: 0;
            padding: 0;
          
            font-family: sans-serif;
        }
        
        .zig-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.2);
        }
        
        .zig-alert {
            position: absolute;
            z-index: 1;
            
            margin-left: auto;
            margin-right: auto;
            left: 0;
            right: 0;
            
            top: 3em;
            width: 80%;
            max-width: 20em;
            background: white;
            box-shadow: 0 0 0.5em rgba(0, 0, 0, 0.25);
            padding: 1em;
            border-radius: 0.25em;
            
            color: black;
        }
        
        .zig-alert__title {
            font-size: 1.33em;
            font-weight: bold;
            padding-bottom: 0.33em;
        }
        
        .zig-alert__text {
            padding-bottom: 0.33em;
        }
        
        .zig-alert__button {
            color: black;
            font-weight: bold;
            text-decoration: none;
            
            float: right;
            padding: 0.25em;
        }
        
        .zig-alert__button:hover {
            color: #f08;
            background: #eee;
        }
        
        .zig-start-button {
            position: absolute;
            display: block;
            right: 4em;
            bottom: 4em;
            padding: 1em;
            background: white;
            box-shadow: 0 0 0.5em rgba(0, 0, 0, 0.25);
            
            color: black;
            font-weight: bold;
            text-decoration: none;
        }
    `);
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

    const match = /zigVersion=([0-9.]+|dev|latest)/.exec(location.href);
    if (match != null) {
        const zigVersion: string = match[1];
        url += `&zigVersion=${zigVersion}`;
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

function initializeDebugLayer(iframe: HTMLIFrameElement) {
    iframe.contentWindow.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.shiftKey && event.altKey && event.ctrlKey) {
            log("Keycode is", event.keyCode);

            if (event.keyCode === 76) {
                log("Enable logging");
                document.cookie = "zigLogging=true"
            }

            if (event.keyCode === 86) {
                const version: string = prompt("Select zig client version", "latest") || "latest";
                if (version === "default") {
                    document.cookie = `zigVersion=`
                } else {
                    document.cookie = `zigVersion=${version}`
                }
            }
        }
    }, true);
}

onDOMLoaded(() => {
    log(`Initializing zig wrapper in ${clientVersion}`);

    if (delegateToVersion("wrapper.min.js")) {
        return;
    }

    initializeStyle();

    const frame = initializeGame();

    // register debug shortcuts on the iframe
    initializeDebugLayer(frame);
});
