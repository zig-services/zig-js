/**
 * Tries to guess the requested script override version. The version
 * can be specified as zigVersion url parameter or as a zigVersion cookie.
 * @returns {string}
 */
export function scriptVersionOverride(): string | null {
    const matches = [location.href, document.cookie]
        .map(v => /zigVersion=([0-9.]+|dev|latest)/.exec(v || ""))
        .filter(match => match != null)
        .map(match => match[1]);

    return matches[0] || null;
}