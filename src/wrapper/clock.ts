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

    static


    public stop() {
        clearInterval(this.clockHandler);
    }

}
