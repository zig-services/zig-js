import Vue from 'vue';
import {Options, WinningClassOverride} from '../common/options';

Vue.component('DebugPage', {
    template: `
        <div>
            <div><label><input type="checkbox" v-model="devVersion"/>
                Enable dev version (only supported games)</label></div>
            
            <div><label><input type="checkbox" v-model="logging"/>
                Enable logging to console</label></div>
            
            <div><label><input type="checkbox" v-model="disableAudioContext"/>
                Disable AudioContext in Firefox 63+</label></div>
            
            <div><label><input type="checkbox" v-model="hasWinningClassOverride"/>
                Enable winning class override</label></div>
            
            <div><label><input type="text" v-model="localeOverride"/>
                Override the locale</label></div>
            
            <div v-if="hasWinningClassOverride">
                <div><label><input type="number" v-model.number="winningClassOverride.winningClass"/> winning class override</label></div>
                <div><label><input type="number" v-model.number="winningClassOverride.scenarioId"/> scenario id eoverride</label></div>
            </div>
        </div>
       `,

    data() {
        return {
            logging: Options.logging,
            devVersion: Options.version === '1-dev',
            hasWinningClassOverride: Options.winningClassOverride != null,
            winningClassOverride: Options.winningClassOverride,
            disableAudioContext: Options.disableAudioContext,
            localeOverride: Options.localeOverride,
        };
    },

    watch: {
        logging(newValue: boolean) {
            Options.logging = newValue;
        },

        devVersion(newValue: boolean) {
            Options.version = newValue ? '1-dev' : null;
        },

        disableAudioContext(newValue: boolean) {
            Options.disableAudioContext = newValue;
        },

        hasWinningClassOverride(newValue: boolean) {
            this.winningClassOverride = newValue ? {scenarioId: 0, winningClass: 0} : null;
        },

        localeOverride(newValue: string) {
            if (!newValue || newValue.trim() === '') {
                Options.localeOverride = null;
            } else {
                Options.localeOverride = newValue.trim();
            }
        },

        winningClassOverride: {
            deep: true,
            handler(newValue: WinningClassOverride) {
                Options.winningClassOverride = newValue;
            },
        },
    },
});

window.onload = () => {
    new Vue({
        el: '#page',
        template: `<DebugPage/>`,
    });
};
