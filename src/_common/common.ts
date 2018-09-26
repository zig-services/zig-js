export function sleep(millis: number): Promise<{}> {
    return new Promise<{}>((resolve => window.setTimeout(resolve, millis)));
}

/**
 * Game settings as sent to the zig client by the
 * integration wrapper frame (outer.html).
 */
export interface GameSettings {
    // Filename or URL of the inner frame. If not set, this defaults to "inner.html"
    index?: string;

    // The aspect ratio of the game frame. Set this to -1 if the aspect is unknown
    // and the game's height could change during the game.
    aspect: number;

    // Set to true if this is a legacy game. This should only be set if the
    // game was not developed with the zig-js library. I hope it is not a legacy game.
    legacyGame?: boolean;

    // Set to true if the game should not have any overlay displayed.
    chromeless?: boolean;

    // Set this to signal that the game will handle the purchase flow itself.
    // This might be because it will handle bet factors or quantity selection.
    purchaseInGame?: boolean;
}
