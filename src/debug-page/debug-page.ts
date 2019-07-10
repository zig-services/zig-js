import {Options} from '../common/options';
import {defaultsToGameConfig, GameConfig} from '../common/config';

function applyOptions() {
    function setIfChanged(object: any, key: string, value: any) {
        if (object[key] !== value) {
            object[key] = value;
        }
    }

    setIfChanged(document.querySelector<HTMLInputElement>('#field_devVersion'),
        'checked', Options.version === '1-dev');

    setIfChanged(document.querySelector<HTMLInputElement>('#field_logging'),
        'checked', Options.logging);

    setIfChanged(document.querySelector<HTMLInputElement>('#field_disableAudioContext'),
        'checked', Options.disableAudioContext);

    setIfChanged(document.querySelector<HTMLInputElement>('#field_localeOverride'),
        'value', Options.localeOverride || '');

    setIfChanged(document.querySelector<HTMLInputElement>('#field_hasWinningClassOverride'),
        'checked', Options.winningClassOverride != null);

    setIfChanged(document.querySelector<HTMLInputElement>('#winningClassOverride')!.style,
        'display', Options.winningClassOverride ? 'block' : 'none');

    if (Options.winningClassOverride) {
        setIfChanged(document.querySelector<HTMLInputElement>('#field_winningClassOverride_WinningClass'),
            'valueAsNumber', Options.winningClassOverride.winningClass);

        setIfChanged(document.querySelector<HTMLInputElement>('#field_winningClassOverride_ScenarioId'),
            'valueAsNumber', Options.winningClassOverride.scenarioId);
    }

    setIfChanged(document.querySelector<HTMLInputElement>('#field_hasConfigOverride'),
        'checked', Options.configOverrideEnabled);

    setIfChanged(document.querySelector<HTMLInputElement>('#configOverride')!.style,
        'display', Options.configOverrideEnabled ? 'block' : 'none');

    if (Options.configOverride != null) {
        setIfChanged(document.querySelector<HTMLInputElement>('#field_configOverride'),
            'value', JSON.stringify(Options.configOverride, null, 2));
    }
}

window.addEventListener('DOMContentLoaded', function () {
    applyOptions();

    function handleChange(onChange: () => void): () => void {
        return () => {
            onChange();
            applyOptions();
        };
    }

    const fieldDevVersion = document.querySelector<HTMLInputElement>('#field_devVersion')!;
    fieldDevVersion.onchange = handleChange(() => Options.version = fieldDevVersion.checked ? '1-dev' : null);

    const fieldLogging = document.querySelector<HTMLInputElement>('#field_logging')!;
    fieldLogging.onchange = handleChange(() => Options.logging = fieldLogging.checked);

    const fieldDisableAC = document.querySelector<HTMLInputElement>('#field_disableAudioContext')!;
    fieldDisableAC.onchange = handleChange(() => Options.disableAudioContext = fieldDisableAC.checked);

    const fieldLocale = document.querySelector<HTMLInputElement>('#field_localeOverride')!;
    fieldLocale.onchange = handleChange(() => Options.localeOverride = fieldLocale.value || null);

    const wcOverride = document.querySelector<HTMLInputElement>('#field_hasWinningClassOverride')!;
    wcOverride.onchange = handleChange(() =>
        Options.winningClassOverride = wcOverride.checked ? {scenarioId: 0, winningClass: 0} : null);

    const wcOverride_WC = document.querySelector<HTMLInputElement>('#field_winningClassOverride_WinningClass')!;
    wcOverride_WC.onchange = handleChange(() =>
        Options.winningClassOverride = {...Options.winningClassOverride!, winningClass: wcOverride_WC.valueAsNumber});

    const wcOverride_SC = document.querySelector<HTMLInputElement>('#field_winningClassOverride_ScenarioId')!;
    wcOverride_SC.onchange = handleChange(() =>
        Options.winningClassOverride = {...Options.winningClassOverride!, scenarioId: wcOverride_SC.valueAsNumber});

    const configOverrideEnabled = document.querySelector<HTMLInputElement>('#field_hasConfigOverride')!;
    configOverrideEnabled.onchange = handleChange(() => {
            if (Options.configOverride == null) {
                Options.configOverride = defaultsToGameConfig({canonicalGameName: 'XXX'});
            }
            Options.configOverrideEnabled = configOverrideEnabled.checked;
        },
    );

    const configOverride = document.querySelector<HTMLInputElement>('#field_configOverride')!;
    configOverride.onchange = handleChange(() =>
        Options.configOverride = JSON.parse(configOverride.value || JSON.stringify(defaultsToGameConfig({canonicalGameName: 'XXX', isTestStage: true}), null, 2)));
});
