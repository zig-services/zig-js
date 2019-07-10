import '../common/polyfills';

import {sleep} from '../common/common';
import {GameMessageInterface, MessageClient, ParentMessageInterface, Unregister} from '../common/message-client';
import {injectStyle, onDOMLoad} from '../common/dom';
import {buildTime, clientVersion} from '../common/vars';
import {delegateToVersion} from '../common/delegate';
import {Options} from '../common/options';
import {appendGameConfigToURL, ClockStyle, GameConfig, GameSettings, parseGameConfigFromURL} from '../common/config';
import {Logger} from '../common/logging';
import {WrapperStyleCSS} from './style.css';

const log = Logger.get('zig.wrapper');

/**
 * Get game config from window
 */
const GameSettings = (<any>window).GameSettings as GameSettings;
if (GameSettings == null) {
    throw new Error('window.GameConfig must be initialized.');
}

/**
 * Create and load the real game inside the iframe.
 * This method will add the iframe to the body of the page.
 */
async function initializeGame(): Promise<HTMLIFrameElement> {
    const config: GameConfig = parseGameConfigFromURL();

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
    (iframe as any).allow = 'autoplay';

    const parentMessageClient = new MessageClient(window.parent);

    // forward errors to parent frame.
    iframe.onerror = err => parentMessageClient.sendError(err);

    // send the new config to the parent so it can update the frame size
    const outerMessageClient = new GameMessageInterface(parentMessageClient, config.canonicalGameName);
    outerMessageClient.updateGameSettings(GameSettings);

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

        if (GameSettings.clockStyle !== false) {
            const innerMessageInterface = new ParentMessageInterface(innerMessageClient, config.canonicalGameName);
            setupGameClock(config, outerMessageClient, innerMessageInterface);
        }

        window.onfocus = () => {
            log.debug('Got focus, focusing iframe now.');
            setTimeout(() => {
                const contentWindow = iframe.contentWindow;
                if (contentWindow != null) {
                    contentWindow.focus();
                }
            });
        };
    }

    await trySetupMessageClient();

    return iframe;
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

function setupGameClock(config: GameConfig, outerMessageInterface: GameMessageInterface, innerMessageInterface: ParentMessageInterface) {
    const clockStyle: Required<ClockStyle> = {
        horizontalAlignment: 'right',
        verticalAlignment: 'top',
        backgroundColor: 'rgba(0,0,0,0.5)',
        fontColor: 'white',
        ...(GameSettings.clockStyle || {}),
    };

    const clock = new ClockOverlay(clockStyle, config.clientTimeOffsetInMillis);

    let unregister: Unregister;

    function _showClock() {
        document.body.appendChild(clock.div);
        unregister();
    }

    unregister = outerMessageInterface.registerGeneric({
        prepareGame: _showClock,
        playGame: _showClock,
        playDemoGame: _showClock,
        requestStartGame: _showClock,
    });

    if (config.displayTicketIdOverlayType != null) {
        innerMessageInterface.registerGeneric({
            gameStarted(event) {
                if (config.displayTicketIdOverlayType === 'ticketId')
                    clock.ticketIdValue = event.ticketId;

                if (config.displayTicketIdOverlayType === 'ticketNumber')
                    clock.ticketIdValue = event.ticketNumber;
            },

            ticketSettled() {
                //clock.ticketIdValue = null;
            },

            gameFinished() {
                clock.ticketIdValue = null;
            },
        });
    }
}

class ClockOverlay {
    public readonly div: HTMLDivElement;
    private _ticketIdValue: string | null = null;

    constructor(
        readonly style: Required<ClockStyle>,
        private readonly clientTimeOffsetInMillis: number) {

        this.div = document.createElement('div');
        this.div.className = 'zig-clock';
        this.div.style.color = style.fontColor;
        this.div.style[style.verticalAlignment] = '0';
        this.div.style[style.horizontalAlignment] = '0.5em';
        this.div.style.backgroundColor = style.backgroundColor;

        this.updateAndReschedule();
    }

    set ticketIdValue(value: string | null) {
        this._ticketIdValue = value;
        this.updateOnce();
    }

    private updateAndReschedule() {
        this.updateOnce();

        const now = new Date(Date.now() + this.clientTimeOffsetInMillis);

        const currentSeconds = now.getSeconds();
        const delayInSeconds = 60 - currentSeconds;
        setTimeout(() => this.updateAndReschedule(), delayInSeconds * 1000);
    }

    private updateOnce() {
        const now = new Date(Date.now() + this.clientTimeOffsetInMillis);

        let text = getTimeString(now);
        if (this._ticketIdValue != null) {
            text += ' - ' + this._ticketIdValue;
        }

        this.div.innerText = text;

        function getTimeString(now: Date): string {
            const hour = now.getHours();
            const minutes = now.getMinutes();
            return `${hour >= 10 ? hour : '0' + hour}:${minutes >= 10 ? minutes : '0' + minutes}`;
        }
    }
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
    injectStyle(WrapperStyleCSS);

    void initializeGame();

    if (Options.debuggingLayer) {
        log.debug('Debugging options are set, showing debugging layer now.');

        const el = document.createElement('div');
        el.innerHTML = `
            <div style='position: absolute; top: 0; left: 0; font-size: 0.6em; padding: 0.25em; background: rgba(0, 0, 0, 128); color: white; z-index: 100;'>
                <strong>ZIG</strong> &nbsp;&nbsp;
                version: ${Options.version} (=${clientVersion}),
                logging: ${Options.logging},
                wc override: ${JSON.stringify(Options.winningClassOverride)},
                build ${(Date.now() - buildTime) / 1000.0}s ago
            </div>`;

        document.body.appendChild(el.firstElementChild!);
    }
});
