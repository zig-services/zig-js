import {KV} from './kv';
import {GameConfig, SimpleGameConfig} from './config';

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


    /**
     * disable AudioContext in selected browsers, defaults to 'true'.
     */
    get disableAudioContext(): boolean {
        return KV.get('disableAudioContext') !== false;
    },

    set disableAudioContext(value: boolean) {
        KV.set('disableAudioContext', value);
    },


    get winningClassOverride(): WinningClassOverride | null {
        return KV.get('winning-class-override');
    },

    set winningClassOverride(value: WinningClassOverride | null) {
        KV.set('winning-class-override', value);
    },


    get localeOverride(): string | null {
        return KV.get('locale-override');
    },

    set localeOverride(locale: string | null) {
        KV.set('locale-override', locale);
    },

    get configOverrideEnabled(): Boolean | null {
        return KV.get('config-override-enabled');
    },

    set configOverrideEnabled(value: Boolean | null) {
        KV.set('config-override-enabled', value);
    },

    get configOverride(): Partial<GameConfig> | null {
        return KV.get('config-override');
    },

    set configOverride(value: Partial<GameConfig> | null) {
        KV.set('config-override', value);
    },

    get debuggingLayer(): boolean {
        return !!this.logging
            || !!this.version
            || this.winningClassOverride != null
            || !!this.localeOverride;
    },
};
