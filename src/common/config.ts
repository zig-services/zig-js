/**
 * Game settings as sent to the zig integration by the
 * integration wrapper frame (outer.html).
 */
export interface GameSettings {
    // Filename or URL of the inner frame. If not set, this defaults to "inner.html"
    readonly index?: string;

    // The aspect ratio of the game frame. Set this to -1 if the aspect is unknown
    // and the game's height could change during the game.
    readonly aspect: number;

    // Set to true if this is a legacy game. This should only be set if the
    // game was not developed with the zig-js library. I hope it is not a legacy game.
    readonly legacyGame?: boolean;

    // Set to true if the game should not have any overlay displayed.
    // This also implies purchaseInGame=true.e
    readonly chromeless?: boolean;

    // Set this to signal that the game will handle the purchase flow itself.
    // This might be because it will handle bet factors or quantity selection.
    readonly purchaseInGame?: boolean;
}

/**
 * The game config is send from the integration to the games outer.html
 * and proxied by the outer.html to the inner.html.
 */
export interface GameConfig {
    // the name of the game for use in api requests to buy a ticket
    readonly canonicalGameName: string;

    // set to true to enable overlay in the outer.html
    readonly overlay: boolean;

    // access token for remote game services.
    readonly remoteAccessToken?: string;

    // can be used as a redirect after purchasing a game via basket
    readonly basketPurchaseRedirect: string;

    // Set this to true to enable a test stage mode. Defaults to false
    // if not set.
    readonly isTestStage: boolean;

    // The users locale, e.g. en_GB, en_IE or de_DE.
    readonly locale: string;

    // The time zone that shall be used by the game. E.g. "Europe/Berlin".
    readonly timeZone: string;

    // The current time zone offset from UTC in millis.
    readonly timeZoneOffsetToUTCInMillis: number;

    // The offset between the clients time and the server time.
    // Add this to Date.now() to get the current server time.
    readonly clientTimeOffsetInMillis: number;
}

type SimpleGameConfig = Partial<GameConfig> & {
    // This is the only required field in a game config.
    // All other values will be filled with default values if not set.
    readonly canonicalGameName: string
};


/**
 * Get the config parameter from the current location parameter.
 */
export function parseGameConfigFromURL(url: string = location.href): GameConfig {
    const match = /[?#].*\bconfig=([a-zA-Z0-9+/]+=*)/.exec(url);
    if (match == null) {
        throw new Error('No config parameter found.');
    }

    const [, encoded] = match;
    const config = JSON.parse(atob(encoded)) as SimpleGameConfig;

    // noinspection SuspiciousTypeOfGuard
    if (typeof config.canonicalGameName !== 'string') {
        throw new Error('canonicalGameName not set in config.');
    }

    return Object.freeze(defaultsToGameConfig(config));
}

/**
 * Serializes a game config for use as an url parameter.
 */
export function serializeGameConfig(config: SimpleGameConfig): string {
    return btoa(JSON.stringify(config));
}

/**
 * Appends the config to the given url string
 */
export function appendGameConfigToURL(url: string, config: SimpleGameConfig): string {
    const hashHash = url.indexOf('#') !== -1;
    const divider = hashHash ? '&' : '#';
    const suffix = `config=${serializeGameConfig(config)}`;
    return url + divider + suffix;
}


function defaultsToGameConfig(config: SimpleGameConfig): GameConfig {
    const i18n = defaultInternationalization();

    return {
        canonicalGameName: config.canonicalGameName,
        remoteAccessToken: config.remoteAccessToken,

        basketPurchaseRedirect: config.basketPurchaseRedirect || '/basket',

        overlay: config.overlay || false,
        isTestStage: config.isTestStage || false,

        locale: config.locale || i18n.locale,
        timeZone: config.timeZone || i18n.timeZone,
        timeZoneOffsetToUTCInMillis: config.timeZoneOffsetToUTCInMillis || i18n.timeZoneOffsetToUTCInMillis,

        clientTimeOffsetInMillis: config.clientTimeOffsetInMillis || 0,
    };
}

interface I18N {
    locale: string;
    timeZone: string;
    timeZoneOffsetToUTCInMillis: number;
}

function defaultInternationalization(): I18N {
    return {
        locale: 'en_EN',
        timeZone: 'Europe/London',
        timeZoneOffsetToUTCInMillis: 0,
    };
}
