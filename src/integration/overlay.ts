import {IMoneyAmount} from '../common/domain';
import {UIState} from './connector';
import {Game} from './webpage';
import Vue, {ComputedOptions} from 'vue';
import {Logger} from '../common/logging';
import {injectStyle} from '../common/dom';

const logger = Logger.get('zig.Overlay');

Vue.filter('moneyAmount', (amount: IMoneyAmount) => {
    const major = amount.amountInMajor.toFixed(2);

    switch (amount.currency) {
        case 'EUR':
            return `${major.replace('.', ',')} €`;

        case 'GBP':
            return `£${major}`;

        default:
            return `${major} ${amount.currency}`;
    }
});

const Price = Vue.component('ZigPrice', {
    template: `
        <span v-if="hasDiscount">
            <span class="zig-price zig-price--strike">{{ amount|moneyAmount }}</span>
            <span class="zig-price zig-price--discounted">{{ discounted|moneyAmount}}</span>
        </span>
        <span v-else>
            <span class="zig-price">{{ amount|moneyAmount }}</span>
        </span>
    `,

    props: {
        amount: {
            type: propertyType<IMoneyAmount>(),
            required: true,
        },

        discounted: {
            type: propertyType<IMoneyAmount>(),
            required: false,
        },
    },

    computed: {
        hasDiscount(): boolean {
            return this.discounted != null && this.discounted.amountInMinor != this.amount.amountInMinor;
        },
    },
});

const ZigAction = Vue.component('ZigAction', {
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

.zig-overlay__demo-title {
    order: 0;
    flex-basis: 35%;
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

.zig-overlay__demo-subtitle {
    order: 2;
    flex-basis: 35%;
}

.zig-overlay__demo-action {
    order: 4;
    flex-basis: 35%;
}

.zig-overlay__main-title {
    order: 1;
    flex-basis: 65%;
    border-left: 1px solid white;
}

.zig-overlay__main-subtitle {
    order: 3;
    flex-basis: 65%;
    border-left: 1px solid white;
}

.zig-overlay__main-action {
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

Vue.component('ZigDemoTitle', {
    template: `<div class="zig-overlay__title zig-overlay__demo-title"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigDemoSubtitle', {
    template: `<div class="zig-overlay__subtitle zig-overlay__demo-subtitle"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigDemoAction', {
    template: `<div class="zig-overlay__action zig-overlay__demo-action"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigMainTitle', {
    template: `<div class="zig-overlay__title zig-overlay__main-title"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigMainSubtitle', {
    template: `<div class="zig-overlay__subtitle zig-overlay__main-subtitle"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigMainAction', {
    template: `<div class="zig-overlay__action zig-overlay__main-action"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigDescription', {
    template: `<div class="zig-overlay__description"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigTicketPrice', {
    template: `
        <ZigMainTitle>
            Preis pro Spiel:
            <ZigPrice
                :amount="uiState.normalTicketPrice"
                :discounted="uiState.discountedTicketPrice"/>
        </ZigMainTitle>`,

    props: {
        uiState: {
            type: propertyType<UIState>(),
            required: true,
        },
    },
});

const Overlay = Vue.component('Overlay', {
    template: `
        <div class="zig-overlay" v-if="isLoading">
            Loading&hellip;
        </div>
        
        <div class="zig-overlay" v-else-if="isVisible" :class="cssClasses">
            <template>
                <template v-if="uiState.allowFreeGame">
                    <ZigDemoTitle>Gratis testen</ZigDemoTitle>
                    <ZigDemoSubtitle>keine Gewinnmöglichkeit</ZigDemoSubtitle>
                    <ZigDemoAction>
                        <ZigAction @action="demoClicked()" :primary="false" text="Spiel gratis testen"/>
                    </ZigDemoAction>
                </template>
                <template v-else>
                    <ZigDemoTitle>Hat es Spaß gemacht?</ZigDemoTitle>
                    <ZigDemoSubtitle/>
                    <ZigDemoAction>
                        <div class="zig-hint">Spielen Sie noch eine Runde!</div>
                    </ZigDemoAction>
                </template>
            </template>
            
            <template>
                <ZigTicketPrice :uiState="uiState"/>
                <ZigMainSubtitle v-html="mainSubtitle"></ZigMainSubtitle>
                <ZigMainAction>
                    <div class="zig-hint" v-html="mainHint" v-if="mainHint"/>
                    <ZigAction @action="handleMainAction" :primary="true" :text="mainAction"/>
                </ZigMainAction>    
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
            return !!this.uiState && this.uiState.buttonType !== 'none';
        },

        isLoading(): boolean {
            return !this.uiState || this.uiState.buttonType === 'loading';
        },

        cssClasses(): any {
            return {};
        },

        mainSubtitle(): string {
            return '&nbsp;';
        },

        mainHint(): string {
            switch (this.uiState!.buttonType) {
                case 'login':
                    return 'Melden sie sich zun&auml;chst an';

                default:
                    return '';
            }
        },

        mainAction(): string {
            switch (this.uiState!.buttonType) {
                case 'buy':
                    return 'Bezahlen &amp; spielen';

                case 'login':
                    return 'Anmelden &amp; spielen';

                default:
                    return '';
            }
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

export function installOverlay(target: Element): (uiState: UIState, game: Game) => void {
    let overlay: any;

    let latestGame: Game;
    let latestUIState: UIState;

    if (!zigStylesInjected) {
        injectStyle(css);
        zigStylesInjected = true;
    }

    const container = document.createElement("div");
    target.append(container);

    new Vue({
        el: container,
        template: `<Overlay ref='overlay'/>`,

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
