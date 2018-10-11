import '../_common/polyfills';

import {isLegacyGame, patchLegacyGame} from './zig-legacy';
import {Logger} from '../_common/logging';
import {BuyTicketOptions, ZigClient, ZigClientImpl} from './zig-client';
import {delegateToVersion} from '../_common/delegate';
import {buildTime, clientVersion} from '../_common/vars';
import {GameMessageInterface, Message, MessageClient, Unregister} from '../_common/message-client';
import {GameConfig, parseGameConfigFromURL} from '../_common/config';
import {Bundle, IError, Ticket} from '../_common/domain';

export interface ZigGlobal {
    Client: ZigClient
}

interface ZigWindow {
    __zigClientInstance?: ZigClient;
    Zig?: ZigGlobal;
}


const log = Logger.get('zig.Main');
const zigWindow = window as ZigWindow;

export const Zig: ZigGlobal = {
    get Client(): ZigClient {
        if (zigWindow.__zigClientInstance == null) {
            log.warn('globalZigClient variable is currently null, creating a lazy zig client');

            zigWindow.__zigClientInstance = new LazyZigClient();
        }

        return zigWindow.__zigClientInstance;
    },
};

export function main() {
    if (!zigWindow.Zig) {
        log.info(`Expose global 'Zig.Client' instance on 'window' object.`);
        zigWindow.Zig = Zig;
    }

    if (isLegacyGame()) {
        log.warn('Enable legacy game patches');
        patchLegacyGame();
    }

    const previousZigClient = zigWindow.__zigClientInstance;

    // create the global zig client
    zigWindow.__zigClientInstance = new ZigClientImpl();

    // track height of the iframe if the marker exists.
    zigWindow.__zigClientInstance.trackGameHeight('#iframe-height-marker');

    // if there was a previously constructed lazy zig client, we'll now
    // delegate to the new one.
    if (previousZigClient instanceof LazyZigClient) {
        previousZigClient.delegateTo(zigWindow.__zigClientInstance);
    }
}

class Delegate<T> {
    delegate!: T;
    private queue: Array<() => void> = [];

    async scheduleAsync<R>(call: () => Promise<R>): Promise<R> {
        if (this.delegate) {
            // can be called directly.
            return call();
        }

        return new Promise<R>((resolve, reject) => {
            async function fn() {
                try {
                    resolve(await call());
                } catch (err) {
                    reject(err);
                }
            }

            if (this.delegate) {
                void fn();
            } else {
                this.queue.push(fn);
            }
        });
    }

    schedule(call: () => any): void {
        if (this.delegate) {
            void call();
        } else {
            this.queue.push(call);
        }
    }

    delegateTo(delegate: T) {
        if (this.delegate) {
            throw new Error('delegate is not set');
        }

        this.delegate = delegate;

        // call the functions
        this.queue.forEach(f => f());
    }
}

class LazyZigClient extends Delegate<ZigClient> implements ZigClient {
    private lazyMessageClient?: LazyMessageClient;
    private lazyMessageInterface?: GameMessageInterface;

    get Messages(): GameMessageInterface {
        if (!this.delegate) {
            if (!this.lazyMessageInterface) {
                this.lazyMessageClient = new LazyMessageClient();
                this.lazyMessageInterface = new GameMessageInterface(
                    this.lazyMessageClient,
                    this.gameConfig.canonicalGameName);
            }

            return this.lazyMessageInterface;
        }

        return this.delegate.Messages;
    }

    delegateTo(delegate: ZigClient) {
        if (this.lazyMessageClient) {
            // remove the event handler
            this.lazyMessageClient.close();

            // and delegate to the real client
            this.lazyMessageClient.delegateTo(delegate.Messages.messageClient);
        }
        
        super.delegateTo(delegate);
    }

    get gameConfig(): Readonly<GameConfig> {
        return this.delegate ? this.delegate.gameConfig : parseGameConfigFromURL();
    }

    bundle(bundleKey: number): Promise<Bundle> {
        return this.scheduleAsync(() => this.delegate.bundle(bundleKey));
    }

    buyTicket(payload?: any, options?: BuyTicketOptions): Promise<Ticket> {
        return this.scheduleAsync(() => this.delegate.buyTicket(payload, options));
    }

    demoTicket(payload?: any, options?: BuyTicketOptions): Promise<Ticket> {
        return this.scheduleAsync(() => this.delegate.demoTicket(payload, options));
    }

    settleTicket(id: string): Promise<void> {
        return this.scheduleAsync(() => this.delegate.settleTicket(id));
    }

    trackGameHeight(markerOrSelector: HTMLElement | string): void {
        void this.scheduleAsync(() =>
            Promise.resolve(this.delegate.trackGameHeight(markerOrSelector)));
    }
}

class LazyMessageClient extends MessageClient {
    private readonly q = new Delegate<MessageClient>();

    constructor() {
        super(window.parent);
    }

    delegateTo(delegate: MessageClient) {
        this.q.delegateTo(delegate);
    }

    send(message: Message): void {
        this.q.schedule(() => this.q.delegate.send(message));
    }

    sendError(err: IError | Error | any): void {
        this.q.schedule(() => this.q.delegate.sendError(err));
    }

    register(handler: (message: Message) => void): Unregister {
        let unregister: Unregister;
        this.q.schedule(() => unregister = this.q.delegate.register(handler));
        return () => unregister();
    }

    handleEvent(ev: MessageEvent): void {
        this.q.schedule(() => (this.q.delegate as any).handleEvent(ev));
    }
}


if (delegateToVersion(`libzig.js`)) {
    // initialize the globalZigClient with a proxy to the real instance later.
    zigWindow.__zigClientInstance = new LazyZigClient();

} else {
    log.info('');
    log.info(`Initializing zig client in version ${clientVersion}`);
    log.info(`compiled ${(Date.now() - buildTime) / 1000.0}sec ago`);
    log.info('');

    main();
}

