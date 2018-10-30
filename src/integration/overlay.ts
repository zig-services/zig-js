import {Currency, IMoneyAmount} from '../common/domain';
import {UIState} from './connector';
import {Game} from './webpage';
import Vue, {ComputedOptions} from 'vue';
import {Logger} from '../common/logging';
import {injectStyle} from '../common/dom';

const logger = Logger.get('zig.Overlay');

function currencySymbol(currency: Currency): string {
    return ({EUR: '€'} as any)[currency] || currency;
}

export class Translations {
    readonly action_Play: string = 'Play';
    readonly action_Buy: string = 'Buy & Play';
    readonly action_Resume: string = 'Resume';
    readonly action_Login: string = 'Login';
    readonly action_Payin: string = 'Payin';
    readonly action_Voucher: string = 'Play for free';

    readonly main_TicketPrice: string = 'Price per game: ';

    readonly hint_Login: string = 'Login first';

    readonly demo_FreePlay: string = 'Free try';
    readonly demo_NoPayout: string = 'No payout!';
    readonly demo_Action: string = 'Play for free';
    readonly demo_HintNoFree: string = 'That was fun!';
    readonly demo_HintPlayAgain: string = 'Play a real game';

    public formatMoneyAmount(amount: IMoneyAmount): string {
        const formatted = amount.amountInMajor.toFixed(2).replace(/,/, '.');
        return `${formatted} ${currencySymbol(amount.currency)}`;
    }
}

export class Translations_en_GB extends Translations {
}

export class Translations_de_DE extends Translations {
    readonly action_Play: string = 'Spielen';
    readonly action_Buy: string = 'Kaufen & Spielen';
    readonly action_Resume: string = 'Fortsetzen';
    readonly action_Login: string = 'Anmelden';
    readonly action_Payin: string = 'Einzahlen';
    readonly action_Voucher: string = 'Gutschein einlösen';

    readonly main_TicketPrice: string = 'Preis pro Spiel: ';

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

Vue.component('ZigTitle', {
    props: ['type'],
    template: `<div :class="['zig-overlay__title', 'zig-overlay__title--'+type]"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigSubtitle', {
    props: ['type'],
    template: `<div :class="['zig-overlay__subtitle', 'zig-overlay__subtitle--'+type]"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigActionContainer', {
    props: ['type'],
    template: `<div :class="['zig-overlay__action', 'zig-overlay__action--'+type]"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigDescription', {
    template: `<div class="zig-overlay__description"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigPrice', {
    template: `
        <span v-if="discounted != null">
            <span class="zig-price zig-price--strike">{{ amount }}</span>
            <span class="zig-price zig-price--discounted">{{ discounted}}</span>
        </span>
        <span v-else>
            <span class="zig-price">{{ amount }}</span>
        </span>
    `,

    props: ['amount', 'discounted'],
});

Vue.component('ZigAction', {
    template: `
        <div class="zig-action-wrapper">
            <button @click="buttonClicked()" :class="{'zig-action': true, 'zig-action--primary': primary}" v-html="text"></button>
        </div>
    `,

    props: {
        primary: {
            type: Boolean,
            required: false,
        },

        text: {
            type: String,
            required: true,
        },
    },

    methods: {
        buttonClicked() {
            this.$emit('action');
        },
    },
});

Vue.component('Overlay', {
    props: {
        translations: {
            type: Translations,
            required: true,
        },
    },
    template: `
        <div class="zig-overlay" v-if="isVisible">
            <template>
                <template v-if="uiState.allowFreeGame">
                    <ZigTitle type="demo">{{ translations.demo_FreePlay }}</ZigTitle>
                    <ZigSubtitle type="demo">{{ translations.demo_NoPayout }}</ZigSubtitle>
                    <ZigActionContainer type="demo">
                        <ZigAction type="demo" @action="demoClicked()" :primary="false" :text="translations.demo_Action"/>
                    </ZigActionContainer>
                </template>
                
                <template v-else>
                    <ZigTitle type="demo">{{ translations.demo_HintNoFree }}</ZigTitle>
                    <ZigSubtitle type="demo"/>
                    <ZigActionContainer type="demo">
                        <div class="zig-hint">{{ translations.demo_HintPlayAgain }}</div>
                    </ZigActionContainer>
                </template>
            </template>
            
            <template>
                <ZigTitle type="main">
                    {{ translations.main_TicketPrice }}
                    <ZigPrice
                        :amount="ticketPriceFormatted"
                        :discounted="nonZeroDiscountedPriceFormatted"/>
                </ZigTitle>
                
                <ZigSubtitle type="main" v-html="mainSubtitle"></ZigSubtitle>
                
                <ZigActionContainer type="main">
                    <div class="zig-hint" v-html="mainHint" v-if="mainHint"/>
                    <ZigAction @action="handleMainAction" :primary="true" :text="mainAction"/>
                </ZigActionContainer>    
            </template>
            
            <ZigDescription>Here we have some text.</ZigDescription>
        </div>`,

    data() {
        return {
            uiState: undefined as UIState | undefined,
        };
    },

    computed: {
        game: localValue<Game | null>(null),

        isVisible(): boolean {
            return !!this.uiState && this.uiState.buttonType !== 'loading' && this.uiState.buttonType !== 'none';
        },

        mainSubtitle(): string {
            return '&nbsp;';
        },

        mainHint(): string {
            const actions: { [key: string]: string } = {
                'login': this.translations.hint_Login,
            };

            return actions[this.uiState!.buttonType] || '';
        },

        mainAction(): string {
            const actions: { [key: string]: string } = {
                'buy': this.translations.action_Buy,
                'play': this.translations.action_Play,
                'payin': this.translations.action_Payin,
                'login': this.translations.action_Login,
                'resume': this.translations.action_Resume,
                'voucher': this.translations.action_Voucher,
            };

            return actions[this.uiState!.buttonType] || this.translations.action_Buy;
        },

        ticketPriceFormatted(): string | null {
            return this.uiState
                ? this.translations.formatMoneyAmount(this.uiState.normalTicketPrice)
                : null;
        },

        nonZeroDiscountedPriceFormatted(): string | null {
            if (!this.uiState
                || !this.uiState.discountedTicketPrice
                || this.uiState.discountedTicketPrice.equalTo(this.uiState.normalTicketPrice)) {

                return null;
            }

            return this.translations.formatMoneyAmount(this.uiState.discountedTicketPrice);
        },
    },

    methods: {
        updateUIState(uiState: UIState, game: Game): void {
            this.uiState = uiState;
            this.game = game;
        },

        playClicked(): void {
            void this.game!.playGame();
        },

        demoClicked(): void {
            void this.game!.playDemoGame();
        },

        loginClicked(): void {
        },

        handleMainAction(): void {
            this.playClicked();
        },
    },
});

let zigStylesInjected = false;

interface OverlayConfig {
    translations: Translations;
}

export function installOverlay(target: Element, config: Partial<OverlayConfig> = {}): (uiState: UIState, game: Game) => void {
    let overlay: any;

    let latestGame: Game;
    let latestUIState: UIState;

    if (!zigStylesInjected) {
        injectStyle(css);
        zigStylesInjected = true;
    }

    const container = document.createElement('div');
    target.append(container);

    new Vue({
        el: container,
        template: `<Overlay ref='overlay' :translations="translations"/>`,

        data: {
            translations: Object.freeze(config.translations || new Translations()),
        },

        mounted(): void {
            logger.info('Overlay vue instance mounted.');

            overlay = this.$refs.overlay;

            // we already got an update, dispatch it now.
            if (latestGame && latestUIState) {
                logger.info('Dispatching first uiState change');
                overlay.updateUIState(latestUIState, latestGame);
            }
        },
    });

    return (uiState, game) => {
        if (overlay) {
            logger.debug('Dispatching uiState update:', {...uiState});
            overlay.updateUIState(uiState, game);
        } else {
            latestGame = game;
            latestUIState = uiState;
        }
    };
}

function propertyType<T>(): (() => T) | undefined {
    return undefined;
}

function localValue<T>(defaultValue: T): ComputedOptions<T> {
    const name = '_prop_' + Date.now() + '_' + Math.random();

    let value: T = defaultValue;
    return {
        get(): T {
            return value;
        },

        set(newValue: T) {
            value = newValue;
        },
    };
}
