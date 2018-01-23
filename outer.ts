interface IGameSettings {
    index: string;
    aspect: number;
}

(function () {
    // get game config from window
    const GameConfig = <IGameSettings>window["GameSettings"];
    if (GameConfig == null) {
        throw new Error("window.GameConfig must be initialized.");
    }

    function extractConfigParameter(): string {
        const match = /\?.*\bconfig=([a-zA-Z0-9+-]+=*)/.exec(location.href);
        if (match == null) {
            throw new Error("no config parameter found.")
        }

        return match[1];
    }

    function initializeStyle() {
        let style = document.createElement("style");
        style.textContent = `
            html, body, iframe {
              width: 100%;
              height: 100%;
        
              border: 0;
              margin: 0;
              padding: 0;
            }`;

        document.head.appendChild(style);
    }

    function initializeInnerFrame(): void {
        const config = extractConfigParameter();

        const sep = GameConfig.index.indexOf("?") === -1 ? "?" : "&";
        const url = GameConfig.index + sep + "config=" + config;

        // create iframe and insert into document.
        const iframe = document.createElement("iframe");
        iframe.src = url;
        iframe.allowFullscreen = true;
        iframe.scrolling = "no";
        document.body.appendChild(iframe);
    }

    function initializeMessageProxy() {
        window.addEventListener("message", event => {
            const data = event.data;

            if (event.source === window.parent) {
                console.log("proxying message from parent to child", data);
                return;
            } else {
                console.log("proxying message from child to parent:", data);
                window.parent.postMessage(data, "*");
            }
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        initializeStyle();
        initializeMessageProxy();
        initializeInnerFrame()
    });
})();
