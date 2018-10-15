import '../_common/polyfills';

import {isLegacyGame, patchLegacyGame} from './zig-legacy';
import {Logger} from '../_common/logging';
import {ZigClient, ZigClientImpl} from './zig-client';
import {delegateToVersion} from '../_common/delegate';
import {buildTime, clientVersion} from '../_common/vars';

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
            throw new Error('zigClient is currently not available.');
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
}

if (delegateToVersion(`libzig.js`)) {

} else {
    log.info('');
    log.info(`Initializing zig client in version ${clientVersion}`);
    log.info(`compiled ${(Date.now() - buildTime) / 1000.0}sec ago`);
    log.info('');

    main();
}

