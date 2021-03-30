import RT from 'Reactive';
import SC from 'Scene';

const ts = ['x', 'y', 'z', 'scaleX', 'scaleY', 'scaleZ', 'rotationX', 'rotationY', 'rotationZ'];
let count = 0;

type ProxyParameter = {
    [name: string]: ISignal;
}

type SignalParameter = {
    [name: string]: boolean | BoolSignal | number | ScalarSignal;
}

/**
 * Only number and boolean and their corresponding signal types are supported
 * 
 * Usage:
 * 
 * import createSignals from './SignalProxy';
 * 
 * type SignalProxy = { isPaused: BoolSignal; speed: ScalarSignal; }
 * 
 * const Signals = await createSignals<SignalProxy>({ isPaused: false, speed: Reactive.val(1.234) });
 * @param names 
 * @returns Object with keys and signals created from names argument
 */
export default async function createSignals<T extends ProxyParameter>(names: SignalParameter = {}): Promise<T> {
    if (SC.create == null) {
        throw Error('Failed to create signal proxy: Enable "Scripting Dynamic Instantiation" in project properties -> capabilities.');
    }

    const store = {} as T;
    const keys = Object.keys(names);
    const fd = await SC.root.findFirst('Focal Distance');
    const ct = await SC.create('SceneObject', { name: `__sp`, hidden: true });
    const cl = await Promise.all(
        Array(Math.ceil(keys.length / 9))
            .fill(null)
            .map(() => SC.create('SceneObject', { name: `__o${count++}` }))
    );
    fd.addChild(ct);
    cl.forEach((c) => ct.addChild(c));

    keys.forEach((n, i) => {
        const ci = cl[Math.floor(i / 9)];
        const ki = ts[i % 9];
        const ty = getSignalType(names[n]);
        switch (ty) {
            case 'number':
                ci.transform[ki] = names[n];
                Object.defineProperty(store, n, {
                    enumerable: true,
                    get() { return ci.transform[ki]; },
                    set(v) { ci.transform[ki] = v; }
                });
                break;
            case 'boolean':
                ci.transform[ki] = RT.or(false, names[n] as BoolSignal).ifThenElse(1, 0);
                Object.defineProperty(store, n, {
                    enumerable: true,
                    get() { return ci.transform[ki].eq(1); },
                    set(v) { ci.transform[ki] = RT.or(false, v).ifThenElse(1, 0); }
                });
                break;
            default:
                throw `Unsupported type ${ty} for "${n}"`;
        }
    });

    return store;
}

// Feature test object to guess signal type
function getSignalType(o) {
    let t = typeof o;
    return (t !== 'function' && t !== 'object') ? t : o.or ? 'boolean' : o.trigger ? 'number' : o.concat ? 'string' : '';
}
