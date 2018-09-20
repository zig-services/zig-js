export function sleep(millis: number): Promise<{}> {
    return new Promise<{}>((resolve => window.setTimeout(resolve, millis)));
}

/**
 * Game settings as sent to the zig client by the
 * integration wrapper frame (outer.html).
 */
export interface GameSettings {
    index: string;
    aspect: number;
    legacyGame: boolean;
}
