export interface IGameConfig {
    canonicalGameName: string;
    overlay?: boolean;
}
/**
 * Get the config parameter from the current location parameter.
 */
export declare function parseGameConfigFromURL(url?: string): IGameConfig;
/**
 * Serializes a game config for use as an url parameter.
 */
export declare function serializeGameConfig(config: IGameConfig): string;
/**
 * Appends the config to the given url string
 */
export declare function appendGameConfigToURL(url: string, config: IGameConfig): string;
