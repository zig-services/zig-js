export const WrapperStyleCSS = `
    html, body, iframe {
        width: 100vw;
        height: 100vh;
    
        border: 0;
        margin: 0;
        padding: 0;
    
        font-family: sans-serif;
    }
    
    .zig-notice {
        position: absolute;
        font-size: 0.7em; 
        padding: 0.5em;
        margin: -0.25em;
        border-radius: 0.25em;  
        z-index: 100;
    }
    
    .zig-notice span + span {
        margin-left: 1em;
    }
    
    .zig-splash {
        position: absolute;
        left: 0;
        top: 0;
        width: 100vw;
        height: 100vh;
        
        background-color: black;
        color: white;
        
        display: flex;
        
        /* center content */
        align-items: center;
        justify-content: center;
        text-align: center;
        
        transition: opacity 250ms ease-in;
    }
`;
