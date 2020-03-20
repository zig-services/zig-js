import '../common/polyfills';

import {
    appendGameConfigToURL,
    buildTime,
    clientVersion,
    delegateToVersion,
    GameConfig,
    GameMessageInterface,
    GameSettings,
    injectStyle,
    Logger,
    MessageClient,
    onDOMLoad,
    Options,
    OverlayNoticeStyle,
    ParentMessageInterface,
    parseGameConfigFromURL,
    sleep,
} from '..';
import {WrapperStyleCSS} from './style.css';

import logoZIG from './logo.svg';
import logoMGA from './malta.png';


const log = Logger.get('zig.wrapper');

const licenseMGA = 'This game is licenced by the Malta Gaming Authortiy';

/**
 * Get game config from window
 */
const GameSettings = (<any>window).GameSettings as GameSettings;
if (GameSettings == null) {
    throw new Error('window.GameConfig must be initialized.');
}

type License = 'mga' | null;

function licenseInformation(config: GameConfig): License {
    const operator = guessOperatorId();

    if (operator === 'mylotto24') {
        if (/^gsl/.test(config.canonicalGameName)) {
            return null;
        }

        if (/^gw/.test(config.canonicalGameName)) {
            return null;
        }

    }

    // all other are currently mga licensed.
    return 'mga';
}

/**
 * Create and load the real game inside the iframe.
 * This method will add the iframe to the body of the page.
 */
async function initializeGame(): Promise<HTMLIFrameElement> {
    const config: GameConfig = parseGameConfigFromURL();

    if (!config.isTestStage) {
        addTrackingPixel(config);
    }

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

    const license = licenseInformation(config);
    if (!GameSettings.chromeless && !GameSettings.disableSplashScreen) {
        if (license === 'mga') {
            const splash = new SplashScreenController();
            document.body.appendChild(splash.$element);
        }
    }

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

        // show small overlay notice
        const innerMessageInterface = new ParentMessageInterface(innerMessageClient, config.canonicalGameName);
        const controller = setupOverlayNotice(config, license, innerMessageInterface);
        document.body.appendChild(controller.$element);

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

function guessOperatorId(): string | null {
    // extract the "mylotto24" part of "mylotto24.frontends.zig.services"
    const match = /[^.]+/.exec(location.hostname);
    if (!match) {
        log.warn('Could not extract operatorId from ', location.hostname);
    }

    return match ? match[0] : null;
}

type InternalGameConfig = GameConfig & {
    // Optional tracking token to pass down to the tracking pixel.
    readonly trackingToken?: string;
}

/**
 * Adds a small tracking pixel to the page
 */
function addTrackingPixel(config: InternalGameConfig) {
    try {
        const operatorId = encodeURIComponent(guessOperatorId() || '');
        const gameId = encodeURIComponent(config.canonicalGameName);
        const token = encodeURIComponent(config.trackingToken || '');

        // build URL of tracking pixel
        const url = `https://lighthouse.zig.services/flare?o=${operatorId}&g=${gameId}&t=${token}&_=${Date.now()}`;

        // create an image element to load the pixel
        const img = document.createElement('img');
        img.setAttribute('loading', 'eager');
        img.setAttribute('src', url);

    } catch (err) {
        log.warn('Could not add tracking pixel to page:', err);
    }
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

class OverlayNoticeController {
    public readonly $element = document.createElement('div');

    constructor(styleInput: Partial<OverlayNoticeStyle | false>) {
        const style = {
            horizontalAlignment: 'right',
            verticalAlignment: 'top',
            backgroundColor: 'rgba(0,0,0,0.5)',
            fontColor: 'white',
            ...styleInput,
        };

        this.$element.className = 'zig-notice';
        this.$element.style.color = style.fontColor;
        this.$element.style.backgroundColor = style.backgroundColor;
        this.$element.style.setProperty(style.verticalAlignment, '0');
        this.$element.style.setProperty(style.horizontalAlignment, '0.5em');
    }

    public addText(text: string) {
        const span = document.createElement('span');
        span.innerText = text;
        this.$element.appendChild(span);
    }

    public add(obj: { $element: Element }) {
        this.$element.appendChild(obj.$element);
    }
}

class SplashScreenController {
    public readonly $element = document.createElement('div');

    constructor() {
        this.$element.className = 'zig-splash';
        this.$element.innerHTML = `
            <div>
                <div>
                    <img style='width: 10em;' src='${logoZIG}'>
                </div>
                <div>
                    <img style='width: 10em; margin-top: 0.5em;' src='${logoMGA}'>
                </div>
                <div style='margin-top: 0.5em'>
                    <small style="color: #ddd;">${licenseMGA}</small>
                </div>
            </div>
        `;

        setTimeout(() => this.fadeOut(), 1000);
    }

    private fadeOut() {
        this.$element.style.opacity = '0';
        setTimeout(() => this.remove(), 300);
    }

    private remove() {
        const parent = this.$element.parentElement;
        if (parent != null) {
            parent.removeChild(this.$element);
        }
    }
}

function setupOverlayNotice(config: GameConfig, licence: License, innerMessageInterface: ParentMessageInterface): OverlayNoticeController {
    const controller = new OverlayNoticeController(GameSettings.overlayNoticeStyle ?? GameSettings.clockStyle ?? {});

    // await outerMessageInterface.waitForGameEvents(
    //     "prepareGame",
    //     "playGame",
    //     "playDemoGame",
    //     "requestStartGame",
    // );

    controller.add(new ClockController(config.clientTimeOffsetInMillis));

    if (GameSettings.chromeless && licence === 'mga') {
        controller.addText(licenseMGA);
    }

    if (config.displayTicketIdOverlayType != null) {
        const idController = new TicketIdController();
        controller.add(idController);

        innerMessageInterface.registerGeneric({
            gameStarted(event) {
                if (config.displayTicketIdOverlayType === 'ticketId')
                    idController.ticketIdValue = event.ticketId;

                if (config.displayTicketIdOverlayType === 'ticketNumber')
                    idController.ticketIdValue = event.ticketNumber;
            },

            gameFinished() {
                idController.ticketIdValue = null;
            },
        });
    }

    return controller;
}

class TicketIdController {
    public readonly $element = document.createElement('span');

    constructor() {
        this.ticketIdValue = null;
    }

    set ticketIdValue(value: string | null) {
        this.$element.style.display = value ? 'initial' : 'none';
        this.$element.innerText = value ?? '';
    }
}

class ClockController {
    public readonly $element = document.createElement('span');

    constructor(private readonly clientTimeOffsetInMillis: number) {
        this.updateAndReschedule();
    }

    private updateAndReschedule() {
        this.updateOnce();

        const now = new Date(Date.now() + this.clientTimeOffsetInMillis);

        const currentSeconds = now.getSeconds();
        const delayInSeconds = 60 - currentSeconds + 1;
        setTimeout(() => this.updateAndReschedule(), delayInSeconds * 1000);
    }

    private updateOnce() {
        function getTimeString(now: Date): string {
            const hour = now.getHours();
            const minutes = now.getMinutes();
            return `${hour >= 10 ? hour : '0' + hour}:${minutes >= 10 ? minutes : '0' + minutes}`;
        }

        const now = new Date(Date.now() + this.clientTimeOffsetInMillis);
        this.$element.innerText = getTimeString(now);
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
