import {Currency, IMoneyAmount} from '../common/domain';
import {UIState} from './connector';
import {GameActions} from './webpage';
import {Logger} from '../common/logging';
import {injectStyle} from '../common/dom';

const logger = Logger.get('zig.Overlay');

function currencySymbol(currency: Currency): string {
    const symbols = {
        EUR: '€',
        USD: '$',
        RON: 'RON',
        GBP: '£',
    };

    return (symbols as any)[currency] || currency;
}

export class Translations {
    readonly action_Play: string = 'Play';
    readonly action_Buy: string = 'Buy & Play';
    readonly action_Resume: string = 'Resume';
    readonly action_Login: string = 'Login';
    readonly action_Payin: string = 'Payin';
    readonly action_Voucher: string = 'Play for free';

    readonly main_TicketPrice: string = 'Price per game: ';
    readonly main_Unplayed: string = 'Resume unplayed game';

    readonly hint_Login: string = 'Login first';

    readonly demo_FreePlay: string = 'Free try';
    readonly demo_NoPayout: string = 'No payout!';
    readonly demo_Action: string = 'Play for free';
    readonly demo_HintNoFree: string = 'That was fun!';
    readonly demo_HintPlayAgain: string = 'Play a real game';

    public formatMoneyAmount(amount: IMoneyAmount): string {
        const formatted = amount.amountInMajor.toFixed(2).replace(',', '.');
        return `${formatted} ${currencySymbol(amount.currency)}`;
    }
}

export class Translations_en_GB extends Translations {
}

export class Translations_de_DE extends Translations {
    readonly action_Play: string = 'Spielen';
    readonly action_Buy: string = 'Kaufen & spielen';
    readonly action_Resume: string = 'Fortsetzen';
    readonly action_Login: string = 'Anmelden';
    readonly action_Payin: string = 'Einzahlen';
    readonly action_Voucher: string = 'Gutschein einlösen';

    readonly main_TicketPrice: string = 'Preis pro Spiel: ';
    readonly main_Unplayed: string = 'Ein ungespieltes Spiel fortsetzen';

    readonly hint_Login: string = 'Bitte melden Sie sich zuerst an';

    readonly demo_FreePlay: string = 'Gratis testen';
    readonly demo_NoPayout: string = 'Keine Gewinnchance';
    readonly demo_Action: string = 'Gratis testen';
    readonly demo_HintNoFree: string = 'Hat es Spaß gemacht?';
    readonly demo_HintPlayAgain: string = 'Um echtes Geld spielen';

    public formatMoneyAmount(amount: IMoneyAmount): string {
        const formatted = amount.amountInMajor.toFixed(2).replace('.', ',');
        return `${formatted} ${currencySymbol(amount.currency)}`;
    }
}

const css: string = `
.zig-overlay {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    text-align: left;
    background: #eee;
}

.zig-overlay > * {
    display: block;
    box-sizing: border-box;
}


.zig-overlay__title {
    padding-top: 1rem;
    padding-left: 1rem;
    padding-right: 1rem;
    
    font-size: 1.25rem;
    line-height: 1.5rem;
    font-weight: 700;
}

.zig-overlay__subtitle {
    padding-top: 0.5rem;
    padding-left: 1rem;
    padding-right: 1rem;
    line-height: 1.25rem;
}

.zig-overlay__action {
    padding-top: 1rem;
    padding-bottom: 1rem;
}


.zig-overlay__title--demo {
    order: 0;
    flex-basis: 35%;
}
.zig-overlay__subtitle--demo {
    order: 2;
    flex-basis: 35%;
}

.zig-overlay__action--demo {
    order: 4;
    flex-basis: 35%;
}


.zig-overlay__title--main {
    order: 1;
    flex-basis: 65%;
    border-left: 1px solid white;
}

.zig-overlay__subtitle--main {
    order: 3;
    flex-basis: 65%;
    border-left: 1px solid white;
}

.zig-overlay__action--main {
    order: 5;
    flex-basis: 65%;
    border-left: 1px solid white;
}


.zig-overlay__description {
    order: 6;
    flex-grow: 1;
    padding: 1rem;
    border-top: 1px solid white;
}

.zig-overlay .zig-action {
    display: inline-block;
    border: 1px solid #888;
    border-radius: 0.5rem;
    padding: 0.5rem;
    background: #ddd;
    line-height: 1.25rem;
}

.zig-overlay .zig-action--primary {
    background: #8dde7a;
    color: #555;
}

.zig-overlay .zig-action-wrapper {
    display: inline-block;
    padding-left: 1rem;
    padding-right: 1rem; 
}

.zig-overlay .zig-hint {
    display: inline-block;
    color: white;
    background: #555;
    border-top: 1px solid #555;
    border-bottom: 1px solid #555;
    padding: 0.5rem 1rem;
}
`;

function renderUIState(target: Element, translations: Translations, belowGameHint?: string): UpdateUIStateFn {
    function ZigTitle(type: string, content: string = '&nbsp;'): string {
        return `<div class="zig-overlay__title zig-overlay__title--${type}">${content}</div>`;
    }

    function ZigSubtitle(type: string, content: string = '&nbsp;'): string {
        return `<div class="zig-overlay__subtitle zig-overlay__subtitle--${type}">${content}</div>`;
    }

    function ZigActionContainer(type: string, content: string = '&nbsp;'): string {
        return `<div class="zig-overlay__action zig-overlay__action--${type}">${content}</div>`;
    }

    function ZigDescription(content: string = '&nbsp;'): string {
        return `<div class="zig-overlay__description">${content}</div>`;
    }

    function ZigPrice(amount: IMoneyAmount, discounted?: IMoneyAmount): string {
        if (discounted != null) {
            return `
                <span>
                    <span class="zig-price zig-price--strike">${translations.formatMoneyAmount(amount)}</span>
                    <span class="zig-price zig-price--discounted">${translations.formatMoneyAmount(discounted)}</span>
                </span>
            `;

        } else {
            return `
                <span>
                    <span class="zig-price">${translations.formatMoneyAmount(amount)}</span>
                </span>
            `;
        }
    }

    function ZigAction(primary: boolean, text: string) {
        return `
            <div class="zig-action-wrapper">
                <button class="zig-action ${primary && 'zig-action--primary'}">${text}</button>
            </div>`;
    }


    function renderUIState(uiState: UIState) {
        const derivedState = {
            isVisible: uiState.buttonType !== 'loading' && uiState.buttonType !== 'none',

            mainSubtitle: '&nbsp',

            get mainHint(): string {
                const actions: { [key: string]: string } = {
                    'login': translations.hint_Login,
                };

                return actions[uiState!.buttonType] || '';
            },

            get mainAction(): string {
                switch (uiState!.buttonType) {
                    case 'buy':
                        return translations.action_Buy;
                    case 'play':
                        return translations.action_Play;
                    case 'payin':
                        return translations.action_Payin;
                    case 'login':
                        return translations.action_Login;
                    case 'unplayed':
                        return translations.action_Resume;
                    case 'voucher':
                        return translations.action_Voucher;
                    default:
                        return translations.action_Buy;
                }
            },

            get discountedTicketPrice(): IMoneyAmount | undefined {
                const normal = uiState.normalTicketPrice;
                const discounted = uiState.discountedTicketPrice;
                return discounted != null && !discounted.equalTo(normal) ? discounted : undefined;
            },
        };

        if (!derivedState.isVisible)
            return '';

        const html: string[] = [];
        const output = html.push.bind(html);

        if (uiState.allowFreeGame) {
            output(ZigTitle('demo', translations.demo_FreePlay));
            output(ZigSubtitle('demo', translations.demo_NoPayout));
            output(ZigActionContainer('demo',
                ZigAction(false, translations.demo_Action)));
        } else {
            output(ZigTitle('demo', translations.demo_HintNoFree));
            output(ZigSubtitle('demo'));
            output(ZigActionContainer('demo',
                `<div class="zig-hint">${translations.demo_HintPlayAgain}</div>`));
        }

        if (uiState.buttonType === 'unplayed') {
            output(ZigTitle('main', translations.main_Unplayed));

        } else {
            output(ZigTitle('main', translations.main_TicketPrice + ' '
                + ZigPrice(uiState.normalTicketPrice, derivedState.discountedTicketPrice)));
        }

        output(ZigSubtitle('main', derivedState.mainSubtitle));

        const mainHint = derivedState.mainHint ? `<div class="zig-hint">${derivedState.mainHint}</div>` : '';
        output(ZigActionContainer('main',
            mainHint + ' ' + ZigAction(true, derivedState.mainAction)));

        if (belowGameHint) {
            output(ZigDescription(belowGameHint));
        }

        return `<div class="zig-overlay">${html.join('')}</div>`;
    }

    let actionTarget: GameActions | null = null;

    target.addEventListener('click', event => {
        const target = event.target as HTMLElement;
        if (!actionTarget || !target.classList.contains('zig-action')) {
            return;
        }

        event.preventDefault();

        const primaryAction = target.classList.contains('zig-action--primary');

        if (primaryAction) {
            void actionTarget.playGame();
        } else {
            void actionTarget.playDemoGame();
        }
    });

    return (uiState, game) => {
        actionTarget = game;

        logger.info('Got uiState update, updating overlay now.');
        logger.debug('uiState is now', uiState);

        target.innerHTML = renderUIState(uiState);
    };
}

export interface OverlayConfig {
    translations: Translations;
    belowGameHint?: string;
}

export type UpdateUIStateFn = (uiState: UIState, game: GameActions) => void;

export function installOverlay(target: Element, config: Partial<OverlayConfig> = {}): UpdateUIStateFn {
    logger.info('Installing overlay');

    injectStyle(css, 'zigOverlayStyle');

    const container = document.createElement('div');
    target.append(container);

    const translations = config.translations || new Translations();
    const belowGameHint = config.belowGameHint || '';
    return renderUIState(container, translations, belowGameHint);
}
