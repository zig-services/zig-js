import {Logger} from '../common/logging';
import {Unregister} from '../common/message-client';

type Style = { [key: string]: string | null; };

export class FullscreenService {
    private readonly logger = Logger.get('zig.Fullscreen');

    private backupStyle: Style | null = null;
    private backupOverflow: string | null = null;
    private unregisterResizeListener?: Unregister;

    public onEnterFullscreen?: () => void;
    public onExitFullscreen?: () => void;

    constructor(private node: HTMLElement) {
    }

    private static styleForOrientation(orientation?: string[]): Style {
        const defaultFullScreenStyle = {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            padding: '0',
            margin: '0',
            'z-index': '9999',
        };

        // rotated to landscape mode
        const rotatedFullScreen = {
            position: 'fixed',
            top: '0',
            left: '100vw',
            width: '100vh',
            height: '100vw',
            padding: '0',
            margin: '0',
            'z-index': '9999',
            transform: 'rotate(90deg)',
            'transform-origin': '0 0',
        };

        const landscape = window.innerWidth > window.innerHeight;

        if (landscape) {
            return defaultFullScreenStyle;
        } else {
            // if game supports portrait then leave it portrait and don't rotate
            if (orientation && orientation.some(o => o === 'portrait')) {
                return defaultFullScreenStyle;
            }
            return rotatedFullScreen;
        }
    }

    private onWindowResize(orientation?: string[]) {
        if (this.backupStyle != null) {
            this.logger.info('Update style after window size changed.');
            applyStyle(this.node, FullscreenService.styleForOrientation(orientation));
        }
    }

    public enable(orientation?: string[]): void {
        if (this.backupStyle != null) {
            this.logger.warn('Style already applied, not applying again.');
            return;
        }

        if (!document.fullscreenEnabled) {
            return;
        }

        this.logger.info('Switching to fullscreen now.');

        // store style for rotating the game
        this.backupStyle = applyStyle(this.node, FullscreenService.styleForOrientation(orientation));

        // disable scroll bars
        this.backupOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const element = document.documentElement;
        if (element != null) {
            void Promise.resolve(element.requestFullscreen()).catch(err => {
                this.logger.warn('Could not switch to fullscreen:', err);
            });
        }

        if (this.onEnterFullscreen) {
            this.onEnterFullscreen();
        }
        
        // register a listener to keep orientation.
        const resizeHandler = () => this.onWindowResize(orientation);
        window.addEventListener('resize', resizeHandler);
        this.unregisterResizeListener = () => window.removeEventListener('resize', resizeHandler);
    }

    public disable() {
        if (this.backupStyle == null || !document.fullscreenEnabled) {
            return;
        }

        this.logger.info('Leaving fullscreen now.');

        if (this.unregisterResizeListener) {
            this.unregisterResizeListener();
            this.unregisterResizeListener = undefined;
        }

        if (this.backupOverflow != null) {
            document.body.style.overflow = this.backupOverflow;
            this.backupOverflow = null;
        }

        // re-apply original previous style
        applyStyle(this.node, this.backupStyle);
        this.backupStyle = null;

        const element = document.fullscreenElement;
        if (element) {
            // noinspection JSIgnoredPromiseFromCall
            void Promise.resolve(document.exitFullscreen()).catch(err => {
                this.logger.info('Could not disable fullscreen:', err);
            });
        }

        if (this.onExitFullscreen) {
            this.onExitFullscreen();
        }
    }
}

function applyStyle(node: HTMLElement, style: Style): Style {
    // create a backup of the existing properties
    const backup: Style = {};
    for (let index in node.style) {
        const attr = node.style[index];
        backup[attr] = node.style.getPropertyValue(attr);
    }

    // remove all existing properties
    while (node.style[0]) {
        node.style.removeProperty(node.style[0]);
    }

    // set the new properties
    for (let attribute in style) {
        node.style.setProperty(attribute, style[attribute]);
    }

    // and return the backup
    return backup;
}
