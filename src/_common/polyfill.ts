import {logger} from "./common";
//
// polyfill for promises.
import 'promise-polyfill/src/polyfill';

const log = logger("zig.polyfill");

export function objectAssignPolyfill() {
    // taken from
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill

    if (typeof Object.assign !== 'function') {
        log.debug("Using Object.assign polyfill");

        // Must be writable: true, enumerable: false, configurable: true
        Object.defineProperty(Object, "assign", {
            writable: true,
            configurable: true,
            value: function assign(target, varArgs) { // .length of function is 2
                if (target == null) { // TypeError if undefined or null
                    throw new TypeError('Cannot convert undefined or null to object');
                }

                const to = Object(target);

                for (let index = 1; index < arguments.length; index++) {
                    const nextSource = arguments[index];

                    if (nextSource == null) {
                        continue;
                    }

                    for (const nextKey in nextSource) {
                        // Avoid bugs when hasOwnProperty is shadowed
                        if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                            to[nextKey] = nextSource[nextKey];
                        }
                    }
                }

                return to;
            },
        });
    }
}


export function localStoragePolyfill() {
    if (!available("localStorage")) {
        defineStorage("localStorage");
    }

    if (!available("sessionStorage")) {
        defineStorage("sessionStorage");
    }

    function available(type: string): boolean {
        try {
            if (window[type] != null) {
                window[type].setItem("__pf", "true");
                return true;
            }
        } catch (err) {
        }
        return false;
    }

    function defineStorage(type: string) {
        log.debug(`Using polyfill for ${type}`);

        Object.defineProperty(window, type, new (function () {
            const aKeys = [], oStorage: any = {};
            Object.defineProperty(oStorage, "getItem", {
                value: function (sKey) {
                    return sKey ? this[sKey] : null;
                },
                writable: false,
                configurable: false,
                enumerable: false
            });
            Object.defineProperty(oStorage, "key", {
                value: function (nKeyId) {
                    return aKeys[nKeyId];
                },
                writable: false,
                configurable: false,
                enumerable: false
            });
            Object.defineProperty(oStorage, "setItem", {
                value: function (sKey, sValue) {
                    if (!sKey) {
                        return;
                    }
                    document.cookie = escape(sKey) + "=" + escape(sValue) + "; expires=Tue, 19 Jan 2038 03:14:07 GMT; path=/";
                },
                writable: false,
                configurable: false,
                enumerable: false
            });
            Object.defineProperty(oStorage, "length", {
                get: function () {
                    return aKeys.length;
                },
                configurable: false,
                enumerable: false
            });
            Object.defineProperty(oStorage, "removeItem", {
                value: function (sKey) {
                    if (!sKey) {
                        return;
                    }
                    document.cookie = escape(sKey) + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
                },
                writable: false,
                configurable: false,
                enumerable: false
            });
            Object.defineProperty(oStorage, "clear", {
                value: function () {
                    if (!aKeys.length) {
                        return;
                    }
                    for (const sKey in aKeys) {
                        document.cookie = escape(sKey) + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
                    }
                },
                writable: false,
                configurable: false,
                enumerable: false
            });
            this.get = function () {
                let iThisIndx;
                for (const sKey in oStorage) {
                    iThisIndx = aKeys.indexOf(sKey);
                    if (iThisIndx === -1) {
                        oStorage.setItem(sKey, oStorage[sKey]);
                    }
                    else {
                        aKeys.splice(iThisIndx, 1);
                    }
                    delete oStorage[sKey];
                }
                for (aKeys; aKeys.length > 0; aKeys.splice(0, 1)) {
                    oStorage.removeItem(aKeys[0]);
                }
                for (let aCouple, iKey, nIdx = 0, aCouples = document.cookie.split(/\s*;\s*/); nIdx < aCouples.length; nIdx++) {
                    aCouple = aCouples[nIdx].split(/\s*=\s*/);
                    if (aCouple.length > 1) {
                        oStorage[iKey = unescape(aCouple[0])] = unescape(aCouple[1]);
                        aKeys.push(iKey);
                    }
                }
                return oStorage;
            };
            this.configurable = false;
            this.enumerable = true;
        })());
    }
}
