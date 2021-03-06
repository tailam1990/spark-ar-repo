const RT = require('Reactive');
const k = ['x', 'y', 'z', 'scaleX', 'scaleY', 'scaleZ', 'rotationX', 'rotationY', 'rotationZ'];

/*
    const SignalProxy = require('./SignalProxy').default;
    const Signals = new SignalProxy([nullObject0, nullObject1], { score: 1, isPaused: false, speed: Reactive.val(1.234) });
*/

// Only number and boolean and their corresponding signal types are supported
export default function (objects, names = {}) {
    const cl = Array.isArray(objects) ? objects : [objects];                // A single or an array of scene objects with which its 9 transform will be used to store signals
    const nameKeys = Object.keys(names).slice(0, cl.length * k.length);     // Silently ignore excess names
    nameKeys.forEach((n, i) => {
        let ci = Math.floor(i / 9);
        let ki = i % 9;
        switch (getSignalType(names[n])) {
            case 'number':
                cl[ci].transform[k[ki]] = names[n];
                Object.defineProperty(this, n, {
                    enumerable: true,
                    get() { return cl[ci].transform[k[ki]]; },
                    set(v) { cl[ci].transform[k[ki]] = v; }
                });
                break;
            case 'boolean':
                cl[ci].transform[k[ki]] = RT.or(false, names[n]).ifThenElse(1, 0);
                Object.defineProperty(this, n, {
                    enumerable: true,
                    get() { return cl[ci].transform[k[ki]].eq(1); },
                    set(v) { cl[ci].transform[k[ki]] = RT.or(false, v).ifThenElse(1, 0); }
                });
                break;
        }
    });
}

// Feature test object to guess signal type
function getSignalType(o) {
    let t = typeof o;
    return t !== 'function' ? t : o.or ? 'boolean' : o.trigger ? 'number' : o.concat ? 'string' : '';
}
