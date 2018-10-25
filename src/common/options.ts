import {KV} from './kv';

export interface WinningClassOverride {
    winningClass: number;
    scenarioId: number;
}

/**
 * Options accessors that store their state in local storage. They allow for easy access
 * and parsing of the configurable options.
 */
export const Options = {
    get logging(): boolean {
        return KV.get('logging') === true;
    },

    set logging(value: boolean) {
        KV.set('logging', value);
    },


    get version(): string | null {
        return KV.get('version');
    },

    set version(value: string | null) {
        KV.set('version', value);
    },


    get winningClassOverride(): WinningClassOverride | null {
        return KV.get('winning-class-override');
    },

    set winningClassOverride(value: WinningClassOverride | null) {
        KV.set('winning-class-override', value);
    },


    get debuggingLayer(): boolean {
        return !!this.logging || !!this.version || this.winningClassOverride != null;
    },
};
