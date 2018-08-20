export interface GameConfig {
    // the name of the game for use in api requests to buy a ticket
    canonicalGameName: string;

    // set to true to enable overlay in the outer.html
    overlay?: boolean;

    // access token for remote game services.
    remoteAccessToken?: string;

    // can be used as a redirect after purchasing a game via basket
    basketPurchaseRedirect?: string;
}

/**
 * Get the config parameter from the current location parameter.
 */
export function parseGameConfigFromURL(url: string = location.href): GameConfig {
    const match = /[?#].*\bconfig=([a-zA-Z0-9+/]+=*)/.exec(url);
    if (match == null) {
        throw new Error("No config parameter found.")
    }

    const [, encoded] = match;

    const config = JSON.parse(atob(encoded)) as GameConfig;

    // noinspection SuspiciousTypeOfGuard
    if (typeof config.canonicalGameName !== "string") {
        throw new Error("canonicalGameName not set in config.");
    }

    if (!config.basketPurchaseRedirect) {
      config.basketPurchaseRedirect = `/basket`;
    }

    return Object.freeze(config);
}

/**
 * Serializes a game config for use as an url parameter.
 */
export function serializeGameConfig(config: GameConfig): string {
    return btoa(JSON.stringify(config));
}

/**
 * Appends the config to the given url string
 */
export function appendGameConfigToURL(url: string, config: GameConfig): string {
    const hashHash = url.indexOf('#') !== -1;
    const divider = hashHash ? '&' : '#';
    const suffix = `config=${serializeGameConfig(config)}`;
    return url + divider + suffix;
}
