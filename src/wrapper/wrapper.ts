import 'promise-polyfill/src/polyfill';

import {GameSettings, sleep} from '../_common/common';
import {GameMessageInterface, MessageClient, ParentMessageInterface} from '../_common/message-client';
import {injectStyle, onDOMLoad} from '../_common/dom';
import {buildTime, clientVersion} from '../_common/vars';
import {delegateToVersion} from '../_common/delegate';
import {Options} from '../_common/options';
import {appendGameConfigToURL, parseGameConfigFromURL} from '../_common/config';
import {IError} from '../_common/domain';
import {Logger} from '../_common/logging';

const log = Logger.get('zig.wrapper');
const anyWindow: any = window;

/**
 * Get game config from window
 */
const GameSettings = anyWindow.GameSettings as GameSettings;
if (GameSettings == null) {
    throw new Error('window.GameConfig must be initialized.');
}

/**
 * Create and load the real game inside the iframe.
 * This method will add the iframe to the body of the page.
 */
async function initializeGame(): Promise<HTMLIFrameElement> {
    const config = parseGameConfigFromURL();
    let url = appendGameConfigToURL(GameSettings.index || 'inner.html', config);

    // legacy games need extra patching. We'll need to inform the inner.html about that.
    if (GameSettings.legacyGame === true) {
        url += '&legacyGame=true';
    }

    log.info(`Creating iframe with URL ${url}`);

    // create iframe and insert into document.
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.allowFullscreen = true;
    iframe.scrolling = 'no';
    iframe.onerror = err => log.error('Error in iframe:', err);

    const parentMessageClient = new MessageClient(window.parent);

    // send the new config to the parent so it can update the frame size
    new GameMessageInterface(parentMessageClient, config.canonicalGameName)
        .updateGameSettings(GameSettings);

    // add game to window
    document.body.appendChild(iframe);

    async function trySetupMessageClient(): Promise<void> {
        // wait for the content window to load.
        while (iframe.contentWindow == null) {
            log.info('contentWindow not yet available, waiting...');
            await sleep(250);
        }

        // initialize the message client to the game window
        const innerMessageClient = new MessageClient(iframe.contentWindow);

        // and proxy all messages between the frames
        proxyMessages(parentMessageClient, innerMessageClient);

        window.onfocus = () => {
            log.debug('Got focus, focusing iframe now.');
            setTimeout(() => {
                const contentWindow = iframe.contentWindow;
                if (contentWindow != null) {
                    contentWindow.focus();
                }
            });
        };

        if (parseGameConfigFromURL().overlay) {
            const iface = new ParentMessageInterface(innerMessageClient, parseGameConfigFromURL().canonicalGameName);

            log.info('Register messages listeners for overlay');

            iface.registerGeneric({
                gameLoaded: () => showControls(iface),
                gameFinished: () => showControls(iface),
                error: ev => showErrorDialog(ev),
            });
        }
    }

    await trySetupMessageClient();

    return iframe;
}

/**
 * Shows an error dialog for the given error.
 */
function showErrorDialog(error: IError) {
    let message = error.details || '';

    if (error.type === 'urn:x-tipp24:remote-client-error') {
        message = 'An error occurred while communicating with the game backend, please try again.';
    }

    const div = document.createElement('div');
    div.innerHTML = `
      <div class='zig-overlay'>
        <div class='zig-alert'>
          <div class='zig-alert__title'></div>
          <div class='zig-alert__text'></div>
          <a href='#' class='zig-alert__button'>Close</a>
        </div>
      </div>`;

    div.querySelector<HTMLElement>('.zig-alert__title')!.innerText = error.title;
    div.querySelector<HTMLElement>('.zig-alert__text')!.innerText = message;
    div.querySelector<HTMLElement>('.zig-alert__button')!.onclick = () => div.parentNode!.removeChild(div);

    document.body.appendChild(div);
}

/**
 * Set up a proxy for post messages. Everything coming from the iframe will be forwarded
 * to the parent, and everything coming from the parent will be send to the iframe.
 */
function proxyMessages(parentMessageClient: MessageClient, innerMessageClient: MessageClient): void {
    innerMessageClient.register(ev => {
        log.debug('Proxy message parent <- game');
        parentMessageClient.send(ev);
    });

    parentMessageClient.register(ev => {
        log.debug('Proxy message parent -> game');
        innerMessageClient.send(ev);
    });
}

function showControls(iface: ParentMessageInterface) {
    if (document.querySelector('.zig-start-button') != null) {
        return;
    }

    const div = document.createElement('a');
    div.className = 'zig-start-button';
    div.innerText = 'Start game';
    div.href = '#';
    document.body.appendChild(div);

    div.onclick = ev => {
        ev.preventDefault();

        iface.playGame();
        div.parentNode!.removeChild(div);
    };
}

function initializeWinningClassOverride(): boolean {
    const override = Options.winningClassOverride;
    if (override == null)
        return false;

    const params = `&wc=${override.winningClass}&scenario=${override.scenarioId}`;
    if (location.href.indexOf(params) === -1) {
        const search = location.search.replace(/\b(scenario|wc)=[^&]+/g, '');
        const sep = location.search || '&';

        log.info('Replace outer.html with updated url:', search + sep + params);
        location.search = search + sep + params;

        return true;
    }

    return false;
}

onDOMLoad(() => {
    log.info(`Initializing zig wrapper in ${clientVersion}`);

    // we might want to delegate the script to another version
    if (delegateToVersion('wrapper.js')) {
        return;
    }

    // if we have a winning class override, we'll change the url and
    // reload the script. we wont be initializing the rest of the game here.
    if (initializeWinningClassOverride()) {
        return;
    }

    // inject the css style for the wrapper into the document
    injectStyle(require('./style.css'));

    void initializeGame();

    if (Options.debuggingLayer) {
        log.debug('Debugging options are set, showing debugging layer now.');

        const el = document.createElement('div');
        el.innerHTML = `
            <div style='position: absolute; top: 0; left: 0; font-size: 0.6em; padding: 0.25em; background: rgba(0, 0, 0, 128); color: white; z-index: 100;'>
                <strong>ZIG</strong>
                &nbsp;&nbsp;
                
                version: ${Options.version} (=${clientVersion}),
                logging: ${Options.logging},
                wc override: ${JSON.stringify(Options.winningClassOverride)},
                build ${(Date.now() - buildTime) / 1000.0}s ago
            </div>`;

        document.body.appendChild(el.firstElementChild!);
    }
});
