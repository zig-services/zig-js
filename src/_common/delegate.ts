import {logger} from "./common";
import {Options} from "./options";

export function delegateToVersion(script: string): boolean {
    const log = logger("[delegate]");

    if (!window["__zig_delegated"]) {
        window["__zig_delegated"] = true;

        const version = Options.version;
        if (version != null && version !== "latest") {
            const url: string = `https://s3.eu-west-2.amazonaws.com/zig.js/${version}/${script}`;

            log(`Delegate script ${script} to ${url}`);

            if (document.readyState === "loading") {
                document.write(`<script src="${url}"></script>`);

            } else {
                const scriptTag = document.createElement("script");
                scriptTag.src = url;
                scriptTag.async = false;
                scriptTag.defer = false;
                document.body.appendChild(scriptTag);
            }

            return true;
        }
    }

    return false;
}
