function throttle(fn, t) { let r = 0; return (...a) => { if (!r) { r = 1; fn(...a); require('Time').setTimeout(_ => r = 0, t); } } }
function el(p, r) { let rt = require('Scene').root; return p.charAt(0) == '/' ? rt.find(p.substr(1)) : p.split('/').reduce((s, c) => s.child(c), r || rt.find('Focal Distance')) }
function rand(min = 0, max = 1) { return min + Math.random() * (max - min); }
function randInt(min = 0, max = 1) { return Math.floor(rand(min, max)); }
function setVisibility(e, v) { toArray(e).forEach(c => c.hidden = !v); }
function toArray(e) { return Array.isArray(e) ? e : [e]; }
function toRadian(d) { return typeof d !== 'number' ? d.mul(Math.PI / 180) : (Math.PI * d / 180); }
function toDegree(d) { return typeof d !== 'number' ? d.mul(180 / Math.PI) : (180 * d / Math.PI); }
function between(n, min, max, excl) { return n >= min && n <= max && (!excl || n !== min && n !== max); }
function watchToString(g) { return Object.keys(g).reduce((s, c) => s.concat(c + ' ').concat((g[c].or ? a => a.ifThenElse('TRUE', 'FALSE') : g[c].mul ? a => a.format('{: 6f}') : a => a)(g[c])).concat('\n'), require('Reactive').val('')); }
function immediate(f) { require('Time').setTimeout(f, 0); };