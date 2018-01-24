type Logger = (...args: any[]) => void

function logger(prefix: string): Logger {
    return (...args: any[]): void => console.log(prefix, ...args);
}


type TicketId = string;

interface ITicket {
    id: TicketId;
}

interface IError {
    type: string;
    title: string;
    status?: number;
    details?: string;
}

interface IGameConfig {
    endpoint: string;
    headers: { [key: string]: string; };

    // for testing only. Enables xhr.withCredentials if set.
    withCredentials?: boolean
}

interface IGameSettings {
    index: string;
    aspect: number;
}
