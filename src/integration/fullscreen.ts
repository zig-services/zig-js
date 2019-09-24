import {Logger} from '../common/logging';
import {Unregister} from '../common/message-client';

const logger = Logger.get('zig.Fullscreen');

type Style = { [key: string]: string | null; };

export interface FullscreenService {
    enable(orientation?: string[]): void;

    disable(): void;
}

export class CompositeFullscreenService implements FullscreenService {
    constructor(private readonly delegates: FullscreenService[]) {
    }

    enable(orientation?: string[]): void {
        this.delegates.forEach(delegate => delegate.enable(orientation));
    }

    disable(): void {
        this.delegates.forEach(delegate => delegate.disable());
    }
}

/**
 * Does not move the element into fullscreen, only moves it out of the dom and
 * sets it size to match the window.
 */
export class FakeFullscreenService implements FullscreenService {
    private backupStyle: Style | null = null;
    private backupOverflow: string | null = null;

    private unregisterResizeListener?: Unregister;

    constructor(private readonly node: HTMLElement) {
    }

    public enable(orientation?: string[]): void {
        if (this.backupStyle != null) {
            logger.warn('Style already applied, not applying again.');
            return;
        }

        logger.info('Switching to fullscreen now.');

        // store style for rotating the game
        this.backupStyle = applyStyle(this.node, styleForOrientation(orientation));

        // disable scroll bars
        this.backupOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // register a listener to keep orientation.
        const resizeHandler = () => this.onWindowResize(orientation);
        window.addEventListener('resize', resizeHandler);
        this.unregisterResizeListener = () => window.removeEventListener('resize', resizeHandler);

        return;
    }

    public disable(): void {
        if (this.backupStyle == null) {
            return;
        }

        logger.info('Leaving fullscreen now.');

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
    }

    private onWindowResize(orientation?: string[]) {
        if (this.backupStyle != null) {
            logger.info('Update style after window size changed.');
            applyStyle(this.node, styleForOrientation(orientation));
        }
    }
}

/**
 * Really put the document node into fullscreen. Works best as a second step
 * to the FakeFullscreenService.
 */
export class RealFullscreenService implements FullscreenService {
    enable(orientation?: string[]): void {
        if (!document.fullscreenEnabled) {
            return;
        }

        const element = document.documentElement;
        if (element != null) {
            try {
                void Promise.resolve(element.requestFullscreen()).catch(err => {
                    logger.warn('Could not switch to fullscreen:', err);
                });
            } catch (err) {
                logger.warn('Could not switch to fullscreen:', err);
                return;
            }
        }

        return;
    }

    disable(): void {
        if (!document.fullscreenEnabled) {
            return;
        }

        const element = document.fullscreenElement;

        if (element) {
            // noinspection JSIgnoredPromiseFromCall
            void Promise.resolve(document.exitFullscreen()).catch(err => {
                logger.info('Could not disable fullscreen:', err);
            });
        }

        return;
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
    for (const attribute in style) {
        if (style.hasOwnProperty(attribute)) {
            node.style.setProperty(attribute, style[attribute]);
        }
    }

    // and return the backup
    return backup;
}

function styleForOrientation(orientation?: string[]): Style {
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
