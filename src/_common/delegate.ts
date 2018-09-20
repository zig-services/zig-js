import {Logger} from './logging';
import {Options} from "./options";

/**
 * Delegates to another version of the script by injecting a reference to
 * the other script into the document, but only if the Options.version
 * property is set.
 */
export function delegateToVersion(script: string): boolean {
    const log = Logger.get("zig.main.delegate");

    // only delegate once
    if (window["__zig_delegated"]) {
        return false;
    }

    window["__zig_delegated"] = true;

    // get the override version from the options
    const version = Options.version;
    if (version == null) {
        return false;
    }

    const url: string = `https://lib.zig.services/zig/${version}/${script}`;

    log.info(`Delegate script ${script} to ${url}`);

    if (document.readyState === "loading") {
        // if we are still loading, we can just write directly to the document.
        // The script will then be executed blockingly
        document.write(`<script src="${url}"></script>`);

    } else {
        // if we are not loading anymore, we'll just add the script to the header.
        // The browser will the execute the script once it finishes loading.
        const scriptTag = document.createElement("script");
        scriptTag.src = url;
        scriptTag.async = false;
        scriptTag.defer = false;
        document.body.appendChild(scriptTag);
    }

    return true;
}
