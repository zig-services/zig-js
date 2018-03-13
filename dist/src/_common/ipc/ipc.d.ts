export interface Message {
    ptr: number;
    type: string;
    content: any;
}
export declare class QueueInfo {
    readonly game: string;
    readonly unique: string;
    readonly key: string;
    constructor(game: string, unique: string);
    static parse(key: string): QueueInfo | null;
}
export declare function listQueueInfos(): QueueInfo[];
export declare function createQueue(game: string): Queue;
export declare class Queue {
    private queueInfo;
    private readonly poller;
    constructor(queueInfo: QueueInfo);
    poll(): Promise<Message>;
    push(type: string, content: any): void;
    clear(): void;
}
