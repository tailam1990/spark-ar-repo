const isBackCam = require('CameraInfo').captureDevicePosition.eq('BACK');

function moveOnPan(obj) {
    TG.onPan(obj).subscribe(e => {
        let loc = SC.unprojectToFocalPlane(e.location);
        let locX = isBackCam.ifThenElse(loc.x, loc.x.neg());
        obj.transform.x = locX.add(obj.transform.x.pinLastValue()).sub(locX.pin());
        obj.transform.y = loc.y.add(obj.transform.y.pinLastValue()).sub(loc.y.pin());
    });
}

function resizeOnPinch(obj, min = .5, max = 2) {
    TG.onPinch(obj).subscribe(e => {
        obj.transform.scaleX = RT.clamp(e.scale.mul(obj.transform.scaleX.pinLastValue()), min, max);
        obj.transform.scaleY = RT.clamp(e.scale.mul(obj.transform.scaleY.pinLastValue()), min, max);
        obj.transform.scaleZ = RT.clamp(e.scale.mul(obj.transform.scaleZ.pinLastValue()), min, max);
    });
}

function throttle(fn, t) { let r = 0; return (...a) => { if (!r) { r = 1; fn(...a); require('Time').setTimeout(_ => r = 0, t); } } }
function el(p, r) { return p.split('/').reduce((s, c, i) => (i || r) ? s.child(c) : s.find(c), r || require('Scene').root); }
function rand(min = 0, max = 1) { return min + Math.random() * (max - min); }
function randInt(min = 0, max = 1) { return Math.floor(rand(min, max)); }
function setVisibility(e, v) { toArray(e).forEach(c => c.hidden = !v); }
function toArray(e) { return Array.isArray(e) ? e : [e]; }
function toRadian(d) { return typeof d !== 'number' ? d.mul(Math.PI / 180) : (Math.PI * d / 180); }
function toDegree(d) { return typeof d !== 'number' ? d.mul(180 / Math.PI) : (180 * d / Math.PI); }
function between(n, min, max, excl) { return n >= min && n <= max && (!excl || n !== min && n !== max); }
function watchToString(g) { return Object.keys(g).reduce((s, c) => s.concat(c + ' ').concat((g[c].or ? a => a.ifThenElse('TRUE', 'FALSE') : g[c].mul ? a => a.format('{: 6f}') : a => a)(g[c])).concat('\n'), require('Reactive').val('')); }
function immediate(f) { require('Time').setTimeout(f, 0); };
function lookAt(src, tgt) { let RT = require('Reactive'), s = src.transform, t = tgt.transform, v = t.position.sub(s.position); s.rotationX = RT.atan2(v.y, RT.vector(v.x, v.z, 0).magnitude()).neg(); s.rotationY = RT.atan2(v.x, v.z); }
function ScalarProxy(c, s = []) { let k = ['x', 'y', 'z', 'scaleX', 'ScaleY', 'scaleZ', 'rotationX', 'rotationY', 'rotationZ']; s.forEach((n, i) => Object.defineProperty(this, n, { get() { return c.transform[k[i]]; }, set(v) { c.transform[k[i]] = v; } })); }