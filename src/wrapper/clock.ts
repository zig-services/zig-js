class Clock {
    private timeTemplate: string = '00:00';
    private clockHandler: number;
    private target: HTMLElement;

    constructor(elem: HTMLElement) {
        this.target = elem;
        this.target.innerText = this.timeTemplate;
        const that = this;
        this.clockHandler = setInterval(function () {
            that.target.innerHTML = Clock.getTime();
        }, 1000);
    }

    static getTime(): string {
        const now = new Date();
        const hour = now.getHours();
        return `${hour >= 10 ? hour : '0' + hour}:${now.getMinutes()}`
    }

    public start() {
        const that = this;

    }

    public stop() {
        clearInterval(this.clockHandler);
    }

}
