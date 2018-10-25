// those are injected during build time.
declare const VERSION: string;
declare const BUILDTIME: number;

export const clientVersion: string = typeof VERSION !== "undefined" && VERSION || 'unknown';
export const buildTime: number = typeof BUILDTIME !== "undefined" && BUILDTIME || -1;