export function onDOMLoad(func: () => void) {
    if (document.readyState === "interactive") {
        func();
    } else {
        document.addEventListener("DOMContentLoaded", func);
    }
}

export function onLoad(func: () => void) {
    if (document.readyState === "complete") {
        func();
    } else {
        document.addEventListener("load", func);
    }
}
