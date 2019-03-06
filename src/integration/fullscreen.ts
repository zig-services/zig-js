import {Logger} from '../common/logging';
import {Unregister} from '../common/message-client';

type Style = { [key: string]: string | null; };

export class FullscreenService {
    private readonly logger = Logger.get('zig.Fullscreen');

    private backupStyle: Style | null = null;
    private unregisterResizeListener?: Unregister;

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

        this.logger.info('Applying style');
        this.backupStyle = applyStyle(this.node, FullscreenService.styleForOrientation(orientation));

        // disable scroll bars
        document.body.style.overflow = 'hidden';

        if (document.fullscreenEnabled) {
            // noinspection JSIgnoredPromiseFromCall
            void Promise.resolve(document.body.requestFullscreen()).catch(ignored => true);
        }

        // register a listener to keep orientation.
        const resizeHandler = () => this.onWindowResize(orientation);
        window.addEventListener('resize', resizeHandler);
        this.unregisterResizeListener = () => window.removeEventListener('resize', resizeHandler);
    }

    public disable() {
        if (this.backupStyle == null) {
            return;
        }

        this.logger.info('Leaving fullscreen now.');

        if (this.unregisterResizeListener) {
            this.unregisterResizeListener();
        }

        document.body.style.overflow = null;

        // re-apply original previous style
        applyStyle(this.node, this.backupStyle);
        this.backupStyle = null;

        if (document.fullscreenEnabled) {
            // noinspection JSIgnoredPromiseFromCall
            void Promise.resolve(document.exitFullscreen()).catch(ignored => true);
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
