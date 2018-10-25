import {GameSettings} from '../common/config';
import {MessageClient, ParentMessageInterface} from '../common/message-client';
import {registerRequestListener, Request, Result} from '../common/request';
import {appendGameConfigToURL, GameConfig} from '../common/config';
import {Logger} from '../common/logging';

const log = Logger.get('zig.integration');

export type RequestHandler = (req: Request) => Promise<Result>

export interface IntegrationConfig {
    requestHandler?: RequestHandler
}

class Integration {
    readonly messageClient: MessageClient;
    readonly interface: ParentMessageInterface;

    constructor(private game: string, private wrapper: HTMLDivElement,
                private frame: HTMLIFrameElement,
                private config: IntegrationConfig) {

        const contentWindow = frame.contentWindow;
        if (contentWindow == null) {
            throw new Error('iframe has no content window.');
        }

        this.messageClient = new MessageClient(contentWindow);
        this.interface = new ParentMessageInterface(this.messageClient, game);

        this.interface.registerGeneric({
            updateGameHeight: ev => this.updateGameHeight(ev.height),
            updateGameSettings: ev => this.updateGameSettings(ev.gameSettings),
        });

        // register handler for http requests.
        registerRequestListener(this.interface, config.requestHandler);
    }

    public destroy(): void {
        log.info('Destroy event listeners from frame');
        this.interface.close();
        this.messageClient.close();
    }

    private updateGameHeight(height: number): void {
        this.frame.style.height = height + 'px';
    }

    private updateGameSettings(gameSettings: GameSettings): void {
        if (gameSettings.aspect > 0) {
            this.wrapper.style.position = 'relative';
            this.wrapper.style.paddingBottom = (100 / gameSettings.aspect) + '%';

            this.frame.style.position = 'absolute';
            this.frame.style.height = '100%';
        }
    }
}

function zigObserveGame(game: string, wrapper: HTMLDivElement, frame: HTMLIFrameElement, config: IntegrationConfig): ParentMessageInterface {
    const integration = new Integration(game, wrapper, frame, config);

    const mutationObserver = new MutationObserver(mu => {
        for (const record of mu) {
            if (record.type !== 'childList') {
                continue;
            }

            for (let idx = 0; idx < record.removedNodes.length; idx++) {
                if (record.removedNodes.item(idx) === frame) {
                    mutationObserver.disconnect();
                    integration.destroy();
                    return;
                }
            }
        }
    });

    mutationObserver.observe(wrapper, {childList: true});

    return integration.interface;
}

function includeZigGame(targetSelector: string | HTMLElement, url: string, gameConfig: GameConfig, intConfig: IntegrationConfig = {}): ParentMessageInterface {
    const frameSource = appendGameConfigToURL(url, gameConfig);

    // The iframe containing the game.
    const frame = document.createElement('iframe');
    frame.src = frameSource;
    frame.allowFullscreen = true;
    frame.scrolling = 'no';
    frame.style.border = '0';
    frame.style.width = '100%';

    // a div wrapping the iframe.
    // This one is used for aspect ratio based scaling of the iframe.
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.appendChild(frame);

    // put the wrapper into the target element.
    const target = typeof targetSelector === 'string'
        ? document.querySelector(targetSelector)
        : targetSelector;

    target!.appendChild(wrapper);

    return zigObserveGame(gameConfig.canonicalGameName, wrapper, frame, intConfig);
}

function registerHTTPHandlerOnly(game: string, frame: HTMLIFrameElement, handler?: RequestHandler): VoidFunction {
    const contentWindow = frame.contentWindow;
    if (contentWindow == null) {
        throw new Error('Can not register handler, content window is null.');
    }

    const messageClient = new MessageClient(contentWindow);
    const iface = new ParentMessageInterface(messageClient, game);

    registerRequestListener(iface, handler);

    // return unregister function
    return () => messageClient.close();
}

export const Zig = {
    include: includeZigGame,
    observe: zigObserveGame,
    registerHTTPHandlerOnly: registerHTTPHandlerOnly,
};

// expose to the client also.
(window as any)['Zig'] = Zig;
