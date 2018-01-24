///<reference path="../_common/common.ts"/>

const log = logger("[zig-wrapper]");

/**
 * Get game config from window
 */
const GameSettings = <IGameSettings>window["GameSettings"];
if (GameSettings == null) {
    throw new Error("window.GameConfig must be initialized.");
}

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
    let style = document.createElement("style");
    style.textContent = `
        html, body, iframe {
            width: 100%;
            height: 100%;
            
            border: 0;
            margin: 0;
            padding: 0;
          
            font-family: sans-serif;
        }
        
        .zig-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
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
    `;

    document.head.appendChild(style);
}

/**
 * Create and load the real game inside the iframe.
 * This method will add the iframe to the body of the page.
 */
function initializeInnerFrame(): HTMLIFrameElement {
    const config = extractConfigParameter();

    const sep = GameSettings.index.indexOf("?") === -1 ? "?" : "&";
    const url = GameSettings.index + sep + "config=" + config;

    // create iframe and insert into document.
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.allowFullscreen = true;
    iframe.scrolling = "no";

    // send the new config to the parent
    const message = {command: "updateGameSettings", gameSettings: GameSettings};
    parent.postMessage(message, "*");

    document.body.appendChild(iframe);

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
function initializeMessageProxy(iframe: HTMLIFrameElement) {
    window.addEventListener("message", event => {
        const message = event.data;

        if (event.source === window.parent) {
            log("Proxying message from parent to child", message);
            iframe.contentWindow.postMessage(message, "*");
        }

        if (event.source === iframe.contentWindow) {
            if (message.command == null && message.type != "") {
                showErrorDialog(<IError> message);
                return;
            }

            if (message.command === "gameLoaded" || message.command === "gameFinished") {
                showControls(iframe);
                return;
            }

            log("Proxying message from child to parent:", message);
            window.parent.postMessage(message, "*");
        }
    });
}

function showControls(iframe: HTMLIFrameElement) {
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

        iframe.contentWindow.postMessage("playGame", "*");
        div.parentNode.removeChild(div);
    }
}


document.addEventListener("DOMContentLoaded", () => {
    initializeStyle();

    const iframe = initializeInnerFrame();
    initializeMessageProxy(iframe);
});
