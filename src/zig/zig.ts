import '../_common/polyfills';

import {isLegacyGame, patchLegacyGame} from './zig-legacy';
import {Logger} from '../_common/logging';
import {ZigClient, ZigClientImpl} from './zig-client';
import {delegateToVersion} from '../_common/delegate';
import {buildTime, clientVersion} from '../_common/vars';

export interface ZigGlobal {
    /**
     * A reference to the global zig client. Only use once `ready()` has been fulfilled.
     * If you use this field before the promise was fulfilled, the property accessor will throw an
     * exception.
     */
    Client: ZigClient

    /**
     * Registers a callback that will be executed once the Zig.Client has been initialized
     * and is ready to use. You can also leave out the callback and await the resulting promise.
     */
    ready(callback?: (c: ZigClient) => void): Promise<ZigClient>;
}

const log = Logger.get('zig.Main');

const zigWindow = window as {
    __zigClientInstance?: ZigClient;
    __zigClientPromise?: Promise<ZigClient>;
    __zigClientPromiseResolve?: (c: ZigClient) => void;

    Zig?: ZigGlobal;
};

export const Zig: ZigGlobal = new (class ZigGlobalImpl implements ZigGlobal {
    get Client(): ZigClient {
        const zigClient = zigWindow.__zigClientInstance;

        if (zigClient == null) {
            throw new Error('Zig.Client is currently not available. ' +
                'Please `await Zig.ready();` before accessing this field.');
        }

        return zigClient;
    }

    ready(callback?: (c: ZigClient) => void): Promise<ZigClient> {
        if (callback) {
            this.clientAsync.then(callback);
        }

        return this.clientAsync;
    }

    private get clientAsync(): Promise<ZigClient> {
        if (zigWindow.__zigClientPromise == null) {
            log.info('Creating zig client promise.');

            if (zigWindow.__zigClientInstance != null) {
                // we already have an instance, use this one directly.
                zigWindow.__zigClientPromise = Promise.resolve(zigWindow.__zigClientInstance);
            } else {
                // no instance yet, create an unresolved promise and keep the resolve function around.
                zigWindow.__zigClientPromise = new Promise<ZigClient>(resolve => {
                    zigWindow.__zigClientPromiseResolve = resolve;
                });
            }
        }

        return zigWindow.__zigClientPromise;
    }
});

function initializeClient() {
    log.info('');
    log.info(`Initializing zig client in version ${clientVersion}`);
    log.info(`compiled ${(Date.now() - buildTime) / 1000.0}sec ago`);
    log.info('');

    if (isLegacyGame()) {
        log.warn('Enable legacy game patches.');
        patchLegacyGame();
    }

    // create the global zig client
    const zigClient = zigWindow.__zigClientInstance = new ZigClientImpl();

    // track height of the iframe if the marker exists.
    zigClient.trackGameHeight('#iframe-height-marker');

    // tell consumers waiting on the ClientPromise that the client is now available
    if (zigWindow.__zigClientPromiseResolve) {
        zigWindow.__zigClientPromiseResolve(zigClient);
    }
}

// Need to expose the Zig object on the `window` object, even if we are reloading
// the script later.
if (!zigWindow.Zig) {
    log.info(`Expose global 'Zig' instance on 'window' object.`);
    zigWindow.Zig = Zig;
}

if (!delegateToVersion(`libzig.js`)) {
    initializeClient();
}

