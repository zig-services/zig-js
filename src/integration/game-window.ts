import {appendGameConfigToURL, GameConfig, GameSettings} from '../common/config';
import {Connector} from './connector';
import {Logger} from '../common/logging';
import {MessageClient, ParentMessageInterface} from '../common/message-client';
import {Game} from './webpage';
import {IMoneyAmount, MoneyAmount} from '../common/domain';
import {
    CompositeFullscreenService,
    FakeFullscreenService,
    FullscreenService,
    RealFullscreenService,
} from './fullscreen';

export interface InstallGameOptions {
    // target container where to place the game
    container: HTMLElement;

    // game url to load
    url: string;

    // game configuration
    gameConfig: GameConfig;

    // the platform connector to speak to.
    connector: Connector;

    // the base price of the ticket.
    baseTicketPrice: IMoneyAmount;

    // You can pass your own fullscreen service to override the
    // fullscreen handling.
    fullscreenService?: FullscreenService;
}

/**
 * Installs the game inside of the given element.
 */
export function installGame(opts: InstallGameOptions): Game {
    // create and insert the game window into the document
    const gameWindow = installGameElement(opts.container, opts.url, opts.gameConfig);

    // create a fullscreen service if non is given.
    const fullscreenService = opts.fullscreenService || new CompositeFullscreenService([
        new FakeFullscreenService(),
        new RealFullscreenService(),
    ]);

    // let the games begin!
    return new Game(gameWindow, opts.connector, fullscreenService, {
        ...opts.gameConfig,
        ticketPrice: MoneyAmount.of(opts.baseTicketPrice),
    });
}

/**
 * A handle to the game window or frame.
 */
export class GameWindow {
    private readonly logger: Logger;

    readonly messageClient: MessageClient;
    readonly interface: ParentMessageInterface;

    constructor(readonly gameName: string,
                readonly wrapper: HTMLDivElement,
                readonly frame: HTMLIFrameElement) {

        this.logger = Logger.get(`zig.GameWindow.${gameName}`);

        const contentWindow = frame.contentWindow;
        if (contentWindow == null) {
            throw new Error('content window of iframe is null.');
        }

        this.logger.debug('Registering event listeners on frame');
        this.messageClient = new MessageClient(contentWindow);
        this.interface = new ParentMessageInterface(this.messageClient, gameName);

        void runAsync(async () => {
            await waitUntilChildGetsRemoved(wrapper, frame);
            this.destroy();
        });

        this.interface.registerGeneric({
            updateGameHeight: ev => this.updateGameHeight(ev.height),
            updateGameSettings: ev => this.updateGameSettings(ev.gameSettings),
        });
    }

    public destroy(): void {
        this.logger.debug('Remove event listeners from frame');
        this.messageClient.close();
    }

    private updateGameHeight(height: number): void {
        this.logger.debug(`Updating game height to ${height}px`);
        this.frame.style.height = height + 'px';
    }

    private updateGameSettings(gameSettings: GameSettings): void {
        if (gameSettings.aspect > 0) {
            this.logger.debug('Apply size from game settings:', gameSettings);

            this.wrapper.style.position = 'relative';
            this.wrapper.style.paddingBottom = (100 / gameSettings.aspect) + '%';

            this.frame.style.position = 'absolute';
            this.frame.style.top = '0';
            this.frame.style.left = '0';
            this.frame.style.width = '100%';
            this.frame.style.height = '100%';
        }
    }
}

function installGameElement(container: HTMLElement, url: string, gameConfig: GameConfig): GameWindow {
    const frameSource = appendGameConfigToURL(url, gameConfig);

    // The iframe containing the game.
    const frame: HTMLIFrameElement = document.createElement('iframe');
    frame.src = frameSource;
    frame.allowFullscreen = true;
    frame.scrolling = 'no';
    frame.style.display = 'block';
    frame.style.border = '0';
    frame.style.width = '100%';
    frame.style.height = '100%';

    // A div wrapping the iframe.
    // This one is used for aspect ratio based scaling of the iframe.
    const wrapper: HTMLDivElement = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.appendChild(frame);

    // and add it to the document
    container.appendChild(wrapper);

    return new GameWindow(gameConfig.canonicalGameName, wrapper, frame);
}


/**
 * Returns a promise that will resolve once the child of the given parent
 * element was removed from the dom tree.
 */
async function waitUntilChildGetsRemoved(parent: HTMLDivElement, child: HTMLIFrameElement): Promise<void> {
    return new Promise<void>(resolve => {
        const mutationObserver = new MutationObserver(mu => {
            for (const record of mu) {
                if (record.type !== 'childList') {
                    continue;
                }

                for (let idx = 0; idx < record.removedNodes.length; idx++) {
                    if (record.removedNodes.item(idx) === child) {
                        mutationObserver.disconnect();
                        resolve(void 0);
                        return;
                    }
                }
            }
        });

        mutationObserver.observe(parent, {childList: true});
    });
}

async function runAsync<T>(param: () => Promise<T>): Promise<T> {
    return param();
}
