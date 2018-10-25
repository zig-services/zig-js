import {Options} from './options';

const loggingOptions = new (class {
    private lastUpdate: number = 0;
    private enabledCached: boolean = false;

    public get enabled(): boolean {
        if (Date.now() - this.lastUpdate > 1) {
            this.lastUpdate = Date.now();
            this.enabledCached = Options.logging;
        }

        return this.enabledCached;
    }
})();

export class Logger {
    constructor(private name: string) {
    }

    public static get(name: string): Logger {
        return new Logger(name);
    }

    public log(message: any, ...params: any[]): void {
        if (loggingOptions.enabled) {
            this.debug(message, ...params);
        }
    }

    public debug(message: any, ...params: any[]): void {
        if (loggingOptions.enabled) {
            console.debug(`%c[DEBUG] %c[${this.name}]`, 'color:teal;', 'color:darkgrey;', message, ...params);
        }
    }

    public info(message: any, ...params: any[]): void {
        if (loggingOptions.enabled) {
            console.info(`%c [INFO] %c[${this.name}]`, 'color:green;', 'color:darkgrey;', message, ...params);
        }
    }

    public warn(message: any, ...params: any[]): void {
        console.warn(`%c [WARN] %c[${this.name}]`, 'color:orange;font-weight:bold;', 'color:darkgrey;', message, ...params);
    }

    public error(message: any, ...params: any[]): void {
        console.error(`%c[ERROR] %c[${this.name}]`, 'color:red;font-weight:bold;', 'color:darkgrey;', message, ...params);
    }

    public timeStamp(tag: string): void {
        if (console.timeStamp) {
            console.timeStamp(tag);
        }
    }

    /**
     * Calls the given action and records the time it takes to execute it.
     * It will then automatically log something like `${name} took 1.34ms`.
     */
    public time<T>(name: string, action: () => T): T {
        if (loggingOptions.enabled) {
            const startTime: number = Date.now();
            this.timeStamp(name);

            const result: T = action();

            const duration: string = ((Date.now() - startTime) / 1000.0).toFixed(4);
            this.debug(`${name} took ${duration}ms`);

            return result;

        } else {
            return action();
        }
    }
}

(window as any)['enableZigLogging'] = function () {
    Options.logging = true;
};
