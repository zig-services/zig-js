import {isLegacyGame, patchLegacyGame} from "./zig-legacy";
import {logger} from "../_common/common";
import {localStoragePolyfill, objectAssignPolyfill} from "../_common/polyfill";
import {ZigClient} from "./zig-client";
import {delegateToVersion} from "../_common/delegate";
import {buildTime, clientVersion} from "../_common/vars";

export interface ZigGlobal {
    Client: ZigClient
}

declare let Zig: ZigGlobal;

export function main() {
    const log = logger("[zig]");

    // initialize Object.assign polyfill for ie11.
    objectAssignPolyfill();

    // polyfill for browsers without localStorage (eg private mode safari)
    localStoragePolyfill();

    if (isLegacyGame()) {
        log.info("Enable legacy game patches");
        patchLegacyGame();
    }

    // expose types to user of this library
    Zig = {
        Client: new ZigClient(),
    };
}


if (!delegateToVersion(`zig.min.js`)) {
    if (window.console && console.log) {
        console.log("");
        console.log(`[zig] Initializing zig client in version ${clientVersion}`);
        console.log(`[zig] compiled ${(Date.now() - buildTime) / 1000.0}sec ago`);
        console.log("");
    }

    main();
}