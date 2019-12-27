const CI = require('CameraInfo');
const RT = require('Reactive');
const TM = require('Time');

export function alphaBlend(a) { return a.reduce((s, c) => RT.mix(c, s, s.w)); }
export function throttle(fn, t) { let r = 0; return (...a) => { if (!r) { r = 1; fn(...a); TM.setTimeout(_ => r = 0, t); } } }
export function rand(min = 0, max = 1) { return min + Math.random() * (max - min); }
export function randInt(min = 0, max = 2) { return Math.floor(rand(min, max)); }
export function randSign() { return Math.random() - .5 > 0 ? 1 : -1 };
export function show(e) { toArray(e).forEach(c => c.hidden = false); }
export function hide(e) { toArray(e).forEach(c => c.hidden = true); }
export function setVisible(e, v) { toArray(e).forEach(c => c.hidden = !v); }
export function toArray(e) { return Array.isArray(e) ? e : [e]; }
export function toRadian(d) { return typeof d !== 'number' ? d.mul(Math.PI / 180) : (Math.PI * d / 180); }
export function toDegree(d) { return typeof d !== 'number' ? d.mul(180 / Math.PI) : (180 * d / Math.PI); }
export function between(n, min, max, excl = false) { return RT.or(false, excl).ifThenElse(n.gt(min).and(n.lt(max)), n.ge(min).and(n.le(max))); }
export function mod2(a, b) { return RT.mod(a, b).add(b).mod(b); }
export function watchToString(g) { return Object.keys(g).reduce((s, c) => s.concat(c + ' ').concat(g[c] ? g[c].or ? g[c].ifThenElse('TRUE', 'FALSE') : g[c].trigger ? g[c].format('{: 6f}') : g[c] : 'null/undefined').concat('\n'), RT.val('')); }
export function immediate(f) { TM.setTimeout(f, 0); }
export function iRange(end, start = 0) { let a = []; for (let i = 0; i < end - start; i++) a.push(i + start); return a };
export function lookAt(src, tgt) { let s = src.transform, t = tgt.transform, v = t.position.sub(s.position); s.rotationX = RT.atan2(v.y, RT.vector(v.x, v.z, 0).magnitude()).neg(); s.rotationY = RT.atan2(v.x, v.z); }
export function resolveObject(o) { let v = Object.keys(o); return Promise.all(v.map(k => o[k])).then(r => r.reduce((a, c, i) => { a[v[i]] = c; return a; }, {})); }
export function screenToWorld(p) { let c = CI.previewSize; return RT.vector(p.x.sub(c.x.div(2)).div(c.x.div(2)).mul(c.x.div(c.y).mul(25)), p.y.sub(c.y.div(2)).div(c.y.div(2)).neg().mul(25), 0); }