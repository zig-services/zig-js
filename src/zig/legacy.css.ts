export const LegacyStyleCSS = `
    #loader img {
        max-width: inherit;
        width: 100%;
        max-height: 100%;
    }
    
    #loaderImageHolder img {
        -webkit-transform: none;
        transform: none;
        position: absolute;
        top: 0;
        left: 0;
    }
    
    #loaderImageHolder {
        position: absolute;
        width: 100%;
        top: 0;
        left: 0;
        -webkit-transform: none;
        transform: none;
        max-height: inherit !important;
        height: 100%;
    }
    
    #loadingBarHolder {
        z-index: 1;
    }
    
    #loadingBarHolder.loaded {
        display: none !important;
    }
`;