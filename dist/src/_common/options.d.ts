export interface WinningClassOverride {
    winningClass: number;
    scenarioId: number;
}
export declare const Options: {
    logging: boolean;
    version: string;
    winningClassOverride: WinningClassOverride;
    readonly debuggingLayer: boolean;
};
