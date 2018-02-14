export function injectStyle(css: string): void {
    const style = document.createElement("style");
    style.textContent = css;
    document.body.appendChild(style);
}
