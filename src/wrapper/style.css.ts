export const WrapperStyleCSS = `
    html, body, iframe {
        width: 100vw;
        height: 100vh;
    
        border: 0;
        margin: 0;
        padding: 0;
    
        font-family: sans-serif;
    }
    
    .zig-clock {
        position: absolute;
        font-size: 0.8em; 
        padding: 0.25em;  
        z-index: 100;
    }
    
    .zig-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.2);
    }
    
    .zig-alert {
        position: absolute;
        z-index: 1;
    
        margin-left: auto;
        margin-right: auto;
        left: 0;
        right: 0;
    
        top: 3em;
        width: 80%;
        max-width: 20em;
        background: white;
        box-shadow: 0 0 0.5em rgba(0, 0, 0, 0.25);
        padding: 1em;
        border-radius: 0.25em;
    
        color: black;
    }
    
    .zig-alert__title {
        font-size: 1.33em;
        font-weight: bold;
        padding-bottom: 0.33em;
    }
    
    .zig-alert__text {
        padding-bottom: 0.33em;
    }
    
    .zig-alert__button {
        color: black;
        font-weight: bold;
        text-decoration: none;
    
        float: right;
        padding: 0.25em;
    }
    
    .zig-alert__button:hover {
        color: #f08;
        background: #eee;
    }
    
    .zig-start-button {
        position: absolute;
        display: block;
        right: 4em;
        bottom: 4em;
        padding: 1em;
        background: white;
        box-shadow: 0 0 0.5em rgba(0, 0, 0, 0.25);
    
        color: black;
        font-weight: bold;
        text-decoration: none;
    }
`