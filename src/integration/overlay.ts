import {IMoneyAmount} from '../_common/domain';
import {UIState} from './connector';
import {Game} from './webpage';
import Vue, {ComputedOptions} from 'vue';
import {Logger} from '../_common/logging';
import {injectStyle} from '../_common/dom';

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
        <button @click="buttonClicked()" :classes="{'zig-action': true, 'zig-action--primary': primary}">{{ text }}</button>
    `,

    props: {
        primary: {
            type: propertyType<boolean>(),
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
}

.zig-overlay > * {
    display: block;
}

.zig-overlay__demo-title {
    order: 0;
    flex-basis: 35%;
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
    flex-grow: 1;
}

.zig-overlay__main-subtitle {
    order: 3;
    flex-grow: 1;
}

.zig-overlay__main-action {
    order: 5;
    flex-grow: 1;
}

`;

Vue.component('ZigDemoTitle', {
    template: `<div class="zig-overlay__demo-title"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigDemoSubtitle', {
    template: `<div class="zig-overlay__demo-subtitle"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigDemoAction', {
    template: `<div class="zig-overlay__demo-action"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigMainTitle', {
    template: `<div class="zig-overlay__main-title"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigMainSubtitle', {
    template: `<div class="zig-overlay__main-subtitle"><slot>&nbsp;</slot></div>`,
});

Vue.component('ZigMainAction', {
    template: `<div class="zig-overlay__main-action"><slot>&nbsp;</slot></div>`,
});

const Overlay = Vue.component('Overlay', {
    template: `
        <div class="zig-overlay" v-if="isLoading">
            Loading&hellip;
        </div>
        
        <div class="zig-overlay" v-else-if="isVisible" :class="cssClasses">
            <template v-if="uiState.allowFreeGame">
                <template slot="title">Gratis testen</template>
                <template slot="subtitle">keine Gewinnmöglichkeit</template>
                <template slot="action">
                    <ZigAction @action="demoClicked()" primary="false" text="Spiel gratis testen"/>
                </template>
            </template>
            <template v-else>
                <template slot="title">Hat es Spaß gemacht?</template>
                <template slot="subtitle">&nbsp;</template>
                <template slot="action">
                    <div class="zig-hint">Spielen Sie noch eine Runde!</div>
                </template>
            </template>
        
            <ZigMainAction v-if="mainAction.login" type="main">
                <template slot="title">
                    Preis pro Spiel:
                    <ZigPrice
                        :amount="uiState.normalTicketPrice"
                        :discounted="uiState.discountedTicketPrice"/>
                </template>
        
                <ZigAction slot="action"
                    @action="loginClicked()" primary="true" text="Anmelden"/>
            </ZigMainAction>
        
            <ZigMainAction v-else type="main">
                <template slot="title">
                    Preis pro Spiel:
                    <ZigPrice
                        :amount="uiState.normalTicketPrice"
                        :discounted="uiState.discountedTicketPrice"/>
                </template>
        
                <ZigAction slot="action"
                    v-if="mainAction.payin"
                    @action="playClicked()" primary="true" text="Einzahlen"/>
        
                <ZigAction slot="action"
                    v-else-if="mainAction.buy"
                    @action="playClicked()" primary="true" text="Kaufen &amp; spielen"/>
            </ZigMainAction>
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

        mainAction(): any {
            return {[this.uiState!.buttonType]: true};
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
    },
});

let zigStylesInjected = false;

export function createOverlay(target: Element): (uiState: UIState, game: Game) => void {
    let overlay: any;

    let latestGame: Game;
    let latestUIState: UIState;

    if (!zigStylesInjected) {
        injectStyle(css);
        zigStylesInjected = true;
    }

    new Vue({
        el: target,
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
