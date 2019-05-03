import {GameSettings} from './config';
import {Request, Result, WithCID} from './request';
import {IError, TicketId, TicketNumber} from './domain';
import {Logger} from './logging';
import {deepFreezeClone} from './common';

export type CommandType = string

export type Message = string | { command: string }

const log = Logger.get('zig.Messages');

export class MessageClient {
    private readonly boundHandleEvent: (ev: MessageEvent) => void;
    private readonly handlers: ((msg: Message) => void)[] = [];

    constructor(private readonly partnerWindow: Window) {
        // register event handler for receiving messages
        this.boundHandleEvent = (ev: MessageEvent) => this.handleEvent(ev);
        window.addEventListener('message', this.boundHandleEvent);
    }

    /**
     * Unregisters the global event handler on the window object.
     */
    public close(): void {
        window.removeEventListener('message', this.boundHandleEvent);
    }

    /**
     * Sends a message. A message can be either a string or an object containing
     * a `command` field. Normally you don't need to use this method directly. Use the
     * specialized methods on `ParentMessageInterface` or `GameMessageInterface`
     * to send game messages.
     */
    public send(message: Message): void {
        if (message == null) {
            return;
        }

        const messageType = typeof message === 'string' ? message : message.command;

        // remove "command" field if it is an error message.
        if (typeof message === 'object' && message.command === 'error') {
            delete message['command'];
        }

        log.info(`Send message of type ${messageType}:`, message);
        this.partnerWindow.postMessage(message, '*');
    }

    /**
     * Sends an error using this MessageClient. The error value can be any value and
     * will be converted into an error message automatically. E.g. you can pass a
     * failed XMLHttpRequest, its body, or any caught exception to this method.
     */
    public sendError(err: IError | Error | any): void {
        const errorValue = toErrorValue(err);
        if (errorValue != null) {
            log.info('Sending error value:', errorValue);
            this.partnerWindow.postMessage(errorValue, '*');
        }
    }

    /**
     * Registers an event handler.
     */
    public register(handler: (message: Message) => void): Unregister {
        this.handlers.push(handler);
        return () => this.unregister(handler);
    }

    /**
     * Removes an event handler from this message client instance.
     */
    private unregister(handler: (message: Message) => void): void {
        const idx = this.handlers.indexOf(handler);
        if (idx >= 0) {
            // remove the handler from the list.
            this.handlers.splice(idx, 1);
        }
    }

    protected handleEvent(ev: MessageEvent): void {
        try {
            if (ev.source !== this.partnerWindow) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error('do not optimize away the try/catch.');
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

        // maybe an error? Need to patch legacy messages here.
        if (typeof data.type === 'string' && typeof data.title === 'string' && typeof data.command === 'undefined') {
            data.command = 'error';
        }

        // call handlers with message
        const message = data as Message;
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
 * Converts any non null object into an error. This tries to make sense of the most common
 * normal error formats we have. If you pass null, this method will also return null.
 */
export function toErrorValue(inputValue: null): null;
export function toErrorValue(inputValue: any): IError;
export function toErrorValue(inputValue: any): IError | null {
    if (inputValue == null) {
        return null;
    }

    let err: any = inputValue;

    // try to parse an error response text
    const responseText = (err.responseText || err.body || {}) as any;
    if (typeof responseText === 'string') {
        // parse as json or use the response text directly, if parsing fails.
        err = tryParseJSON(responseText) || responseText;
    }

    return deepFreezeClone<IError>({
        // expand all properties into the target object and overwrite them later with
        // the error objects.
        ...(typeof err === 'object' ? err : {}),

        // if we have a valid urn type, we use that one as the resulting error type.
        type: guessErrorType(inputValue.type || err.type),

        // Find a http status code, fall back to 500 if we dont have one.
        status: parseInt(inputValue.statusCode || inputValue.status || err.status, 10) || 500,

        // Use an existing 'title' attribute if available.
        title: convertToString(err.title, inputValue.title, 'Remote error'),

        // And try to get the details from some common places.
        details: convertToString(err.details, err.message, err.error, err, inputValue),
    });
}

/**
 * Guesses the urn error code based on the input type value. If the input value
 * is a string starting with "urn:", it will be used as the result, if not,
 * a generic default value will be used.
 */
function guessErrorType(type: any | null): string {
    // noinspection SuspiciousTypeOfGuard
    if (typeof type === 'string' && type.match(/^urn:/)) {
        return type;
    }

    return 'urn:x-tipp24:remote-client-error';
}

/**
 * Iterates over the arguments and converts the first not-null argument to a string.
 */
function convertToString(...values: (any | null)[]): string {
    for (const value of values) {
        if (value == null) {
            continue;
        }

        // use string directly
        // noinspection SuspiciousTypeOfGuard
        if (typeof value === 'string') {
            return value;
        }

        // convert numerics to string
        // noinspection SuspiciousTypeOfGuard
        if (typeof value === 'number') {
            return value.toString();
        }

        // try to convert object to a json string.
        try {
            return JSON.stringify(value);
        } catch {
        }
    }

    return 'unknown';
}

/**
 * Try to parse the given string as json. If json parsing fails,
 * this method will return 'null'.
 */
function tryParseJSON(input: string): object | null {
    try {
        return JSON.parse(input);
    } catch {
        return null;
    }
}

export interface BaseMessage {
    readonly command: CommandType;
    readonly game: string;
}

export interface ErrorMessage extends BaseMessage, IError {
    readonly command: 'error';
}

export interface GameLoadedMessage extends BaseMessage {
    readonly command: 'gameLoaded';
    readonly inGamePurchase?: boolean;
}

export interface PlayGameMessage extends BaseMessage {
    readonly command: 'playGame';
}

export interface PlayDemoGameMessage extends BaseMessage {
    readonly command: 'playDemoGame';
}

export interface GameStartedMessage extends BaseMessage {
    readonly command: 'gameStarted';
    readonly ticketId: TicketId;
    readonly ticketNumber: TicketNumber;

    /**
     * some legacy games send the ticket id with the wrong name.
     * Please use ticketId.
     * @deprecated
     */
    readonly ticketID: TicketId;
}

export interface GameFinishedMessage extends BaseMessage {
    readonly command: 'gameFinished';
}

export interface TicketSettledMessage extends BaseMessage {
    readonly command: 'ticketSettled';
}

export interface RequestGameInputMessage extends BaseMessage {
    readonly command: 'requestGameInput';
}

export interface RequestStartGameMessage extends BaseMessage {
    readonly command: 'requestStartGame';
}

export interface GameInputMessage extends BaseMessage {
    readonly command: 'gameInput';
    readonly input: any;
}

export interface UpdateGameSettingsMessage extends BaseMessage {
    readonly command: 'updateGameSettings';
    readonly gameSettings: GameSettings;
}

export interface NewVoucherMessage extends BaseMessage {
    readonly command: 'newVoucher';
    readonly voucherValueInMinor: number;
    readonly discountInMinor?: number;
    readonly hasUnplayedTicket?: boolean;

    /**
     * @deprecated Use voucherValueInMinor now.
     */
    readonly voucherValueInCents: number;
}

export interface TicketPriceChangedMessage extends BaseMessage {
    readonly command: 'ticketPriceChanged';
    readonly priceInMinor: number;

    readonly quantity: number;

    // an optional bet factor that can be send with the event.
    // a bet factor of one will be assumed if no value is provided.
    readonly betFactor?: number;

    /**
     * @deprecated use quantity now.
     */
    readonly rowCount?: number;

    /**
     * @deprecated use priceInMinor now.
     */
    readonly price: number;
}

export interface UpdateGameHeightMessage extends BaseMessage {
    readonly command: 'updateGameHeight';
    readonly height: number;
}


export interface PrepareGameMessage extends BaseMessage {
    readonly command: 'prepareGame';
    readonly demo: boolean;
}

export interface ResumeGameMessage extends BaseMessage {
    readonly command: 'resumeGame';
    readonly resume: boolean;
}

export interface CancelGameStartRequestMessage extends BaseMessage {
    readonly command: 'cancelRequestStartGame';
}

export interface BuyMessage extends BaseMessage {
    readonly command: 'buy';
    readonly betFactor: number;
    readonly quantity: number;
}

export interface GotoGameMessage extends BaseMessage {
    readonly command: 'gotoGame';
    readonly destinationGame: string;
}

export interface GotoUrlMessage extends BaseMessage {
    readonly command: 'gotoUrl';
    readonly destination: string;
}

export interface TicketActivatedEvent extends BaseMessage {
    readonly command: 'ticketActivated';
    readonly ticketId: string;
}

export interface FetchRequestMessage extends BaseMessage {
    readonly command: 'zig.XMLHttpRequest.request';
    readonly request: WithCID<Request>;
}

export interface FetchResultMessage extends BaseMessage {
    readonly command: 'zig.XMLHttpRequest.result';
    readonly result: WithCID<Result>;
}

/**
 * Returns 'null' but casted to a type of T. This is a little dirty but as we
 * will never use the value and are only interested in the type, this is okay.
 */
function typeOf<T>(): T {
    return (null as any) as T;
}

/**
 * This object defines a mapping from message key to the message type.
 * You might ask: why is this not just an interface? Later on we require a list of
 * message keys. If we do not want to define them multiple times, and as types wont really
 * exist at run time, we will just define them here directly, so we can use them later.
 */
const commandMessageTypesObject = {
    playGame: typeOf<PlayGameMessage>(),
    playDemoGame: typeOf<PlayDemoGameMessage>(),
    gameLoaded: typeOf<GameLoadedMessage>(),
    gameStarted: typeOf<GameStartedMessage>(),
    gameFinished: typeOf<GameFinishedMessage>(),
    gameInput: typeOf<GameInputMessage>(),
    gotoUrl: typeOf<GotoUrlMessage>(),
    gotoGame: typeOf<GotoGameMessage>(),
    ticketSettled: typeOf<TicketSettledMessage>(),
    requestGameInput: typeOf<RequestGameInputMessage>(),
    requestStartGame: typeOf<RequestStartGameMessage>(),
    ticketPriceChanged: typeOf<TicketPriceChangedMessage>(),
    newVoucher: typeOf<NewVoucherMessage>(),
    updateGameSettings: typeOf<UpdateGameSettingsMessage>(),
    updateGameHeight: typeOf<UpdateGameHeightMessage>(),
    prepareGame: typeOf<PrepareGameMessage>(),
    resumeGame: typeOf<ResumeGameMessage>(),
    cancelRequestStartGame: typeOf<CancelGameStartRequestMessage>(),
    buy: typeOf<BuyMessage>(),
    error: typeOf<ErrorMessage>(),

    'zig.XMLHttpRequest.request': typeOf<FetchRequestMessage>(),
    'zig.XMLHttpRequest.result': typeOf<FetchResultMessage>(),
};


// Type mapping from message key to message type.
export type CommandMessageTypes = typeof commandMessageTypesObject;

// This type maps from message key to a handler of this message type.
export type CommandMessageHandlers = {
    [K in keyof CommandMessageTypes]: (event: CommandMessageTypes[K]) => void
}

export type CommandMessageHandler<T extends Command> = CommandMessageHandlers[T]

// An array of all message types as strings.
const allCommandKeys = Object.keys(commandMessageTypesObject) as (keyof CommandMessageTypes)[];

export type Command = keyof CommandMessageTypes;

export type Unregister = () => void;
export type GenericHandler = (msg: any) => void;

export class MessageDispatcher {
    private readonly handlers: { [command: string]: GenericHandler[] } = {};

    constructor(public readonly game: string) {
    }

    public register<K extends Command>(type: K, handler: CommandMessageHandler<K>): Unregister {
        log.debug(`Register handler for messages of type ${type}`);

        this.handlers[type] = (this.handlers[type] || []).concat(handler);
        return () => this.unregister(type, handler);
    }

    /**
     * Registers an object containing multiple handler methods.
     */
    public registerGeneric<H extends Partial<CommandMessageHandlers>>(handler: H): Unregister {
        const unregister: Unregister[] = [];

        // pick all handlers from the object.
        for (const key of allCommandKeys) {
            const h = handler[key];
            if (h != null) {
                unregister.push(this.register(key, h));
            }
        }

        // verify that all types are really message types.
        for (const key of Object.keys(handler)) {
            if ((allCommandKeys as string[]).indexOf(key) === -1) {
                log.error(`No such message type: ${key}`);
            }
        }

        // return a function that unregisters all message handlers
        return () => unregister.forEach(fn => fn());
    }

    private unregister<K extends Command>(type: K, handler: CommandMessageHandler<K>): void {
        log.debug(`Unregister handler for messages of type ${type}`);
        this.handlers[type] = (this.handlers[type] || []).filter(it => it !== handler);
    }

    public dispatch(msg: Message): void {
        const message: BaseMessage = normalizeMessage(this.game, msg);

        // get the handlers for this message type.
        const handlers = this.handlers[message.command] || [];

        if (handlers.length === 0) {
            log.debug(`No handler for command ${message.command} registered.`);
            return;
        }

        // and dispatch it to all handlers.
        handlers.forEach(handler => {
            try {
                handler(message);
            } catch (err) {
                log.warn(`Ignoring error in handler for ${message.command}:`, err);
            }
        });
    }

    /**
     * Waits for the given game event type.
     * If an error occurs, it will be thrown as an exception.
     */
    public async waitForGameEvent<K extends Command>(type: K): Promise<CommandMessageTypes[K]> {
        const result = await this.waitForGameEvents(type);
        return result[type]!;
    }

    /**
     * Waits for one of the given game events to occur.
     * If an error occurs, it will be thrown as an exception.
     */
    public async waitForGameEvents<K extends keyof CommandMessageTypes>(...types: K[]): Promise<Partial<Pick<CommandMessageTypes, K>>> {
        return new Promise<Partial<Pick<CommandMessageTypes, K>>>((resolve, reject) => {
            const unregister: Unregister[] = [];

            // register event handlers
            types.forEach(k => {
                unregister.push(this.register(k, (event: CommandMessageTypes[K]) => {
                    unregisterAll();

                    const result: Partial<Pick<CommandMessageTypes, K>> = {};
                    result[k] = event;
                    resolve(result);
                }));
            });

            // register a handler for errors
            unregister.push(this.register('error', (error: IError) => {
                unregisterAll();
                reject(error);
            }));

            function unregisterAll() {
                unregister.forEach(fn => fn());
            }
        });
    }
}


/**
 * Convert the given message object into the a valid BaseMessage representation.
 *
 * This also patches renamed/missing fields and convert legacy fields..
 */
function normalizeMessage(game: string, message: Message): BaseMessage {
    let converted: BaseMessage = typeof message === 'string'
        ? {command: message, game}
        : {game, ...message};

    /**
     * If 'missing' is set to undefined, but 'fallback' is defined in the object,
     * then 'missing' will be set to the result of 'conv(fallback)'.
     */
    function fallback<T extends BaseMessage, K1 extends keyof T, K2 extends keyof T>(
        e: T, missing: K1, fallback: K2, conv?: (value: T[K2]) => T[K1]): T {

        if (typeof e[missing] === 'undefined' && typeof e[fallback] !== 'undefined') {
            return {
                ...(e as any),
                [missing]: conv ? conv(e[fallback]) : (e[fallback] as any),
            };
        } else {
            return e;
        }
    }

    converted = fallback(converted as TicketPriceChangedMessage, `priceInMinor`, 'price', price => 100 * price);
    converted = fallback(converted as TicketPriceChangedMessage, `price`, 'priceInMinor', priceInMinor => 0.01 * priceInMinor);

    converted = fallback(converted as TicketPriceChangedMessage, `rowCount`, 'quantity');
    converted = fallback(converted as TicketPriceChangedMessage, `quantity`, 'rowCount');

    converted = fallback(converted as NewVoucherMessage, 'voucherValueInCents', 'voucherValueInMinor');
    converted = fallback(converted as NewVoucherMessage, 'voucherValueInMinor', 'voucherValueInCents');

    converted = fallback(converted as GameStartedMessage, `ticketID`, 'ticketId');
    converted = fallback(converted as GameStartedMessage, `ticketId`, 'ticketID');

    if (converted.command === 'buy') {
        // add missing default value to buy message event.
        const buy = converted as BuyMessage;
        converted = <BuyMessage>{
            ...buy,
            quantity: buy.quantity || 1,
            betFactor: buy.betFactor || 1,
        };
    }

    return deepFreezeClone(converted);
}

export class MessageFactory extends MessageDispatcher {
    private readonly stopObserver: Unregister;

    // if it is a legacy game, we might use a different protocol variant.
    protected legacyGame: boolean = false;

    constructor(readonly messageClient: MessageClient, game: string) {
        super(game);

        // start observing the message client for messages
        const handler = (message: Message) => this.dispatch(message);
        this.stopObserver = messageClient.register(handler);

        this.register('updateGameSettings', (event: UpdateGameSettingsMessage) => {
            if (event.gameSettings.legacyGame) {
                this.legacyGame = true;
            }
        });
    }

    protected send<T extends BaseMessage>(msg: T): void {
        this.messageClient.send(normalizeMessage(this.game, msg));
    }

    protected commandSend<T extends Command>(msg: T): void {
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
        if (this.legacyGame) {
            this.commandSend('playGame');
        } else {
            this.send<PlayGameMessage>({command: 'playGame', game: this.game});
        }
    }

    public playDemoGame() {
        if (this.legacyGame) {
            this.commandSend('playDemoGame');
        } else {
            this.send<PlayDemoGameMessage>({command: 'playDemoGame', game: this.game});
        }
    }

    public gameInput(input: any) {
        this.send<GameInputMessage>({command: 'gameInput', game: this.game, input});
    }

    public newVoucher(voucherValueInMinor: number, discountInMinor?: number, hasUnplayedTicket: boolean = false) {
        this.send<NewVoucherMessage>({
            command: 'newVoucher', game: this.game,
            voucherValueInCents: voucherValueInMinor,
            voucherValueInMinor,
            discountInMinor,
            hasUnplayedTicket,
        });
    }

    public prepareGame(demo: boolean = false) {
        this.send<PrepareGameMessage>({command: 'prepareGame', game: this.game, demo});
    }

    public resumeGame(resume: boolean = true) {
        this.send<ResumeGameMessage>({command: 'resumeGame', game: this.game, resume});
    }

    public cancelRequestStartGame() {
        if (this.legacyGame) {
            this.commandSend('cancelRequestStartGame');
        } else {
            this.send<CancelGameStartRequestMessage>({command: 'cancelRequestStartGame', game: this.game});
        }
    }

    public xhrResult(result: WithCID<Result>) {
        this.send<FetchResultMessage>({command: 'zig.XMLHttpRequest.result', game: this.game, result});
    }
}

export class GameMessageInterface extends MessageFactory {
    public gameLoaded(inGamePurchase?: boolean) {
        this.send<GameLoadedMessage>({command: 'gameLoaded', game: this.game, inGamePurchase: inGamePurchase});
    }

    public gameStarted(ticketId: TicketId, ticketNumber: TicketNumber) {
        this.send<GameStartedMessage>({
            command: 'gameStarted',
            game: this.game,
            ticketId,
            ticketNumber,
            ticketID: ticketId,
        });
    }

    public gameFinished() {
        this.send<GameFinishedMessage>({command: 'gameFinished', game: this.game});
    }

    public ticketSettled() {
        this.send<TicketSettledMessage>({command: 'ticketSettled', game: this.game});
    }

    public requestGameInput() {
        this.send<RequestGameInputMessage>({command: 'requestGameInput', game: this.game});
    }

    public requestStartGame() {
        this.send<RequestStartGameMessage>({command: 'requestStartGame', game: this.game});
    }

    public ticketPriceChanged(quantity: number, ticketPriceInMinor: number) {
        this.send<TicketPriceChangedMessage>({
            command: 'ticketPriceChanged',
            game: this.game,
            price: 0.01 * ticketPriceInMinor,
            priceInMinor: ticketPriceInMinor,
            quantity,
        });
    }

    public updateGameHeight(height: number) {
        this.send<UpdateGameHeightMessage>({command: 'updateGameHeight', game: this.game, height});
    }

    public buy(betFactor: number = 1, quantity: number = 1) {
        this.send<BuyMessage>({command: 'buy', game: this.game, betFactor, quantity});
    }

    public gotoGame(destinationGame: string) {
        this.send<GotoGameMessage>({command: 'gotoGame', game: this.game, destinationGame});
    }

    public gotoUrl(destination: string) {
        this.send<GotoUrlMessage>({command: 'gotoUrl', game: this.game, destination});
    }

    public ticketActivated(ticketId: string) {
        this.send<TicketActivatedEvent>({command: 'ticketActivated', game: this.game, ticketId});
    }

    public xhrRequest(request: WithCID<Request>) {
        this.send<FetchRequestMessage>({command: 'zig.XMLHttpRequest.request', game: this.game, request});
    }

    public updateGameSettings(gameSettings: GameSettings) {
        this.send<UpdateGameSettingsMessage>({command: 'updateGameSettings', game: this.game, gameSettings});
    }
}
