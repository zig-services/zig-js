import {Options} from "./options";

export class Logger {
    private readonly prefix: string;

    constructor(prefix: string) {
        for (let i = prefix.length; i < 16; i++) {
            prefix += " ";
        }

        this.prefix = prefix;
    }

    public debug(...args: any[]): void {
        Options.logging && this._log(`[DEBUG]`, "color: teal;", args);
    }

    public info(...args: any[]): void {
        Options.logging && this._log(" [INFO]", "color: green;", args);
    }

    public warn(...args: any[]): void {
        Options.logging && this._log(" [WARN]", "color: orange; font-weight: bold;", args);
    }

    public error(...args: any[]): void {
        Options.logging && this._log("[ERROR]", "color: red; font-weight: bold;", args);
    }

    private _log(level: string, css: string, args: any[]): void {
        console.log(`%c${level} %c${this.prefix}`, css, "color:darkgrey;", ...args);
    }
}


export function logger(prefix: string): Logger {
    return new Logger(prefix);
}

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
