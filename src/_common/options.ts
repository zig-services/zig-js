import {KV} from "./ipc/kv";

export interface WinningClassOverride {
    winningClass: number;
    scenarioId: number;
}

export const Options = {
    get logging(): boolean {
        return KV.get("logging") === true;
    },

    set logging(value: boolean) {
        KV.set("logging", value);
    },


    get version(): string {
        return KV.get("version");
    },

    set version(value: string) {
        KV.set("version", value);
    },


    get winningClassOverride(): WinningClassOverride | null {
        return KV.get("winning-class-override");
    },

    set winningClassOverride(value: WinningClassOverride | null) {
        KV.set("winning-class-override", value);
    },


    get debuggingLayer(): boolean {
        return this.logging || this.version !== "latest" || this.winningClassOverride != null;
    }
};
