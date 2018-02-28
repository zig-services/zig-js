const eventStore: { [k: string]: boolean } = (window["__zig_events"] = window["__zig_events"] || {});

function registerEventHandler(object: any, eventName: string): (f: () => void) => void {
    if (!eventStore[eventName]) {
        if (document.readyState === "interactive") {
            eventStore["DOMContentLoaded"] = true;
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

export const onDOMLoad = registerEventHandler(document, "DOMContentLoaded");
export const onLoad = registerEventHandler(window, "load");
