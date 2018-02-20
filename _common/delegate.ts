import {logger} from "./common";

export function delegateToVersion(script: string): boolean {
    const log = logger("zig");

    if (!window["__zig_delegated"]) {
        window["__zig_delegated"] = true;

        const cookie: string = document.cookie || "";
        const match = /\bzigVersion=([0-9.]+|dev|latest)\b/.exec(cookie);
        if (match != null && match[1]) {
            const version: string = match[1];
            const url: string = `https://s3.eu-west-2.amazonaws.com/zig.js/${version}/${script}`;

            log(`Delegate script to ${url}`);

            const scriptTag = document.createElement("script");
            scriptTag.src = url;
            document.body.appendChild(scriptTag);

            return true;
        }
    }

    return false;
}
