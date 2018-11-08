import * as deepFreeze from 'deep-freeze';
import {DeepReadonly} from 'deep-freeze';

import TsDeepCopy from 'ts-deepcopy';

export function sleep(millis: number): Promise<{}> {
    return new Promise<{}>((resolve => window.setTimeout(resolve, millis)));
}


/**
 * Returns a deep freezed deep copy of the object.
 */
export function deepFreezeClone<T>(object: T): DeepReadonly<T> {
    return deepFreeze(TsDeepCopy(object));
}
