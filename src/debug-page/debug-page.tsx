import * as React from "react";
import {ReactNode} from "react";
import * as ReactDOM from "react-dom";
import {Options} from "../_common/options";
import {onDOMLoad} from "../_common/events";

interface WinningClassOverrideState {
    scenario: number;
    winningClass: number;
}

class WinningClassOverride extends React.Component<{}, WinningClassOverrideState> {
    constructor(props: {}) {
        super(props);

        const override = Options.winningClassOverride || {winningClass: 0, scenarioId: 0};
        this.state = {
            scenario: override.scenarioId,
            winningClass: override.winningClass,
        }
    }

    private update() {
        Options.winningClassOverride = {
            scenarioId: this.state.scenario,
            winningClass: this.state.winningClass,
        };
    }

    async setState(state: any): Promise<any> {
        return new Promise(resolve => super.setState(state, resolve))
    }

    private async handleWinningClassChange(winningClass: number) {
        await this.setState({winningClass});
        this.update();
    }

    private async handleScenarioChange(scenario: number) {
        await this.setState({scenario});
        this.update();
    }

    render(): ReactNode {
        return <div>
            <label>
                <input type="number" min="0" defaultValue={this.state.winningClass.toString()}
                       onChange={ev => this.handleWinningClassChange(ev.target.valueAsNumber)}/>

                Winning class
            </label>
            <label>
                <input type="number" min="0" defaultValue={this.state.scenario.toString()}
                       onChange={ev => this.handleScenarioChange(ev.target.valueAsNumber)}/>

                Scenario id
            </label>
        </div>
    }
}


interface VersionCheckboxState {
    devVersion: boolean;
    logging: boolean;
    wcOverride: boolean;
}

class OptionsForm extends React.Component<{}, VersionCheckboxState> {
    constructor(props: {}) {
        super(props);

        this.state = {
            devVersion: Options.version === "dev",
            logging: Options.logging,
            wcOverride: Options.winningClassOverride != null,
        };
    }

    handleVersionChange(devVersion: boolean): void {
        Options.version = devVersion ? "dev" : "latest";
        this.setState({devVersion});
    }

    handleLoggingChange(logging: boolean): void {
        Options.logging = logging;
        this.setState({logging});
    }

    private handleOverrideWinningClassChange(enabled: boolean) {
        this.setState({wcOverride: enabled});

        if (!enabled) {
            Options.winningClassOverride = null;
        }
    }

    render(): ReactNode {
        return (
            <form>
                <label>
                    <input type="checkbox" defaultChecked={this.state.devVersion}
                           onChange={() => this.handleVersionChange(!this.state.devVersion)}/>
                    Override script version with 'dev'
                </label>

                <label>
                    <input type="checkbox" defaultChecked={this.state.logging}
                           onChange={() => this.handleLoggingChange(!this.state.logging)}/>
                    Enable logging to console
                </label>


                <label>
                    <input type="checkbox" defaultChecked={this.state.wcOverride}
                           onChange={e => this.handleOverrideWinningClassChange(e.target.checked)}/>
                    Enable winning class/scenario override
                </label>

                {this.state.wcOverride ? <WinningClassOverride/> : ""}
            </form>);
    }
}

onDOMLoad(() => {
    ReactDOM.render(
        <OptionsForm/>,
        document.querySelector("#page")
    );
});
