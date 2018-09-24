// those are injected during build time.
declare const VERSION: string;
declare const BUILDTIME: number;

export const clientVersion: string = VERSION || 'unknown';
export const buildTime: number = BUILDTIME || -1;