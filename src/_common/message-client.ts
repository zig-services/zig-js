import {IGameSettings, logger, TicketId, TicketNumber} from "./common";
import {Request, Result, WithCID} from "./request";

export type CommandType = string

export type IMessage = string | { command: string }

export interface IError {
    type: string;
    title: string;
    status?: number;
    details?: string;
}

const log = logger("[zig-msg]");

export class MessageClient {
    private readonly eventHandler: (ev: MessageEvent) => void;
    private handlers: ((msg: IMessage) => void)[] = [];

    constructor(private readonly partnerWindow: Window) {
        // register event handler for receiving messages
        this.eventHandler = ev => this.handleEvent(ev);
        window.addEventListener("message", this.eventHandler);
    }

    /**
     * Unregisters the global event handler on the window object.
     */
    public close(): void {
        window.removeEventListener("message", this.eventHandler);
    }

    public send(message: IMessage): void {
        if (message == null) {
            return;
        }

        const messageType = typeof message === 'string' ? message : message.command;

        // remove "command" field if it is an error message.
        if (typeof message === "object" && message.command === "error") {
            delete message["command"];
        }

        log.info(`Send message of type ${messageType}:`, message);
        this.partnerWindow.postMessage(message, "*");
    }

    public sendError(err: IError | Error | any): void {
        const errorValue = toErrorValue(err);
        if (errorValue != null) {
            log.info("Sending error value:", errorValue);
            this.partnerWindow.postMessage(errorValue, "*");
        }
    }

    public register(handler: (message: IMessage) => void) {
        this.handlers.push(handler);
    }

    public unregister(handler: (message: IMessage) => void) {
        this.handlers = this.handlers.filter(it => handler !== it);
    }

    private handleEvent(ev: MessageEvent): void {
        try {
            if (ev.source !== this.partnerWindow) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error("do not optimize away the try/catch.");
            }
        } catch (err) {
            // probably internet explorer 11. This browser can not compare window objects
            // of different or old iframes. Instead of just comparing the object id/memory address
            // of the objects (as it is the case with all the other js objects), the internet
            // explorer prefers to throw an exception.
            return;
        }

        // check if data is valid
        const data = ev.data;
        if (data == null) {
            return;
        }

        // maybe an error?
        if (typeof data.type === "string" && typeof data.title === "string" && typeof data.command === "undefined") {
            data.command = "error";
        }

        // call handlers with message
        const message = data as IMessage;
        this.handlers.forEach(handler => {
            try {
                handler(message);
            } catch (err) {
                log.warn(`Error in handling message ${message}:`, err);
            }
        });
    }
}

/**
 * Tries to make sense of the response of a request.
 */
function toErrorValue(err: any): IError | null {
    if (err == null) {
        return null;
    }

    if (err.type && err.title && err.status !== undefined && err.details !== undefined) {
        return err;
    }

    if (typeof err.type === "string" && typeof err.message === "string") {
        return {
            type: "urn:x-tipp24:remote-client-error",
            title: "Remote error",
            status: err.type,
            details: err.message,
        }
    }

    const responseText = err.responseText || err.body;

    if (typeof responseText === "string") {
        try {
            const parsed = JSON.parse(responseText);
            if (parsed.error && parsed.status) {
                return {
                    type: "urn:x-tipp24:remote-client-error",
                    title: "Remote error",
                    details: parsed.error,
                    status: parsed.status
                }
            }

            // looks like a properly formatted error
            if (parsed.type && parsed.title && parsed.details) {
                return <IError> parsed;
            }
        } catch {
            // probably json decoding error, just continue with a default error.
        }
    }

    return {
        type: "urn:x-tipp24:remote-client-error",
        title: "Remote error",
        status: 500,
        details: err.toString(),
    }
}

export interface BaseMessage {
    command: CommandType;
    game: string;
}

export interface ErrorMessage extends BaseMessage, IError {
    command: "error";
}

export interface GameLoadedMessage extends BaseMessage {
    command: "gameLoaded";
    inGamePurchase?: boolean;
}

export interface PlayGameMessage extends BaseMessage {
    command: "playGame";
}

export interface PlayDemoGameMessage extends BaseMessage {
    command: "playDemoGame";
}

export interface GameStartedMessage extends BaseMessage {
    command: "gameStarted";
    ticketId: TicketId;
    ticketNumber: TicketId;
    alreadySettled: boolean;
}

export interface GameFinishedMessage extends BaseMessage {
    command: "gameFinished";
}

export interface TicketSettledMessage extends BaseMessage {
    command: "ticketSettled";
}

export interface RequestGameInputMessage extends BaseMessage {
    command: "requestGameInput";
}

export interface RequestStartGameMessage extends BaseMessage {
    command: "requestStartGame";
}

export interface GameInputMessage extends BaseMessage {
    command: "gameInput";
    input: any;
}

export interface UpdateNicknameMessage extends BaseMessage {
    command: "updateNickname";
    nickname: string | undefined;
}

export interface UpdateGameSettingsMessage extends BaseMessage {
    command: "updateGameSettings";
    gameSettings: IGameSettings;
}

export interface NewVoucherMessage extends BaseMessage {
    command: "newVoucher";
    voucherValueInMinor: number;
    discountInMinor?: number;

    /**
     * @deprecated Use voucherValueInMinor now.
     */
    voucherValueInCents: number;
}

export interface TicketPriceChangedMessage extends BaseMessage {
    command: "ticketPriceChanged";
    priceInMinor: number;
    rowCount: number;

    /**
     * @deprecated use priceInMinor now.
     */
    price: number;
}

export interface UpdateGameHeightMessage extends BaseMessage {
    command: "updateGameHeight";
    height: number;
}


export interface PrepareGameMessage extends BaseMessage {
    command: "prepareGame";
    demo: boolean;
}

export interface ResumeGameMessage extends BaseMessage {
    command: "resumeGame";
    resume: boolean;
}

export interface CancelGameStartRequestMessage extends BaseMessage {
    command: "cancelRequestStartGame";
}

export interface BuyMessage extends BaseMessage {
    command: "buy";
    betFactor?: number;
}

export interface GotoGameMessage extends BaseMessage {
    command: "gotoGame";
    destinationGame: string;
}

export interface GotoLeagueTableMessage extends BaseMessage {
    command: "gotoLeagueTable";
}

export interface TicketActivatedEvent extends BaseMessage {
    command: "ticketActivated";
}

export interface UpdateLeagueTableMessage extends BaseMessage {
    command: "updateTable";
    response: {
        leagueTable: any;
    }
}

export interface FetchRequestMessage extends BaseMessage {
    command: "zig.XMLHttpRequest.request";
    request: WithCID<Request>;
}

export interface FetchResultMessage extends BaseMessage {
    command: "zig.XMLHttpRequest.result";
    result: WithCID<Result>;
}

export interface CommandMessageTypes {
    playGame: PlayGameMessage;
    playDemoGame: PlayDemoGameMessage;
    gameLoaded: GameLoadedMessage;
    gameStarted: GameStartedMessage;
    gameFinished: GameFinishedMessage;
    gameInput: GameInputMessage;
    ticketSettled: TicketSettledMessage;
    requestGameInput: RequestGameInputMessage;
    requestStartGame: RequestStartGameMessage;
    ticketPriceChanged: TicketPriceChangedMessage;
    newVoucher: NewVoucherMessage;
    updateNickname: UpdateNicknameMessage;
    updateGameSettings: UpdateGameSettingsMessage;
    updateGameHeight: UpdateGameHeightMessage;
    prepareGame: PrepareGameMessage;
    resumeGame: ResumeGameMessage;
    cancelRequestStartGame: CancelGameStartRequestMessage;
    buy: BuyMessage;
    error: ErrorMessage;

    "zig.XMLHttpRequest.request": FetchRequestMessage,
    "zig.XMLHttpRequest.result": FetchResultMessage,
}

export type CommandMessageHandlers = {
    [K in keyof CommandMessageTypes]: (event: CommandMessageTypes[K]) => void
}

export type Command = keyof CommandMessageTypes;

export type Unregister = () => void;
export type GenericHandler = (msg: any) => void;

export class MessageDispatcher {
    private readonly handlers: { [command: string]: GenericHandler[] } = {};

    constructor(public readonly game: string) {
    }

    /**
     * Observes the given message client. You need to call the returned
     * unregister function to disconnect the MessageDispatcher from the MessageClient
     */
    public observe(messageClient: MessageClient): Unregister {
        const handler = (message: IMessage) => this.dispatch(message);
        messageClient.register(handler);
        return () => messageClient.unregister(handler);
    }

    public register<K extends Command>(type: K, handler: (msg: CommandMessageTypes[K]) => void): Unregister {
        log.debug(`Register handler for messages of type ${type}`);

        this.handlers[type] = (this.handlers[type] || []).concat(handler);
        return () => this.unregister(type, handler);
    }

    public registerGeneric(handler: Partial<CommandMessageHandlers>): Unregister {
        const unregister: Unregister[] = Object
            .keys(handler)
            .map(key => this.register(key as Command, handler[key]));

        return () => unregister.forEach(Function.call);
    }

    private unregister<K extends Command>(type: K, handler: (msg: CommandMessageTypes[K]) => void): void {
        log.debug(`Unregister handler for messages of type ${type}`);
        this.handlers[type] = (this.handlers[type] || []).filter(it => it !== handler);
    }

    public dispatch(msg: IMessage): void {
        const message: BaseMessage = this.convertToMessage(msg);

        // get the handlers for this message type.
        const handlers = this.handlers[message.command] || [];

        if (handlers.length === 0) {
            log.warn(`No handler for command ${message.command} registered.`);
            return;
        }

        // and dispatch it to all handlers.
        handlers.forEach(handler => {
            try {
                handler(message);
            } catch (err) {
                log.warn("Error calling handler: ", err);
            }
        })
    }

    /**
     * Convert the given message object that was received from another frame
     * into the a BaseMessage representation.
     * This also patches renamed/missing fields.
     */
    private convertToMessage(message: IMessage): BaseMessage {
        const converted = typeof message === "string"
            ? {command: message as string, game: this.game}
            : Object.assign({}, {game: this.game}, message);


        /**
         * If 'missing' is set to undefined, but 'fallback' is defined in the object,
         * then 'missing' will be set to the result of 'conv(fallback)'.
         */
        function fallback<T extends BaseMessage, K1 extends keyof T, K2 extends keyof T>(
            e: T, missing: K1, fallback: K2, conv: (value: T[K2]) => T[K1]) {

            if (typeof e[missing] === "undefined" && typeof e[fallback] !== "undefined") {
                e[missing] = conv(e[fallback]);
            }
        }

        fallback(converted as TicketPriceChangedMessage, `priceInMinor`, "price", price => 100 * price);
        fallback(converted as TicketPriceChangedMessage, `price`, "priceInMinor", priceInMinor => 0.01 * priceInMinor);

        fallback(converted as NewVoucherMessage, "voucherValueInCents", "voucherValueInMinor", v => v);
        fallback(converted as NewVoucherMessage, "voucherValueInMinor", "voucherValueInCents", v => v);

        return converted;
    }
}

export class MessageFactory extends MessageDispatcher {
    private readonly stopObserver: Unregister;

    constructor(protected readonly messageClient: MessageClient, game: string) {
        super(game);
        this.stopObserver = this.observe(messageClient);
    }

    protected send<T extends BaseMessage>(msg: T): void {
        this.messageClient.send(msg);
    }

    /**
     * Converts anything into some kind of error representation and sends that one
     * to the remote side.
     */
    public error(err: IError | Error | any): void {
        this.messageClient.sendError(err);
    }

    public close(): void {
        this.stopObserver();
    }
}

export class ParentMessageInterface extends MessageFactory {
    public playGame() {
        this.send<PlayGameMessage>({command: "playGame", game: this.game});
    }

    public playDemoGame() {
        this.send<PlayDemoGameMessage>({command: "playDemoGame", game: this.game});
    }

    public gameInput(input: any) {
        this.send<GameInputMessage>({command: "gameInput", game: this.game, input});
    }

    public newVoucher(voucherValueInMinor: number, discountInMinor?: number) {
        this.send<NewVoucherMessage>({
            command: "newVoucher", game: this.game,
            voucherValueInCents: voucherValueInMinor,
            voucherValueInMinor,
            discountInMinor
        })
    }

    public updateNickname(nickname: string) {
        this.send<UpdateNicknameMessage>({
            command: "updateNickname", game: this.game,
            nickname,
        })
    }

    public prepareGame(demo: boolean = false) {
        this.send<PrepareGameMessage>({command: "prepareGame", game: this.game, demo})
    }

    public resumeGame(resume: boolean = true) {
        this.send<ResumeGameMessage>({command: "resumeGame", game: this.game, resume})
    }

    public cancelRequestStartGame() {
        this.send<CancelGameStartRequestMessage>({command: "cancelRequestStartGame", game: this.game})
    }

    public xhrResult(result: WithCID<Result>) {
        this.send<FetchResultMessage>({command: "zig.XMLHttpRequest.result", game: this.game, result})
    }
}

export class GameMessageInterface extends MessageFactory {
    public gameLoaded(inGamePurchase?: boolean) {
        this.send<GameLoadedMessage>({command: "gameLoaded", game: this.game, inGamePurchase: inGamePurchase});
    }

    public gameStarted(ticketId: TicketId, ticketNumber: TicketNumber, alreadySettled: boolean = false) {
        this.send<GameStartedMessage>({
            command: "gameStarted",
            game: this.game,
            ticketId,
            ticketNumber,
            alreadySettled,
        });
    }

    public gameFinished() {
        this.send<GameFinishedMessage>({command: "gameFinished", game: this.game});
    }

    public ticketSettled() {
        this.send<TicketSettledMessage>({command: "ticketSettled", game: this.game});
    }

    public requestGameInput() {
        this.send<RequestGameInputMessage>({command: "requestGameInput", game: this.game});
    }

    public requestStartGame() {
        this.send<RequestStartGameMessage>({command: "requestStartGame", game: this.game});
    }

    public ticketPriceChanged(rowCount: number, ticketPriceInMinor: number) {
        this.send<TicketPriceChangedMessage>({
            command: "ticketPriceChanged",
            game: this.game,
            price: 0.01 * ticketPriceInMinor,
            priceInMinor: ticketPriceInMinor,
            rowCount,
        })
    }

    public updateGameHeight(height: number) {
        this.send<UpdateGameHeightMessage>({command: "updateGameHeight", game: this.game, height})
    }

    public buy(betFactor?: number) {
        this.send<BuyMessage>({command: "buy", game: this.game, betFactor})
    }

    public gotoGame(destinationGame: string) {
        this.send<GotoGameMessage>({command: "gotoGame", game: this.game, destinationGame})
    }

    public gotoLeagueTable() {
        this.send<GotoLeagueTableMessage>({command: "gotoLeagueTable", game: this.game})
    }

    public updateTable(leagueTable: any) {
        const response = {leagueTable};
        this.send<UpdateLeagueTableMessage>({command: "updateTable", game: this.game, response})
    }

    public ticketActivated() {
        this.send<TicketActivatedEvent>({command: "ticketActivated", game: this.game})
    }

    public xhrRequest(request: WithCID<Request>) {
        this.send<FetchRequestMessage>({command: "zig.XMLHttpRequest.request", game: this.game, request})
    }

    public updateGameSettings(gameSettings: IGameSettings) {
        this.send<UpdateGameSettingsMessage>({command: "updateGameSettings", game: this.game, gameSettings})
    }
}
