import {isLegacyGame, patchLegacyGame} from "./zig-legacy";
import {logger} from "../_common/common";
import {localStoragePolyfill, objectAssignPolyfill} from "../_common/polyfill";
import {ZigClient} from "./zig-client";
import {delegateToVersion} from "../_common/delegate";
import {buildTime, clientVersion} from "../_common/vars";

export interface ZigGlobal {
    Client: ZigClient
}

export let Zig: ZigGlobal;

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

    window["Zig"] = Zig;

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
} else {
    // use the Zig instance from the window object that was created by delegating to the
    // other script instance.
    Zig = window["Zig"] as ZigGlobal
}