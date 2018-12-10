import {Logger} from '../common/logging';
import {Unregister} from '../common/message-client';

type Style = { [key: string]: string | null; };

export class FullscreenService {
    private readonly logger = Logger.get('zig.Fullscreen');

    private backupStyle: Style | null = null;
    private unregisterResizeListener?: Unregister;

    constructor(private node: HTMLElement) {
    }

    private styleForOrientation(): Style {
        const landscape = screen.width > screen.height;

        if (landscape) {
            return {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100vh',
                padding: '0',
                margin: '0',
                'z-index': '9999',
            };
        } else {
            return {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100vh',
                padding: '0',
                margin: '0',
                'z-index': '9999',
            };
        }
    }

    private onWindowResize() {
        if (this.backupStyle != null) {
            this.logger.info('Update style after window size changed.');
            applyStyle(this.node, this.styleForOrientation());
        }
    }

    public enable(): void {
        if (this.backupStyle != null) {
            this.logger.warn('Style already applied, not applying again.');
            return;
        }

        this.logger.info('Applying style');
        this.backupStyle = applyStyle(this.node, this.styleForOrientation());

        // disable scroll bars
        document.body.style.overflow = 'hidden';

        if (document.fullscreenEnabled) {
          // noinspection JSIgnoredPromiseFromCall
            document.body.requestFullscreen();
        }

        // register a listener to keep orientation.
        const resizeHandler = () => this.onWindowResize();
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
            document.exitFullscreen();
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
