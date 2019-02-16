const zigWindow: { __zig_events?: { [k: string]: boolean }; } = window as any;

/**
 * Inject CSS styles into the page.
 */
export function injectStyle(css: string, id?: string): void {
    let style: HTMLStyleElement | null = null;

    if (id) {
        // lookup, maybe it is already in the document
        style = document.getElementById(id) as HTMLStyleElement;
    }

    if (!style) {
        style = document.createElement('style');
        if (id) {
            style.id = id
        }
    }

    style.textContent = css;

    document.body.appendChild(style);
}

const eventStore: { [k: string]: boolean } = (zigWindow.__zig_events = zigWindow.__zig_events || {});

function registerEventHandler(object: any, eventName: string): (f: () => void) => void {
    if (!eventStore[eventName]) {
        if (document.readyState === 'interactive') {
            eventStore['DOMContentLoaded'] = true;
        }

        object.addEventListener(eventName, () => {
            eventStore[eventName] = true;
        });
    }

    return (func: () => void) => {
        if (eventStore[eventName]) {
            window.setTimeout(func, 0);
        } else {
            object.addEventListener(eventName, func);
        }
    };
}

/**
 * Register a function to be called on DOMContentLoaded event.
 * If the event already fired before, this will trigger again.
 * @type {(f: () => void) => void}
 */
export const onDOMLoad = registerEventHandler(document, 'DOMContentLoaded');

/**
 * Register a function to be called on document load.
 * If the event already fired before, this will trigger again.
 * @type {(f: () => void) => void}
 */
export const onLoad = registerEventHandler(window, 'load');
