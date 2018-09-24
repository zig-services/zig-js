/**
 * Simple interface for a json key/value store using localStorage as backend.
 */
export const KV = {
    set(key: string, value: any): void {
        try {
            localStorage.setItem('kv.' + key, JSON.stringify(value));
        } catch (err) {
            console.log('Could not store KV:', key, value, err);
        }
    },

    get(key: string): any | null {
        try {
            const value = localStorage.getItem('kv.' + key) || 'null';
            return JSON.parse(value);
        } catch (err) {
            console.log('Could not read KV:', key, err);
            return null;
        }
    },
};
