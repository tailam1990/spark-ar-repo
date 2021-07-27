import RT from 'Reactive';
import SC from 'Scene';

const ts = ['x', 'y', 'z', 'scaleX', 'scaleY', 'scaleZ', 'rotationX', 'rotationY', 'rotationZ'];
let count = 0;

type SignalParameter = {
    [name: string]: boolean | BoolSignal | number | ScalarSignal;
}

type ProxyParameter<T> = {
    [Property in keyof T]: T[Property] extends boolean ? BoolSignal : T[Property] extends number ? ScalarSignal : T[Property] extends BoolSignal ? BoolSignal : T[Property] extends ScalarSignal ? ScalarSignal : never;
}

/**
 * Only number and boolean and their corresponding signal types are supported.
 * 
 * Usage:
 * 
 * import createSignals from './SignalProxy';
 * 
 * const Signals = await createSignals({ isPaused: false, index: 0, speed: Reactive.val(1.234) });
 * 
 * Signals.index = 3;
 * 
 * Signals.index.monitor().subscribe((e) => Diagnostics.log(e.newValue));
 * 
 * Signals.isPaused.onOn().subscribe(() => Diagnostics.log("On"));
 * 
 * @param names 
 * @returns Object with keys and signals created from names argument
 */
export default async function createSignals<T extends SignalParameter>(names: T): Promise<ProxyParameter<T>> {
    if (SC.create == null) {
        throw Error('Failed to create signal proxy: Enable "Scripting Dynamic Instantiation" in project properties -> capabilities.');
    }

    const store = {} as ProxyParameter<T>;
    const params = names || {};
    const keys = Object.keys(params);
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
        const ty = getSignalType(params[n]);
        switch (ty) {
            case 'number':
                ci.transform[ki] = params[n];
                Object.defineProperty(store, n, {
                    enumerable: true,
                    get() { return ci.transform[ki]; },
                    set(v) { ci.transform[ki] = v; }
                });
                break;
            case 'boolean':
                ci.transform[ki] = RT.or(false, params[n] as BoolSignal).ifThenElse(1, 0);
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
