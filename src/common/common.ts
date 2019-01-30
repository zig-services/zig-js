import * as deepFreeze from 'deep-freeze';
import {DeepReadonly} from 'deep-freeze';

export function sleep(millis: number): Promise<{}> {
    return new Promise<{}>((resolve => window.setTimeout(resolve, millis)));
}


/**
 * Returns a deep freezed deep copy of the object.
 */
export function deepFreezeClone<T>(object: T): DeepReadonly<T> {
    if (object == null)
        return object;

    return deepFreeze(deepClone(object));
}

/**
 * Executes deepcopy.
 */
export function deepClone<Tp>(input: Tp): Tp {
    function doDeepClone(input: any): any {
        const type = typeof input;

        if (input == null || type === 'string' || type === 'number') {
            return input;

        } else if (input instanceof Date) {
            return new Date((input as Date).getTime());

        } else if (Array.isArray(input)) {
            return input.map(doDeepClone);

        } else if (type === 'object') {
            const copy: any = Object.create(input.constructor.prototype);
            Object.keys(input).forEach(key => copy[key] = doDeepClone(input[key]));
            return copy;

        } else {
            return input;
        }
    }

    return doDeepClone(input);
}

export function arrayNotEmpty<T>(arr: Array<T> | undefined): arr is Array<T> {
    return arr != null && arr.length !== 0;
}

export function arrayIsEmpty<T>(arr: Array<T> | undefined): boolean {
    return arr == null || arr.length === 0;
}
