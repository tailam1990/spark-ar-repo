const SC = require('Scene');
const DS = require('Diagnostics');
const AN = require('Animation');
const RT = require('Reactive');
const IS = require('Instruction');
const ML = require('Materials');
const NT = require('Networking');
const DM = require('DeviceMotion');
const HT = require('HandTracking');
const FT = require('FaceTracking');
const FG = require('FaceGestures');
const TG = require('TouchGestures');
const TM = require('Time');
const AU = require('Audio');

// const isBackCam = require('CameraInfo').captureDevicePosition.eq('BACK');

// Common
function throttle(fn, t) { let r = 0; return (...a) => { if (!r) { r = 1; fn(...a); require('Time').setTimeout(_ => r = 0, t); } } }
function find(p, r) { return p.split('/').reduce((s, c, i) => (i || r) ? s.child(c) : s.find(c), r || require('Scene').root); }
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
function debounce(f, w, i) { let t; return function () { let l = () => { t = null; if (!i) f(); }; let c = i && !t; if (t) TM.clearTimeout(t); t = TM.setTimeout(l, w); if (c) f(); }; };