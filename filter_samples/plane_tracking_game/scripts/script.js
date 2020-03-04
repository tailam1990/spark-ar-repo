const AN = require('Animation');
const CI = require('CameraInfo');
const DS = require('Diagnostics');
const ML = require('Materials');
const PE = require('Patches');
const RT = require('Reactive');
const SC = require('Scene');
const SH = require('Shaders');
const TG = require('TouchGestures');
const TM = require('Time');
const { alphaBlend, betweens, eqs, fract, maxList, minList, resolveObject, toArray, watchToString } = require('./common');
const maps = require('./maps').default;
const SignalProxy = require('./SignalProxy').default;

/* TODO:
    - Display game start timer / animation when cursor is on start zone
    - Screen transition animation
    - Win/lose animations
    - Level transitions
    - More levels
*/

// Global constants
const UV_CENTER = RT.pack2(0.5, 0.5);
const UV = SH.fragmentStage(SH.vertexAttribute({ variableName: 'TEX_COORDS' }));
const DIFFUSE = { textureSlotName: SH.DefaultMaterialTextures.DIFFUSE };

const BlockType = {
    NONE: 0,
    START: 1,
    END: 2,
    WALL: 4,
    FAN: 8,
};
const GameState = {
    MAPEDIT: -20,
    PREINIT: -10,
    INIT: 0,
    GAMESTARTING: 7,
    INGAME: 10,
    WIN: 20,
    LOSE: 30,
};

// Game configs
const POLLING_MS = 50;
const GRID_SIZE = 25;
const SCENE_SCALE = 5;
const SCALE_OFFSET = SCENE_SCALE / 20;
const FAN_SPEED = 2;
const HALF_BLOCK_UV_LEN = .5 / GRID_SIZE;

// Block colors
const COLOR_WALL = RT.pack3(1, .3, 1);
const COLOR_START = RT.pack3(0, 0, 1);
const COLOR_END = RT.pack3(1, .3, 0);
const COLOR_GRID = RT.pack3(1, 0, 1);
const COLOR_CURSOR = RT.pack3(1, 1, 1);
const COLOR_FAN = RT.pack3(.9, .1, .9);

const screenScale = PE.getScalarValue('screenScale');
const timeSine = RT.sin(TM.ms.div(1000)).add(1).div(4).add(.25);
const halfScreenWidth = CI.previewSize.width.div(2);
const halfScreenHeight = CI.previewSize.height.div(2);
const halfScreenScaledWidth = halfScreenWidth.div(screenScale);
const halfScreenScaledHeight = halfScreenHeight.div(screenScale);

const fanAngle1 = TM.ms.div(1000 / FAN_SPEED);
const fanAngle2 = fanAngle1.add(Math.PI / 2);
const fanCos1 = RT.cos(fanAngle1);
const fanSin1 = RT.sin(fanAngle1);
const fanCos2 = RT.cos(fanAngle2);
const fanSin2 = RT.sin(fanAngle2);

resolveObject({
    // Map edit UI
    btnWall: findFirst('btnWall'),
    btnDelete: findFirst('btnDelete'),
    btnStartZone: findFirst('btnStartZone'),
    btnEndZone: findFirst('btnEndZone'),
    btnFan: findFirst('btnFan'),
    btnInfo: findFirst('btnInfo'),
    btnExport: findFirst('btnExport'),
    mapEditGroup: findFirst('mapEditGroup'),
    rctMapEdit: findFirst('rctMapEdit'),

    // Scene objects
    cursor: findFirst('cursor'),
    cursorDebug: findFirst('cursorDebug'),
    cursorEmitter: findFirst('cursorEmitter'),
    ground: findFirst('ground'),
    planeTracker: findFirst('planeTracker0'),
    scene: findFirst('scene'),
    signals: findByPath('**/signals/*'),
    txtDebug: findFirst('txtDebug'),
    txtTimer: findFirst('txtTimer'),

    // Materials
    mGround: ML.findFirst('m_ground'),
    material0: ML.findFirst('material0'),
}).then(({ btnWall, btnDelete, btnFan, btnInfo, btnStartZone, btnEndZone, btnExport, rctMapEdit, cursor, cursorEmitter, ground, mapEditGroup, planeTracker, scene, signals, txtDebug, txtTimer, mGround, }) => {
    const pollDriver = timeDriver(POLLING_MS, Infinity);
    const Signals = new SignalProxy(signals, {
        state: GameState.PREINIT,
        gameStartProgress: 0,
        gameTime: 0,
        hitTestX: -1,
        hitTestZ: -1,
        cursorRow: -1,
        cursorCol: -1,
        cursorStartRow: -1,
        cursorStartCol: -1,
    });
    const subManager = useSubscriptionManager();

    const isInGame = Signals.state.eq(GameState.INGAME);
    const showCursor = Signals.state.ne(GameState.PREINIT);
    let currentMap;
    let screenCenter;
    let screenCenterDist = Infinity;

    // Assign cursor position to hit test location
    const cursorTransform = cursor.transform.position.add(SCALE_OFFSET).div(SCENE_SCALE / 10);
    const cursorUVPosition = RT.pack2(cursorTransform.x, cursorTransform.z);
    Signals.cursorCol = showCursor.ifThenElse(cursorUVPosition.x.mul(GRID_SIZE).floor(), -1);
    Signals.cursorRow = showCursor.ifThenElse(cursorUVPosition.y.mul(GRID_SIZE).floor(), -1);
    Signals.cursorStartRow = Signals.cursorRow;
    Signals.cursorStartCol = Signals.cursorCol;
    cursor.transform.x = Signals.hitTestX.expSmooth(100);
    cursor.transform.z = Signals.hitTestZ.expSmooth(100);

    // Cursor trails
    cursorEmitter.sizeModifier = AN.samplers.linear(0.005, 0);

    ground.transform.scale = RT.scale(SCENE_SCALE, SCENE_SCALE, SCENE_SCALE);
    scene.hidden = Signals.state.le(GameState.PREINIT);

    // UI
    const uiTransitionDriver = timeDriver(500, 1);
    const uiTransitionX = AN.animate(uiTransitionDriver, AN.samplers.easeInQuad(0, 1));
    const gameStartDriver = timeDriver(1000);

    Signals.gameStartProgress = AN.animate(gameStartDriver, AN.samplers.linear(0, 1));
    txtTimer.text = formatTime(Signals.gameTime);

    // Map edit
    const rowMin = RT.min(Signals.cursorStartRow, Signals.cursorRow);
    const rowMax = RT.max(Signals.cursorStartRow, Signals.cursorRow);
    const colMin = RT.min(Signals.cursorStartCol, Signals.cursorCol);
    const colMax = RT.max(Signals.cursorStartCol, Signals.cursorCol);
    let mapEditBlockType = BlockType.NONE;

    TG.onTap(btnWall).subscribe(() => mapEditBlockType = BlockType.WALL);
    TG.onTap(btnDelete).subscribe(() => mapEditBlockType = BlockType.NONE);
    TG.onTap(btnStartZone).subscribe(() => mapEditBlockType = BlockType.START);
    TG.onTap(btnEndZone).subscribe(() => mapEditBlockType = BlockType.END);
    TG.onTap(btnFan).subscribe(() => mapEditBlockType = BlockType.FAN);
    TG.onTap(btnInfo).subscribe(() => mapEditBlockType = null);
    TG.onTap(btnExport).subscribe(exportMap);

    mapEditGroup.hidden = Signals.state.ne(GameState.MAPEDIT);

    Signals.state.eq(GameState.MAPEDIT).onOn({ fireOnInitialValue: true }).subscribe(() => {
        const rheight = rctMapEdit.height.pinLastValue();
        const xOffset = rctMapEdit.transform.x.pinLastValue() - rheight / 2 + halfScreenScaledWidth.pinLastValue();
        const yOffset = -rctMapEdit.transform.y.pinLastValue() - rheight / 2 + halfScreenScaledHeight.pinLastValue();

        subManager.onTap(rctMapEdit).subscribe((e) => {
            const px = e.location.x / screenScale.pinLastValue();
            const py = e.location.y / screenScale.pinLastValue();
            const cc = Math.floor((px - xOffset) / rheight * GRID_SIZE);
            const cr = Math.floor((py - yOffset) / rheight * GRID_SIZE);
            if (mapEditBlockType != null) {
                fillRange(cr, cr, cc, cc, mapEditBlockType);
                drawMap();
            } else {
                DS.log(`[${cr}, ${cc}]`);
            }
        });
        subManager.onPan(rctMapEdit).subscribe((e) => {
            if (mapEditBlockType != null) {
                const px = e.location.x.div(screenScale);
                const py = e.location.y.div(screenScale);
                Signals.cursorStartCol = px.pin().sub(xOffset).div(rheight).mul(GRID_SIZE).floor();
                Signals.cursorStartRow = py.pin().sub(yOffset).div(rheight).mul(GRID_SIZE).floor();
                Signals.cursorCol = px.sub(xOffset).div(rheight).mul(GRID_SIZE).floor();
                Signals.cursorRow = py.sub(yOffset).div(rheight).mul(GRID_SIZE).floor();

                e.state.eq('ENDED').onOn().subscribeWithSnapshot({
                    cursorStartCol: Signals.cursorStartCol,
                    cursorStartRow: Signals.cursorStartRow,
                    cursorRow: Signals.cursorRow,
                    cursorCol: Signals.cursorCol,
                }, (_, s) => {
                    fillRange(s.cursorStartRow, s.cursorRow, s.cursorStartCol, s.cursorCol, mapEditBlockType);
                    Signals.cursorRow = -1;
                    Signals.cursorCol = -1;
                    Signals.cursorStartRow = -1;
                    Signals.cursorStartCol = -1;
                    drawMap();
                });
            }
        });
        uiTransitionDriver.start();
    });

    // Update screen center with tap gestures, start hit test polling
    TG.onTap().subscribeWithSnapshot({
        ...Signals,
        halfScreenWidth,
        halfScreenHeight,
    }, (e, s) => {
        let newScreenCenterDist = dist2d({ x: s.halfScreenWidth, y: s.halfScreenHeight }, e.location);
        // Update screen center unless currently in game
        if (s.state !== GameState.INGAME && screenCenterDist > newScreenCenterDist) {
            screenCenter = e.location;
            screenCenterDist = newScreenCenterDist;
            planeTracker.trackPoint(e.location);
        }
        // Start polling for hit test position on first tap, ignore any taps too far from center
        if (s.state === GameState.PREINIT && newScreenCenterDist < 200) {
            pollDriver.start();
            Signals.state = GameState.INIT;
        }
    });

    // Init
    importMap(maps[2]);

    // Hit test polling
    pollDriver.onAfterIteration().subscribe(() => {
        let p = planeTracker.hitTest(screenCenter);
        if (p) {
            Signals.hitTestX = p.x;
            Signals.hitTestZ = p.z;
        }
    });

    // Monitor cursor coordinate to check collision
    RT.monitorMany({
        cursorCol: Signals.cursorCol,
        cursorRow: Signals.cursorRow,
        state: Signals.state,
    }).subscribe(({ newValues: s }) => {
        const b = getBlock(s.cursorRow, s.cursorCol);
        switch (s.state) {
            case GameState.INIT: case GameState.LOSE: case GameState.WIN:
                if (b === BlockType.START) {
                    Signals.state = GameState.GAMESTARTING;
                    gameStartDriver.reset();
                    gameStartDriver.start();
                }
                break;
            case GameState.GAMESTARTING:
                if (b !== BlockType.START) {
                    Signals.state = GameState.INIT;
                    gameStartDriver.reverse();
                }
                break;
            case GameState.INGAME:
                if (b < 0 || b === BlockType.WALL) {
                    Signals.state = GameState.LOSE;
                } else if (b === BlockType.END) {
                    Signals.state = GameState.WIN;
                }
                break;
        }
    });

    gameStartDriver.onAfterIteration().subscribe((e) => {
        if (e > 0) {
            Signals.state = GameState.INGAME;
        }
    });

    Signals.state.eq(GameState.INGAME).onOn().subscribe(() => {
        uiTransitionDriver.start();
        startTimer();
    });

    Signals.state.eq(GameState.WIN).onOn().subscribe(() => {
        stopTimer();
    });

    Signals.state.eq(GameState.LOSE).onOn().subscribe(() => {
        stopTimer();
        pollDriver.stop();
        TM.setTimeout(() => pollDriver.start(), 2000);
    });

    function startTimer() {
        Signals.gameTime = dt();
    }
    function stopTimer() {
        Signals.gameTime = Signals.gameTime.pinLastValue();
    }

    function importMap(map) {
        subManager.unsubscribeList('collisions');

        const newGrid = Array(GRID_SIZE).fill().map((_) => Array(GRID_SIZE).fill(BlockType.NONE));
        const grid = map.grid;
        if (grid.length > 0) {
            for (let r = 0; r < Math.min(grid.length, GRID_SIZE); r++) {
                for (let c = 0; c < Math.min(grid[0].length, GRID_SIZE); c++) {
                    newGrid[r][c] = grid[r][c]
                }
            }
        }

        currentMap = {
            grid: newGrid,
            fans: map.fans,
            spinners: map.spinners,
        };

        drawMap();
    }
    function exportMap() {
        DS.log(currentMap);
    }

    function fillRange(r1, r2, c1, c2, blockType) {
        const grid = currentMap.grid;
        const rMin = Math.min(r1, r2);
        const rMax = Math.max(r1, r2);
        const cMin = Math.min(c1, c2);
        const cMax = Math.max(c1, c2);
        for (let r = rMin; r <= rMax; r++) {
            for (let c = cMin; c <= cMax; c++) {
                if (!isOutOfBound(r, c)) {
                    grid[r][c] = blockType;
                }
            }
        }
    }
    function isOutOfBound(r, c) {
        return c >= GRID_SIZE || c < 0 || r >= GRID_SIZE || r < 0;
    }
    function getBlock(r, c) {
        return isOutOfBound(r, c) ? -1 : currentMap.grid[r][c];
    }
    function uvCoordBetween(uvc, r1, r2, c1, c2) {
        return RT.min(betweens(uvc.x, c1, c2), betweens(uvc.y, r1, r2));
    }
    function uvCoordEquals(uvc, r, c) {
        return RT.min(eqs(uvc.x, c), eqs(uvc.y, r));
    }

    function drawMap() {
        const { grid, fans, spinners } = currentMap;
        const uvm = UV.mul(GRID_SIZE);
        const uvc = uvm.floor();

        const uvTransX = RT.step(uiTransitionX, UV.x);

        // Gridlines
        const gridEdgeInner = RT.val(.45);
        const gridEdgeOuter = RT.val(.49);
        const gd = fract(uvm).sub(.5).abs();

        // Alpha
        const aWall = getAlphaByBlockType(uvc, grid, BlockType.WALL);
        const aStart = getAlphaByBlockType(uvc, grid, BlockType.START);
        const aEnd = getAlphaByBlockType(uvc, grid, BlockType.END);
        const aCursor = uvCoordBetween(uvc, rowMin, rowMax, colMin, colMax).mul(.5);
        const aGridlines = RT.max(RT.smoothStep(gd.x, gridEdgeInner, gridEdgeOuter), RT.smoothStep(gd.y, gridEdgeInner, gridEdgeOuter));

        // Color
        const colCursor = RT.pack4(COLOR_CURSOR.x, COLOR_CURSOR.y, COLOR_CURSOR.z, aCursor);
        const colEnd = RT.pack4(COLOR_END.x, COLOR_END.y, COLOR_END.z, aEnd);
        const colStart = RT.pack4(COLOR_START.x, COLOR_START.y, COLOR_START.z, aStart);
        const colWall = RT.pack4(COLOR_WALL.x, COLOR_WALL.y, COLOR_WALL.z, aWall);
        const colGrid = RT.pack4(COLOR_GRID.x, COLOR_GRID.y, COLOR_GRID.z, aGridlines);
        const colFan = drawFan(fans);
        const colSpinner = drawSpinner(spinners);

        const colBlend = alphaBlend([colFan, colSpinner, colStart, colEnd, colWall, colGrid, colCursor,]);
        const col = RT.pack4(colBlend.x, colBlend.y, colBlend.z, colBlend.w);

        mGround.setTexture(col, DIFFUSE);
    }

    function drawSpinner(spinners) {
        const radius = RT.val(.02);
        let a = RT.val(0);

        if (Array.isArray(spinners)) {
            spinners.forEach((c) => {
                for (let i = 1; i <= c.len; i++) {
                    const mar = c.margin * i + c.offset;
                    const t1 = RT.pack2(fanCos1.mul(mar).mul(c.dir), fanSin1.mul(mar));
                    const t2 = RT.pack2(fanCos2.mul(mar).mul(c.dir), fanSin2.mul(mar));
                    const p1 = UV_CENTER.add(t1);
                    const p2 = UV_CENTER.add(t2);
                    const p3 = UV_CENTER.sub(t1);
                    const p4 = UV_CENTER.sub(t2);

                    a = maxList([
                        a,
                        RT.step(0, SH.sdfCircle(p1, radius)),
                        RT.step(0, SH.sdfCircle(p2, radius)),
                        RT.step(0, SH.sdfCircle(p3, radius)),
                        RT.step(0, SH.sdfCircle(p4, radius)),
                    ]);

                    // Collision
                    subManager.subscribeToList(
                        'collisions',
                        minList([
                            cursorUVPosition.distance(p1),
                            cursorUVPosition.distance(p2),
                            cursorUVPosition.distance(p3),
                            cursorUVPosition.distance(p4),
                        ]).le(radius).and(isInGame).onOn().subscribe(() => {
                            Signals.state = GameState.LOSE;
                        })
                    );
                }
            });
        }
        return RT.pack4(1, 1, 1, a);
    }

    function drawFan(fans) {
        const fanWidth = RT.val(.01);
        let col = RT.pack4(0, 0, 0, 0);
        if (Array.isArray(fans)) {
            fans.forEach((f) => {
                const len = RT.val((f.len - .5) / GRID_SIZE / 2);
                const t1 = RT.pack2(fanCos1.mul(len), fanSin1.mul(len));
                const t2 = RT.pack2(fanCos2.mul(len), fanSin2.mul(len));
                const c = gridCoordToUV(RT.pack2(f.center[1], f.center[0]));
                const p11 = t1.neg().add(c);
                const p12 = t1.add(c);
                const p21 = t2.neg().add(c);
                const p22 = t2.add(c);
                const d = RT.min(
                    pointLineSegDist(UV, p11, p12),
                    pointLineSegDist(UV, p21, p22)
                );
                col = RT.max(RT.pack4(COLOR_FAN.x, COLOR_FAN.y, COLOR_FAN.z, RT.step(.0075, d)), col);

                // Fan collisions
                subManager.subscribeToList(
                    'collisions',
                    RT.min(
                        pointLineSegDist(cursorUVPosition, p11, p12),
                        pointLineSegDist(cursorUVPosition, p21, p22)
                    ).le(fanWidth).and(isInGame).onOn().subscribe(() => {
                        Signals.state = GameState.LOSE;
                    })
                );
            });
        }
        return col;
    }

    function getAlphaByBlockType(uvc, grid, blockType) {
        const g = compactGridByType(grid, blockType);
        let a = RT.val(0);
        for (let r = 0; r < GRID_SIZE; r++) {
            let row = g[r];
            if (row) {
                for (let c = 0; c < row.length; c += 2) {
                    a = RT.max(a, uvCoordBetween(uvc, r, r, row[c], row[c + 1]));
                }
            }
        }
        return a;
    }

    function compactGridByType(grid, blockType) {
        let a = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            let cl = -1;
            let row = [];
            for (let c = 0; c < GRID_SIZE; c++) {
                if (grid[r][c] & blockType) {
                    if (cl < 0) {
                        cl = c;
                    }
                }
                else if (cl >= 0) {
                    row.push(cl, c - 1);
                    cl = -1;
                }
            }
            if (cl >= 0) {
                row.push(cl, GRID_SIZE - 1);
            }
            a.push(row);
        }
        return a;
    }

    function gridCoordToUV(c) {
        return c.div(GRID_SIZE).add(HALF_BLOCK_UV_LEN);
    }

    // Debug
    txtDebug.text = watchToString({
        ...Signals,
    });
}).catch((ex) => {
    DS.log(ex.name ? `[${ex.name}] ${ex.message}\n${ex.stack}` : ex);
});

function SceneUIButton(cursorPositon, btn) {
    const halfWidth = btn.transform.scaleX.div(20);
    const halfHeight = btn.transform.scaleY.div(20);
    const isHover = cursorPositon.x.sub(btn.transform.x).abs().le(halfWidth).and(cursorPositon.z.sub(btn.transform.z).abs().le(halfHeight));

    let handleTap = () => { };
    let handleHover = () => { };
    let handleHoverLeave = () => { };

    this.obj = btn;
    this.onTap = (cb) => {
        handleTap = cb;
        return this;
    };
    this.onHover = (cb) => {
        handleHover = cb;
        return this;
    };
    this.onHoverLeave = (cb) => {
        handleHoverLeave = cb;
        return this;
    };
    isHover.monitor({ fireOnInitialValue: true }).subscribe((e) => {
        e.newValue ? handleHover() : handleHoverLeave();
    });
    TG.onTap().subscribeWithSnapshot({ isHover, hidden: btn.hidden }, (_, s) => {
        if (this.onTap && s.isHover && !s.hidden) {
            handleTap();
        }
    });
    TG.onTap(btn).subscribe(handleTap);
}

function formatTime(t) {
    const minute = t.div(60000).mod(60).floor();
    const second = t.div(1000).mod(60).floor();
    const millisecond = t.mod(1000).div(10).floor();
    const minuteText = minute.lt(10).ifThenElse('0', '').concat(minute.toString());
    const secondText = second.lt(10).ifThenElse('0', '').concat(second.toString());
    const millisecondText = millisecond.lt(10).ifThenElse('0', '').concat(millisecond.toString());
    return minuteText.concat(':').concat(secondText).concat(':').concat(millisecondText);
}

function dt() { return TM.ms.sub(TM.ms.pinLastValue()); }
function dist2d(a, b) { let dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function findFirst(a) { return SC.root.findFirst(a); }
function findByPath(a) { return SC.root.findByPath(a); }
function timeDriver(durationMilliseconds, loopCount = 1, mirror = false) { return AN.timeDriver({ durationMilliseconds, loopCount, mirror }) };

// http://geomalgorithms.com/a02-_lines.html
function pointLineSegDist(point, linePoint0, linePoint1) {
    const v = linePoint1.sub(linePoint0);
    const w = point.sub(linePoint0);

    const c1 = w.dot(v);
    const c2 = v.dot(v);

    const d1 = point.distance(linePoint0);
    const d2 = point.distance(linePoint1);

    const s1 = RT.step(0, c1);
    const s2 = RT.step(c1, c2);

    const b = c1.div(c2);
    const pb = linePoint0.add(v.mul(b));
    const d3 = point.distance(pb);

    return RT.mix(RT.mix(d3, d2, s2), d1, s1);
}

function useSubscriptionManager() {
    const subs = { tap: {}, pan: {}, other: {} };
    const unsub = (t, n) => {
        let s = subs[t][n];
        if (s) {
            Array.isArray(s) ? s.forEach(b => b.unsubscribe()) : s.unsubscribe();
            delete subs[t][n];
        }
    };
    return {
        onTap(obj) {
            const n = !obj ? '_EMPTY_' : obj.name;
            unsub('t', n);
            subs.tap[n] = !obj ? TG.onTap() : TG.onTap(obj);
            return subs.tap[n];
        },
        onPan(obj) {
            const n = !obj ? '_EMPTY_' : obj.name;
            unsub('p', n);
            subs.pan[n] = !obj ? TG.onPan() : TG.onPan(obj);
            return subs.pan[n];
        },
        onRotate(obj) {
            const n = !obj ? '_EMPTY_' : obj.name;
            unsub('r', n);
            subs.pan[n] = !obj ? TG.onRotate() : TG.onRotate(obj);
            return subs.pan[n];
        },
        onLongPress(obj) {
            const n = !obj ? '_EMPTY_' : obj.name;
            unsub('lp', n);
            subs.pan[n] = !obj ? TG.onLongPress() : TG.onLongPress(obj);
            return subs.pan[n];
        },
        subscribe(n, s) {
            unsub('o', n);
            subs.other[n] = s;
        },
        unsubscribe(t, n) {
            unsub(t, n);
        },
        subscribeToList(n, a) {
            const list = subs.other[n] || [];
            if (!Array.isArray(list)) {
                DS.log(`Name "${n}" already subscribed`);
                return;
            }
            list.push(...toArray(a));
        },
        unsubscribeList(n) {
            unsub('other', n);
        },
    };
}