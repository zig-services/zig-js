/**
 * Game settings as sent to the zig integration by the
 * integration wrapper frame (outer.html).
 */
import {deepFreezeClone} from './common';
import {Options} from './options';

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
    // This also implies purchaseInGame=true.
    readonly chromeless?: boolean;

    // Set this to signal that the game will handle the purchase flow itself.
    // This might be because it will handle bet factors or quantity selection.
    readonly purchaseInGame?: boolean;

    /*
     * Set this to configure the in game clock.
     * @deprecated Use overlayNoticeStyle now.
     */
    readonly clockStyle?: OverlayNoticeStyle;

    // Set the style for the overlay notice if it is displayed.
    // The notice might include the licence info as well as the clock.
    readonly overlayNoticeStyle?: OverlayNoticeStyle;

    // Disable the splash screen that is shown when loading the game. The default
    // is to always show the splash screen if the game is not 'chromeless'
    readonly disableSplashScreen?: true;

    // Set this to true to prevent the game to go to fullscreen
    // even if the integrator allows it.
    readonly fullscreenNotSupported?: true;

    // Possible values: 'portrait', 'orientation'.
    // Defines orientation supported by a game.
    readonly orientation?: string[];
}

export interface OverlayNoticeStyle {
    verticalAlignment: 'top' | 'bottom';
    horizontalAlignment: 'left' | 'right';
    fontColor?: string;
    backgroundColor?: string;
}

export type TicketIdOverlayType = 'ticketNumber' | 'ticketId' | null;

/**
 * The game config is send from the integration to the games outer.html
 * and proxied by the outer.html to the inner.html.
 */
export interface GameConfig {
    // the name of the game for use in api requests to buy a ticket
    readonly canonicalGameName: string;

    // set to true to enable overlay in the outer.html
    readonly overlay: boolean;

    /**
     * access token for remote game services.
     * @deprecated
     */
    readonly remoteAccessToken?: string;

    // Set this to true if you would like to handle the game as a
    // remote game and would like to use the remote game flow. If not specified,
    // this will be 'false' if no remoteAccessToken is given, true otherwise.
    readonly isRemoteGame: boolean;

    // the vendor config. This is an opaque value that is given to the operator
    // by a previous launchGame request and is used by the games frontend
    // to authenticate with the vendors remote game service implementation.
    readonly vendorConfig?: { [key: string]: string; };

    // can be used as a redirect after purchasing a game via basket
    readonly basketPurchaseRedirect: string;

    // If the game contains a "leave" button this will be the url
    // it will redirect to. Dont show the button if this is not defined.
    readonly lobbyUrl: string;

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

    // Show ticket number or ticket id in the game. No ticket id will be shown,
    // if this is not set. The ticket id will be shown near the clock.
    readonly displayTicketIdOverlayType: TicketIdOverlayType;

    // If this is set to false (default), only one demo game will be allowed.
    readonly multipleDemoGames: boolean;
}

export type SimpleGameConfig = Partial<GameConfig> & {
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
    let config = JSON.parse(atob(encoded)) as SimpleGameConfig;

    // noinspection SuspiciousTypeOfGuard
    if (typeof config.canonicalGameName !== 'string') {
        throw new Error('canonicalGameName not set in config.');
    }

    if (Options.localeOverride != null) {
        // override locale in the config.
        config = {...config, locale: Options.localeOverride};
    }

    if (Options.configOverrideEnabled) {
        config = Object.assign(config, Options.configOverride);
    }

    return deepFreezeClone(defaultsToGameConfig(config));
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


export function defaultsToGameConfig(config: SimpleGameConfig): GameConfig {
    const i18n = defaultInternationalization();

    return {
        // copy all extra fields that might not be part of the known config
        ...config,

        canonicalGameName: config.canonicalGameName,

        remoteAccessToken: config.remoteAccessToken,
        isRemoteGame: config.isRemoteGame != null ? config.isRemoteGame : !!config.remoteAccessToken,

        vendorConfig: deepFreezeClone(config.vendorConfig),

        lobbyUrl: config.lobbyUrl || '/',
        basketPurchaseRedirect: config.basketPurchaseRedirect || '/basket',

        overlay: config.overlay || false,
        isTestStage: config.isTestStage || false,

        locale: config.locale || i18n.locale,
        timeZone: config.timeZone || i18n.timeZone,
        timeZoneOffsetToUTCInMillis: config.timeZoneOffsetToUTCInMillis || i18n.timeZoneOffsetToUTCInMillis,

        clientTimeOffsetInMillis: config.clientTimeOffsetInMillis || 0,

        displayTicketIdOverlayType: config.displayTicketIdOverlayType || null,

        multipleDemoGames: config.multipleDemoGames || false,
    };
}

interface I18N {
    locale: string;
    timeZone: string;
    timeZoneOffsetToUTCInMillis: number;
}

function defaultInternationalization(): I18N {
    return {
        locale: 'en_GB',
        timeZone: 'Europe/London',
        timeZoneOffsetToUTCInMillis: 0,
    };
}
