import 'fullscreen-polyfill';

import {Logger} from './logging';

const logger = Logger.get('zig.Polyfill');

/**
 * Very simple polyfill for localStorage
 */
(function () {
    let supported = false;

    try {
        if (window.hasOwnProperty('localStorage') && window.localStorage !== null) {
            supported = true;

            // Some browsers will return true when in private browsing mode so test to make sure it's functional.
            const key = 'swxTest_' + Math.round(Math.random() * 1e7);

            // just so no one optimizes the catch away
            if (key === 'will never match') {
                // noinspection ExceptionCaughtLocallyJS
                throw Error();
            }

            window.localStorage.setItem(key, 'test');
            window.localStorage.removeItem(key);
        }
    } catch (e) {
        logger.warn('localStorage not functional, falling back to session Object.');
        supported = false;
    }

    if (!supported) {
        let data: { [key: string]: any } = {};

        const myLocalStorage = {
            setItem: function (key: string, value: any) {
                data[key] = value;
                return data[key];
            },

            getItem: function (key: string) {
                return (key in data) ? data[key] : undefined;
            },

            removeItem: function (key: string) {
                delete data[key];
                return undefined;
            },

            clear: function () {
                data = {};
                return data;
            },
        };

        Object.defineProperty(window, 'localStorage', {
            get() {
                return myLocalStorage;
            },
        });
    }
}());
