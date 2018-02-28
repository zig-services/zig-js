import {sleep} from "../common";

let nextMessagePointer = 1;

export interface Message {
    ptr: number;
    type: string;
    content: any;
}

class QueueInfo {
    public readonly key: string;

    constructor(public readonly game: string,
                public readonly unique: string) {

        this.key = `zig-queue.${game}.${unique}`;
    }

    static parse(key: string): QueueInfo | null {
        const match = /^zig-queue\.([a-z]+)\.([0-9]+)$/.exec(key || "");
        if (match) {
            const [, game, unique] = match;
            return new QueueInfo(game, unique);
        }

        return null;
    }
}

function push(key: string, message: Message) {
    const queue: Message[] = JSON.parse(localStorage.getItem(key) || "[]");
    queue.push(message);

    // we might have a lost updated here, but as this is javascript, we don't have any way
    // to check or to do atomic operations.
    const encoded = JSON.stringify(queue);
    localStorage.setItem(key, encoded);
}

function poller(key: string): () => Message {
    let pointer = 0;

    const queue: Message[] = [];

    return (): Message | null => {
        // add new elements from local storage if any
        const messages = JSON.parse(localStorage.getItem(key) || "[]") as Message[];
        messages.filter(message => message.ptr > pointer).forEach(message => {
            pointer = Math.max(pointer, message.ptr);
            queue.push(message);
        });

        // stop if no elements in queue
        if (queue.length === 0) {
            return null;
        }

        return queue.shift();
    }
}

async function nextOf(p: () => Message): Promise<Message> {
    while (true) {
        const message = p();
        if (message != null) {
            return message;
        }

        await sleep(100);
    }
}

export function listQueueInfos(): QueueInfo[] {
    const queues: QueueInfo[] = [];
    for (let idx = 0; idx < localStorage.length; idx++) {
        const info = QueueInfo.parse(localStorage.key(idx));
        if (info != null) {
            queues.push(info);
        }
    }

    // sort alphabetically
    queues.sort((a, b) => a.key.localeCompare(b.key));
    return queues;
}

export function createQueue(game: string): Queue {
    const queue = new Queue(new QueueInfo(game, Date.now().toString()));
    queue.clear();
    return queue;
}

export class Queue {
    private readonly poller: () => Message;

    constructor(private queueInfo: QueueInfo) {
        this.poller = poller(queueInfo.key);
    }

    public async poll(): Promise<Message> {
        return nextOf(this.poller);
    }

    public push(type: string, content: any): void {
        const ptr = nextMessagePointer++;
        const msg: Message = {ptr, type, content};
        push(this.queueInfo.key, msg);
    }

    public clear(): void {
        localStorage.setItem(this.queueInfo.key, "[]");
    }
}
