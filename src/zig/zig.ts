import {isLegacyGame, patchLegacyGame} from "./zig-legacy";
import {logger} from "../_common/common";
import {localStoragePolyfill, objectAssignPolyfill} from "../_common/polyfill";
import {ZigClient} from "./zig-client";
import {delegateToVersion} from "../_common/delegate";
import {buildTime, clientVersion} from "../_common/vars";

export interface ZigGlobal {
    Client: ZigClient
}

const log = logger("zig.main");

export const Zig: ZigGlobal = {
    get Client(): ZigClient {
        const zigGlobal = window["Zig"] as ZigGlobal;
        if (zigGlobal == null) {
            log.warn("global Zig variable is currently null.");
            throw new Error("ZigClient not available.");
        }

        if (zigGlobal.Client == null) {
            log.warn("global Zig variable is currently null.");
            throw new Error("ZigClient not available.");
        }

        return zigGlobal.Client;
    }
};

export function main() {
    // initialize Object.assign polyfill for ie11.
    objectAssignPolyfill();

    // polyfill for browsers without localStorage (eg private mode safari)
    localStoragePolyfill();

    if (isLegacyGame()) {
        log.info("Enable legacy game patches");
        patchLegacyGame();
    }

    // expose this library globally.
    window["Zig"] = {
        Client: new ZigClient(),
    };

    // track height of the iframe if the marker exists.
    Zig.Client.trackGameHeight("#iframe-height-marker");
}

if (!delegateToVersion(`libzig.js`)) {
    if (window.console && console.log) {
        console.log("");
        console.log(`[zig] Initializing zig client in version ${clientVersion}`);
        console.log(`[zig] compiled ${(Date.now() - buildTime) / 1000.0}sec ago`);
        console.log("");
    }

    main();
}