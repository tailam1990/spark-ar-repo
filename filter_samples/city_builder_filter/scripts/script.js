const AN = require('Animation');
const TG = require('TouchGestures');
const CI = require('CameraInfo');
const RT = require('Reactive');
const DS = require('Diagnostics')
const IS = require('Instruction');
const ML = require('Materials');
const SH = require('Shaders');
const TX = require('Textures');
const PE = require('Patches');
const PS = require('Persistence');
const { alphaBlend, iRange, watchToString } = require('./common');
const PT = find('planeTracker0');

/*
    TODO:
    - Find models/textures
    - UI
        - particle pop up from save/load buttons
        - replace text with icons
    - Building placement
        - rotate building
    - Cars
    - Weather
    - Day / night cycle
    - First / Third person camera
*/

const GRID_SIZE = 13;   // Odd number only
const POLLING_MS = 100;

const GRID_SIZE_2 = RT.floor(GRID_SIZE / 2);
const screenScale = PE.getScalarValue('screenScale');
const screenWidth = CI.previewSize.width.div(screenScale);
const screenHeight = CI.previewSize.height.div(screenScale);

const GameStates = {
    INIT: 0,
    BUILD: 1,
};
const BlockType = {
    NONE: 100,
    ROAD: 101,
    BUILDING: 102,
};
const RoadType = {
    N: 1,
    E: 2,
    S: 4,
    W: 8,
    NS: 5,
    EW: 10
};
const IntersectionType = {
    NW: RoadType.W + RoadType.N,
    NE: RoadType.E + RoadType.N,
    SW: RoadType.W + RoadType.S,
    SE: RoadType.E + RoadType.S,
    NWE: RoadType.W + RoadType.N + RoadType.E,
    NSE: RoadType.S + RoadType.N + RoadType.E,
    SWE: RoadType.S + RoadType.W + RoadType.E,
    NSW: RoadType.N + RoadType.S + RoadType.W,
    NSEW: RoadType.N + RoadType.S + RoadType.W + RoadType.E,
};
const CursorState = {
    REMOVE: 200,
    INVALID: 201,
    VALID: 202,
};
const EditMode = {
    SETTINGS: 300,
    ROAD: 301,
    BUILDING: 302,
    REMOVE: 303,
};
const intersectionTypeList = Object.keys(IntersectionType).map(k => IntersectionType[k]);
const editModeList = [EditMode.SETTINGS, EditMode.ROAD, EditMode.BUILDING, EditMode.REMOVE];

// Material / texture constants
const UV = SH.fragmentStage(SH.vertexAttribute({ variableName: 'TEX_COORDS' }));
const mRoad = ML.get('m_road');                 // Horizontal, vertical, 4 way intersection
const mRoad2 = ML.get('m_road2');               // 2, 3 way intersection
const mGround = ML.get('m_ground');
const mGroundOverlay = ML.get('m_ground_overlay');
const mCursor = ML.get('m_cursor');
const mGhost = ML.get('m_ghost');
const mCube = ML.get('m_cube');
const mSaveLoadText = ML.get('m_ui_saveload_text');

const txRoadHSignal = TX.get('roadEW').signal;
const txRoadVSignal = TX.get('roadNS').signal;
const txRoadNWSignal = TX.get('roadNW').signal;
const txRoadNESignal = TX.get('roadNE').signal;
const txRoadSWSignal = TX.get('roadSW').signal;
const txRoadSESignal = TX.get('roadSE').signal;
const txRoadNEWSignal = TX.get('roadNEW').signal;
const txRoadSEWSignal = TX.get('roadSEW').signal;
const txRoadNSWSignal = TX.get('roadNSW').signal;
const txRoadNSESignal = TX.get('roadNSE').signal;
const txRoad4Signal = TX.get('roadNSEW').signal;

// Grid occupancy map
let gridMap = iRange(GRID_SIZE).map(_ => iRange(GRID_SIZE).map(_ => ({ type: BlockType.NONE, subType: 0, data: null })));

const Signals = new SignalProxy(iRange(3).map(i => find(`signals/signal${i}`)), ['screenX', 'screenZ', 'cursorCol', 'cursorRow', 'savedCol', 'savedRow', 'state', 'isDrag', 'cursorState', 'editMode', 'type', 'subType', 'hasSave0', 'hasSave1', 'hasSave2']);
const pollDriver = timeDriver(POLLING_MS, Infinity);
const ground = find('ground').transform;
const scene = find('scene');
const groundOverlay = find('ground_overlay');
const gridOverlay = find('grid_overlay');
const cursorStart = find('cursor_start');
const cursorMid = find('cursor_mid');
const cursorEnd = find('cursor_end');
const txtInfo = find('txt_info');
const canvasSafe = find('canvas_safe');
const cursorUI = find('cursor_ui');
const sceneUI = find('scene_ui');

// Building configurations
const buildingTypes = [{
    name: 'type0',                  // Name of building parent object containing the list of building objects in scene
    size: { x: 3, y: 5, z: 2 },     // Scale of the building object, relative to the cube object
    material: mCube,                // Material of the building object
}, {
    name: 'type1',
    size: { x: 2, y: 3, z: 1 },
    material: mCube,
}];
const buildingList = buildingTypes.map((t, ti) => iRange(4).map(i => new Building(ti, `${t.name}/building${i}`, t.size, t.material)));

let buildingQueue = [];
let placedBuildingList = [];
let currentBuilding = null;

const blockScale = ground.scaleX.div(10).div(GRID_SIZE);                                // 2D plane scale of each block in the grid
const gridCursorPosition = gridToWorldPosition(Signals.cursorRow, Signals.cursorCol);   // Grid snapped cursor world position

let screenCenter = null;
let screenCenterDist = Infinity;

// UI containers
const uiList = [
    find('settings_ui'),
    find('road_ui'),
    find('buildings_ui'),
    find('remove_ui'),
].map(ui => {
    const driver = timeDriver(250);
    ui.transform.x = AN.animate(driver, AN.samplers.easeOutQuad(.36, 0));
    ui.hidden = ui.transform.x.ge(.35);
    return { obj: ui, driver };
});

// Cursor transforms
const mapScaleOffset = ground.scaleX.div(20);
const screenCol = RT.clamp(Signals.screenX.add(mapScaleOffset).mul(GRID_SIZE).floor(), 0, GRID_SIZE - 1);
const screenRow = RT.clamp(Signals.screenZ.add(mapScaleOffset).mul(GRID_SIZE).floor(), 0, GRID_SIZE - 1);
Signals.cursorCol = screenCol;
Signals.cursorRow = screenRow;
cursorStart.transform.position = gridToWorldPosition(Signals.savedRow, Signals.savedCol);
cursorEnd.transform.x = Signals.cursorCol.sub(GRID_SIZE_2).mul(blockScale);
cursorEnd.transform.z = Signals.cursorRow.sub(GRID_SIZE_2).mul(blockScale);
cursorMid.transform.position = toPoint(cursorEnd.transform.position.add(cursorStart.transform.position).div(2));

const cursorScale = ground.scaleX.div(GRID_SIZE);
cursorEnd.transform.scale = RT.scale(cursorScale, cursorScale, cursorScale);
cursorStart.transform.scale = cursorEnd.transform.scale;
cursorMid.transform.scaleX = Signals.cursorCol.sub(Signals.savedCol).abs().add(1).mul(cursorScale);
cursorMid.transform.scaleY = Signals.cursorRow.sub(Signals.savedRow).abs().add(1).mul(cursorScale);

cursorUI.transform.x = Signals.screenX.expSmooth(100);
cursorUI.transform.z = Signals.screenZ.expSmooth(100);

scene.hidden = Signals.state.ne(GameStates.BUILD);
canvasSafe.hidden = CI.isCapturingPhoto.or(CI.isRecordingVideo);
cursorStart.hidden = Signals.isDrag.eq(0);
cursorMid.hidden = cursorStart.hidden;
cursorUI.hidden = cursorUI.transform.x.abs().lt(.52).and(cursorUI.transform.z.abs().lt(.52));
cursorEnd.hidden = cursorUI.hidden.not();
sceneUI.hidden = Signals.state.ne(GameStates.BUILD);
groundOverlay.hidden = cursorEnd.hidden;
gridOverlay.hidden = Signals.state.ne(GameStates.INIT);

// Initialize settings
Signals.editMode = EditMode.SETTINGS;

IS.bind(
    Signals.state.eq(GameStates.INIT).or(CI.captureDevicePosition.eq('FRONT')),
    CI.captureDevicePosition.eq('FRONT').ifThenElse('flip_camera', 'tap_to_place')
);

// Initialize building list and placement queue
buildingList.forEach(buildingType => {
    // Rescale buildings model based on grid size
    buildingType.forEach(b => {
        b.obj.transform.scaleX = blockScale.mul(b.size.x);
        b.obj.transform.scaleY = blockScale.mul(b.size.y);
        b.obj.transform.scaleZ = blockScale.mul(b.size.z);
        b.obj.transform.y = b.obj.transform.scaleY.div(2);
    });
    // Add building list to queue
    buildingQueue.push(buildingType.slice());
});

// Signal based shaders
drawMap();
drawRoad();
drawCenterOverlay();
drawCursor();

pollDriver.onAfterIteration().subscribe(() => {
    let p = PT.hitTest(screenCenter);
    if (p) {
        Signals.screenX = p.x;
        Signals.screenZ = p.z;
    }
});

// TODO: REMOVE - Building selector
const buildingSelector = find('building_selector');
const buildingIndex = horizontalSlider(buildingSelector, screenScale, 2, 60);
buildingSelector.hidden = Signals.editMode.ne(EditMode.BUILDING);
buildingIndex.monitor({ fireOnInitialValue: true }).subscribe(e => {
    let oldBuilding = e.oldValue != null ? buildingQueue[e.oldValue][0] : null;
    if (oldBuilding) {
        oldBuilding.obj.hidden = true;
    }
    currentBuilding = buildingQueue[e.newValue][0];
    if (currentBuilding) {
        startPlaceBuilding(currentBuilding);
    }
});

// FIXME: TEST ONLY
const DEBUG = true;
if (DEBUG) {
    let isDrawRoad = false;
    let isDelete = false;
    TG.onTap().subscribeWithSnapshot({
        gameState: Signals.state,
        editMode: Signals.editMode,
    }, (_, s) => {
        if (s.gameState === GameStates.BUILD) {
            if (s.editMode === EditMode.ROAD) {
                isDrawRoad = !isDrawRoad;
                isDrawRoad ? startPlaceRoad() : endPlaceRoad();
            } else if (s.editMode === EditMode.REMOVE) {
                isDelete = !isDelete;
                isDelete ? startRemove() : endRemove();
            }
        }
    });
} else {
    TG.onLongPress().subscribeWithSnapshot({
        gameState: Signals.state,
        editMode: Signals.editMode,
    }, (e, s) => {
        if (s.gameState === GameStates.BUILD) {
            if (s.editMode === EditMode.ROAD) {
                startPlaceRoad();
                e.state.eq('ENDED').onOn().subscribe(endPlaceRoad);
            } else if (s.editMode === EditMode.REMOVE) {
                startRemove();
                e.state.eq('ENDED').onOn().subscribe(endRemove);
            }
        }
    });
}

// Screen tap handler
TG.onTap().subscribeWithSnapshot({
    gameState: Signals.state,
    editMode: Signals.editMode,
    cursorState: Signals.cursorState,
    cursorRow: Signals.cursorRow,
    cursorCol: Signals.cursorCol,
    screenWidth, 
    screenHeight, 
    buildingIndex,
}, (e, s) => {
    // This is a workaround to create an instance of the immutable point2D type for use in placeTracker.hitTest() that is otherwise unobtainable
    // Updates the screen center position if new tap position's distance from center is less than before
    // Stops updating position if distance is less than 50, which is close enough
    let newScreenCenterDist = dist2d({ x: s.screenWidth, y: s.screenHeight }, e.location);
    if (screenCenterDist > 50 && (screenCenter == null || screenCenterDist > newScreenCenterDist)) {
        screenCenter = e.location;
        screenCenterDist = newScreenCenterDist;
    }
    // Tap to place scene on initialization
    // Tap to place building when editMode = BUILDING
    if (s.gameState === GameStates.INIT) {
        PT.trackPoint(e.location);
        Signals.state = GameStates.BUILD;
        pollDriver.start();
        // uiList[0].driver.start();
    } else if (s.gameState === GameStates.BUILD) {
        if (s.editMode === EditMode.BUILDING && currentBuilding != null) {
            if (s.cursorState === CursorState.VALID) {
                placeBuilding(currentBuilding, s.cursorRow, s.cursorCol);

                // Next building
                currentBuilding = buildingQueue[s.buildingIndex][0];
                if (currentBuilding != null) {
                    startPlaceBuilding(currentBuilding);
                }
            }
        }
    }
});

// Road / building placement validation
RT.monitorMany({
    isDrag: Signals.isDrag,
    editMode: Signals.editMode,
    savedRow: Signals.savedRow,
    savedCol: Signals.savedCol,
    cursorRow: Signals.cursorRow,
    cursorCol: Signals.cursorCol
}, { fireOnInitialValue: true }).subscribe(({ newValues: s }) => {
    // Cursor info display
    let cursorBlock = getBlock(s.cursorRow, s.cursorCol);
    if (cursorBlock) {
        Signals.type = cursorBlock.type;
        Signals.subType = cursorBlock.subType || 0;
    }

    if (s.editMode === EditMode.ROAD) {
        if (!s.isDrag) {
            return;
        }
        for (let r = Math.min(s.savedRow, s.cursorRow); r <= Math.max(s.savedRow, s.cursorRow); r++) {
            for (let c = Math.min(s.savedCol, s.cursorCol); c <= Math.max(s.savedCol, s.cursorCol); c++) {
                let block = getBlock(r, c);
                if (!block || (block.type !== BlockType.NONE && block.type !== BlockType.ROAD)) {
                    Signals.cursorState = CursorState.INVALID;
                    return;
                }
            }
        }
        Signals.cursorState = CursorState.VALID;
    } else if (s.editMode === EditMode.BUILDING) {
        if (currentBuilding != null) {
            for (let r = s.cursorRow + currentBuilding.offsets.row1; r <= s.cursorRow + currentBuilding.offsets.row2; r++) {
                for (let c = s.cursorCol + currentBuilding.offsets.col1; c <= s.cursorCol + currentBuilding.offsets.col2; c++) {
                    let block = getBlock(r, c);
                    if (!block || block.type !== BlockType.NONE) {
                        Signals.cursorState = CursorState.INVALID;
                        return;
                    }
                }
            }
        }
        Signals.cursorState = CursorState.VALID;
    }
});

// ========================================
// UI Tabs
// ========================================

['settings', 'road', 'building', 'remove'].forEach((n, i) => {
    const tab = new SceneUIButton(find(`tabs/${n}`));
    const hoverDriver = timeDriver(300);
    let hoverDriverInf = timeDriver(300);
    drawSceneUIButton(AN.animate(hoverDriver, AN.samplers.linear(0, 1)), tab.obj.material);
    tab.onHover = () => {
        hoverDriver.start();
        hoverDriverInf.start();
        Signals.editMode = editModeList[i];
    }
    tab.onHoverLeave = () => {
        hoverDriver.reverse();
        hoverDriverInf.reset();
        hoverDriverInf.stop();
    }
    tab.onTap = () => Signals.editMode = editModeList[i];
    
    if (n === 'settings') {
        hoverDriverInf = timeDriver(1000, Infinity);
        tab.obj.child('plane0').transform.rotationZ = AN.animate(hoverDriverInf, AN.samplers.linear(0, -Math.PI * 2));
    } else if (n === 'road') {
        hoverDriverInf = timeDriver(200, Infinity, true);
        tab.obj.child('plane0').transform.y = AN.animate(hoverDriverInf, AN.samplers.linear(-.0025, .0025));
    }
});

Signals.editMode.monitor({ fireOnInitialValue: true }).subscribe(e => {
    let oldUI = uiList[editModeList.indexOf(e.oldValue)];
    let newUI = uiList[editModeList.indexOf(e.newValue)];
    if (oldUI != null) oldUI.driver.reverse();
    if (newUI != null) newUI.driver.start();

    resetEditState();

    if (e.newValue === EditMode.BUILDING) {
        currentBuilding = buildingQueue[buildingIndex.pinLastValue()][0];
        if (currentBuilding) {
            startPlaceBuilding(currentBuilding);
        }
    }
});

// Save / load logics
const saveLoadDriver = timeDriver(1000);
const isSaveLoading = saveLoadDriver.isRunning().not().not();       // Workaround for pinLastValue() to work
const canvasSaveLoad = find('canvas_saveload');
const txtSaveLoad = canvasSaveLoad.child('txt_saveload');

drawSaveLoadText(AN.animate(saveLoadDriver, AN.samplers.easeOutQuad(0, 1)));

// Save slots
for (let i = 0; i < 3; i++) {
    const sceneButton = new SceneUIButton(find(`btn_saveslot${i}`));
    const hoverDriver = timeDriver(300);
    drawSceneUIButton(AN.animate(hoverDriver, AN.samplers.linear(0, 1)), ML.get(`m_ui_saveslot${i}`));
    sceneButton.onTap = () => {
        if (!isSaveLoading.pinLastValue()) {
            canvasSaveLoad.transform.z = -0.36 + i * .13;
            txtSaveLoad.text = 'Saved';
            saveLoadDriver.reset();
            saveLoadDriver.start();
            Signals[`hasSave${i}`] = 1;
            exportToSlot(i);
        }
    };
    sceneButton.onHover = () => hoverDriver.start();
    sceneButton.onHoverLeave = () => hoverDriver.reverse();
}

// Load slots
for (let i = 0; i < 3; i++) {
    const sceneButton = new SceneUIButton(find(`btn_loadslot${i}`));
    const hoverDriver = timeDriver(300);

    // Check load slots
    checkLoadSlot(i, hasSave => Signals[`hasSave${i}`] = hasSave ? 1 : 0);
    drawSceneUIButton(AN.animate(hoverDriver, AN.samplers.linear(0, 1)), ML.get(`m_ui_loadslot${i}`), Signals[`hasSave${i}`]);

    // Tap to load
    sceneButton.onTap = () => {
        if (!isSaveLoading.pinLastValue() && Signals[`hasSave${i}`].pinLastValue() > 0) {
            canvasSaveLoad.transform.z = .16 + i * .13;
            txtSaveLoad.text = 'Loaded';
            saveLoadDriver.reset();
            saveLoadDriver.start();
            importFromSlot(i);
        }
    };
    sceneButton.onHover = () => hoverDriver.start();
    sceneButton.onHoverLeave = () => hoverDriver.reverse();
}

function checkLoadSlot(i, cb) {
    PS.userScope.get(`tl_saved_map${i}`).then(r => {
        cb(r != null);
    }).catch(() => {
        cb(false);
    });
}

function drawSaveLoadText(progress) {
    const p = progress.mul(2);
    const a = RT.min(RT.step(p, RT.sub(1, UV.x)), RT.sub(4, p.mul(p)));
    const col = RT.pack4(1, 1, 1, a);
    mSaveLoadText.setTexture(col, { textureSlotName: SH.DefaultMaterialTextures.DIFFUSE });
}

function drawSceneUIButton(progress, material, enabled = RT.val(1)) {
    const color = RT.mix(
        RT.pack4(.5, .5, .5, .8),
        RT.mix(
            SH.colorSpaceConvert(RT.pack4(.5, 1, .7, .5), { inColorSpace: 'HSV', outColorSpace: 'RGB' }),
            SH.colorSpaceConvert(RT.pack4(.5, 1, 1, .8), { inColorSpace: 'HSV', outColorSpace: 'RGB' }),
            progress
        ),
        enabled
    );
    material.setTexture(color, { textureSlotName: SH.DefaultMaterialTextures.DIFFUSE });
}

function SceneUIButton(btn) {
    const halfWidth = btn.transform.scaleX.div(20);
    const halHeight = btn.transform.scaleY.div(20);
    const x = btn.transform.x;
    const z = btn.transform.z;
    const isHover = RT.min(between(cursorUI.transform.x, x.sub(halfWidth), x.add(halfWidth)), between(cursorUI.transform.z, z.sub(halHeight), z.add(halHeight)));

    this.onTap = () => { };
    this.onHover = () => { };
    this.onHoverLeave = () => { };
    this.obj = btn;

    isHover.monitor({ fireOnInitialValue: true }).subscribe(e => {
        e.newValue > 0 ? this.onHover() : this.onHoverLeave();
    });

    TG.onTap().subscribeWithSnapshot({ isHover, hidden: btn.hidden }, (_, s) => {
        if (this.onTap && s.isHover > 0 && !s.hidden) {
            this.onTap();
        }
    });
    TG.onTap(btn).subscribe(this.onTap);
}

function getDragState() {
    let dc = Signals.cursorCol.pinLastValue() - Signals.savedCol.pinLastValue();
    let dr = Signals.cursorRow.pinLastValue() - Signals.savedRow.pinLastValue();
    let col1 = dc > 0 ? Signals.savedCol.pinLastValue() : Signals.cursorCol.pinLastValue();
    let col2 = dc > 0 ? Signals.cursorCol.pinLastValue() : Signals.savedCol.pinLastValue();
    let row1 = dr > 0 ? Signals.savedRow.pinLastValue() : Signals.cursorRow.pinLastValue();
    let row2 = dr > 0 ? Signals.cursorRow.pinLastValue() : Signals.savedRow.pinLastValue();
    return { row1, row2, col1, col2 };
}

function startRemove() {
    Signals.savedCol = Signals.cursorCol.pinLastValue();
    Signals.savedRow = Signals.cursorRow.pinLastValue();
    Signals.isDrag = 1;
}

function endRemove() {
    let ds = getDragState();
    let hasRoad = false;
    for (let r = ds.row1; r <= ds.row2; r++) {
        for (let c = ds.col1; c <= ds.col2; c++) {
            let block = getBlock(r, c);
            if (block.data && block.type === BlockType.BUILDING) {
                removeBuilding(block.data);
            }
            if (block.type === BlockType.ROAD) {
                hasRoad = true;
            }
            block.data = null;
            block.type = BlockType.NONE;
            block.subType = 0;
        }
    }
    if (hasRoad) {
        updateRoad();
    }
    Signals.isDrag = 0;
}

function startPlaceRoad() {
    Signals.savedCol = Signals.cursorCol.pinLastValue();
    Signals.savedRow = Signals.cursorRow.pinLastValue();
    Signals.isDrag = 1;

    let isHorizontal = Signals.savedCol.sub(screenCol).abs().gt(Signals.savedRow.sub(screenRow).abs());
    Signals.cursorRow = isHorizontal.ifThenElse(Signals.savedRow, screenRow);
    Signals.cursorCol = isHorizontal.ifThenElse(screenCol, Signals.savedCol);
}

function endPlaceRoad() {
    if (Signals.cursorState.pinLastValue() === CursorState.VALID) {
        let ds = getDragState();
        for (let r = ds.row1; r <= ds.row2; r++) {
            for (let c = ds.col1; c <= ds.col2; c++) {
                gridMap[r][c].type = BlockType.ROAD;
            }
        }
        updateRoad();
    }
    resetEditState();
}

function startPlaceBuilding(building) {
    if (building) {
        building.followCursor();
        building.useGhostMaterial();
        building.show();
    } else {

    }
}

function removeBlock(block) {
    block.type = BlockType.NONE;
    block.subType = 0;
    if (block.data && block.data.obj) {
        block.data.obj.hidden = true;
    }
    block.data = null;
}

function removeBuilding(building) {
    // Reset occupied block status in grid
    for (let r = building.row + building.offsets.row1; r <= building.row + building.offsets.row2; r++) {
        for (let c = building.col + building.offsets.col1; c <= building.col + building.offsets.col2; c++) {
            removeBlock(gridMap[r][c]);
        }
    }
    // Restore removed building to building queue
    buildingQueue[building.typeIdx].push(building);
    // Remove from export list
    let idx = findIndex(placedBuildingList, b => b.typeIdx === building.typeIdx);
    if (idx > -1) {
        placedBuildingList.splice(idx, 1);
    }
}

function placeBuilding(building, row, col) {
    // Update gridMap status
    for (let r = row + building.offsets.row1; r <= row + building.offsets.row2; r++) {
        for (let c = col + building.offsets.col1; c <= col + building.offsets.col2; c++) {
            let block = gridMap[r][c];
            block.type = BlockType.BUILDING;
            block.data = building;
        }
    }
    // Remove building from queue
    let idx = findIndex(buildingQueue[building.typeIdx], b => b.name === building.name);
    if (idx > -1) {
        buildingQueue[building.typeIdx].splice(idx, 1);
    }
    // Place at cursor position and restore original material
    building.placeAt(row, col);
    building.show();
    building.restoreMaterial();
    placedBuildingList.push({ typeIdx: building.typeIdx, row: building.row, col: building.col });
}

function getBuildingOffset(buildingSize) {
    let r = (buildingSize.z - 1) / 2;
    let c = (buildingSize.x - 1) / 2;
    return {
        row1: -Math.floor(r),
        row2: Math.ceil(r),
        col1: -Math.floor(c),
        col2: Math.ceil(c)
    };
}

function getRoadState() {
    let iList = [];
    let hList = [];
    let vList = [];

    // Horizontal pass
    for (let r = 0; r < GRID_SIZE; r++) {
        let firstCol = -1;
        for (let c = 0; c <= GRID_SIZE; c++) {
            let road = getBlock(r, c, BlockType.ROAD);
            if (road) {
                if (firstCol < 0) {
                    firstCol = c;
                }
                road.subType = getIntersectionType(r, c);
                if (intersectionTypeList.indexOf(road.subType) > -1) {
                    iList.push({ row: r, col: c, type: road.subType });
                }
            } else if (firstCol >= 0) {
                if (c - firstCol >= 2) {
                    hList.push({ p1: { row: r, col: firstCol }, p2: { row: r, col: c - 1 } });
                }
                firstCol = -1;
            }
        }
    }

    // Vertical pass
    for (let c = 0; c < GRID_SIZE; c++) {
        let firstRow = -1;
        for (let r = 0; r <= GRID_SIZE; r++) {
            let road = getBlock(r, c, BlockType.ROAD);
            if (road) {
                if (firstRow < 0) {
                    firstRow = r;
                }
            } else if (firstRow >= 0) {
                if (r - firstRow >= 2) {
                    vList.push({ p1: { row: firstRow, col: c }, p2: { row: r - 1, col: c } });
                } else {
                    // 1 block road
                    let b = gridMap[r - 1][c];
                    if (b.subType === 0) {
                        b.subType = RoadType.NS;
                        vList.push({ p1: { row: firstRow, col: c }, p2: { row: firstRow, col: c } });
                    }
                }
                firstRow = -1;
            }
        }
    }

    return {
        horizontal: hList,
        vertical: vList,
        intersection: iList
    };
}

function resetMap() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            removeBlock(gridMap[r][c]);
        }
    }
    buildingQueue = [];
    placedBuildingList = [];
    buildingList.forEach(buildingType => {
        buildingQueue.push(buildingType.slice());
        buildingType.forEach(b => b.hide());
    });
    updateRoad();
}

function importFromSlot(i) {
    PS.userScope.get(`tl_saved_map${i}`).then(r => {
        importMap(r);
    }).catch(ex => {
        DS.log(ex);
    });
}

function importMap(m) {
    try {
        DS.log(m);
        resetMap();
        m.roads.forEach(road => {
            for (let r = road.p1.row; r <= road.p2.row; r++) {
                for (let c = road.p1.col; c <= road.p2.col; c++) {
                    gridMap[r][c].type = BlockType.ROAD;
                }
            }
        });
        m.buildings.forEach(building => {
            let b = buildingQueue[building.typeIdx].pop();
            if (b != null) {
                placeBuilding(b, building.row, building.col);
            }
        });
        updateRoad();
    } catch (ex) {
        DS.log(ex);
    }
}

function exportToSlot(i, cb = () => { }) {
    PS.userScope.set(`tl_saved_map${i}`, exportMap()).then(r => {
        DS.log('Saved ' + i);
        cb();
    }).catch(ex => {
        DS.log(ex);
    });
}

function exportMap() {
    let roadStates = getRoadState();
    return {
        roads: roadStates.horizontal.concat(roadStates.vertical),
        buildings: placedBuildingList,
    }
}

function resetEditState() {
    Signals.isDrag = 0;
    Signals.cursorState = CursorState.VALID;
    Signals.cursorRow = screenRow;
    Signals.cursorCol = screenCol;

    buildingQueue.forEach(bl => {
        bl.forEach(b => b.hide());
    });
}

function getBlock(r, c, t) {
    if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
        let block = gridMap[r][c];
        return t == null || block.type === t ? block : null;
    }
    return null;
}

function getIntersectionType(r, c) {
    let t = 0;
    t += getBlock(r - 1, c, BlockType.ROAD) != null ? RoadType.N : 0;
    t += getBlock(r + 1, c, BlockType.ROAD) != null ? RoadType.S : 0;
    t += getBlock(r, c - 1, BlockType.ROAD) != null ? RoadType.W : 0;
    t += getBlock(r, c + 1, BlockType.ROAD) != null ? RoadType.E : 0;
    return t;
}

function gridToWorldPosition(row, col) {
    return RT.point(
        RT.sub(col, GRID_SIZE_2).mul(blockScale),
        RT.val(0),
        RT.sub(row, GRID_SIZE_2).mul(blockScale)
    );
}

function updateRoad() {
    const roadLists = getRoadState();
    drawRoad(roadLists.horizontal, roadLists.vertical, roadLists.intersection);
}

function drawCenterOverlay() {
    const radius = RT.val(.2);
    const uvm = fract(UV.mul(GRID_SIZE));
    const uvn = UV.mul(2).sub(1).div(2);
    const aGrid = RT.smoothStep(uvm.sub(.5).abs(), .46, .5);
    const aCursor = RT.smoothStep(uvn.sub(RT.pack2(gridCursorPosition.x, gridCursorPosition.z)).magnitude(), radius, 0);
    const a = aCursor.mul(RT.max(aGrid.x, aGrid.y));
    mGroundOverlay.setTexture(RT.pack4(1, 1, 1, a), { textureSlotName: SH.DefaultMaterialTextures.DIFFUSE });
}

function drawCursor() {
    const driver = AN.timeDriver({ durationMilliseconds: 1000, loopCount: Infinity, mirror: true });
    const a = AN.animate(driver, AN.samplers.linear(.25, .5));
    const c = RT.mix(
        RT.pack4(.3, .9, .9, a),
        RT.pack4(1, 0, 0, a),
        Signals.cursorState.eq(CursorState.INVALID).and(Signals.isDrag.eq(1).or(Signals.editMode.eq(EditMode.BUILDING))).ifThenElse(1, 0),
    );
    driver.start();
    mCursor.setTexture(c, { textureSlotName: SH.DefaultMaterialTextures.DIFFUSE });
    mGhost.setTexture(c, { textureSlotName: SH.DefaultMaterialTextures.DIFFUSE });
}

function drawMap() {
    const uvm = UV.mul(GRID_SIZE).floor().div(GRID_SIZE);
    const c = RT.pack4(uvm.x, uvm.y, 0, 1);
    mGround.setTexture(c, { textureSlotName: SH.DefaultMaterialTextures.DIFFUSE });
}

function drawRoad(hList = [], vList = [], iList = []) {
    const uvm = UV.mul(GRID_SIZE);
    const uvGrid = uvm.floor();
    const uvTile = fract(uvm);

    // Horizontal / vertical
    const txRoadH = SH.textureSampler(txRoadHSignal, uvTile);
    const txRoadV = SH.textureSampler(txRoadVSignal, uvTile);
    const ah = hList.reduce((s, c) => RT.max(s, RT.min(between(uvGrid.x, c.p1.col, c.p2.col), between(uvGrid.y, c.p1.row))), 0);
    const av = vList.reduce((s, c) => RT.max(s, RT.min(between(uvGrid.y, c.p1.row, c.p2.row), between(uvGrid.x, c.p1.col))), 0);
    const roadHColor = RT.pack4(txRoadH.x, txRoadH.y, txRoadH.z, ah);
    const roadVColor = RT.pack4(txRoadV.x, txRoadV.y, txRoadV.z, av);

    // Turn
    const txRoadNW = SH.textureSampler(txRoadNWSignal, uvTile);
    const txRoadNE = SH.textureSampler(txRoadNESignal, uvTile);
    const txRoadSW = SH.textureSampler(txRoadSWSignal, uvTile);
    const txRoadSE = SH.textureSampler(txRoadSESignal, uvTile);
    const aul = iList.filter(r => r.type === IntersectionType.NW).reduce((s, c) => RT.max(s, RT.min(between(uvGrid.y, c.row), between(uvGrid.x, c.col))), 0);
    const aur = iList.filter(r => r.type === IntersectionType.NE).reduce((s, c) => RT.max(s, RT.min(between(uvGrid.y, c.row), between(uvGrid.x, c.col))), 0);
    const adl = iList.filter(r => r.type === IntersectionType.SW).reduce((s, c) => RT.max(s, RT.min(between(uvGrid.y, c.row), between(uvGrid.x, c.col))), 0);
    const adr = iList.filter(r => r.type === IntersectionType.SE).reduce((s, c) => RT.max(s, RT.min(between(uvGrid.y, c.row), between(uvGrid.x, c.col))), 0);
    const roadNEColor = RT.pack4(txRoadNE.x, txRoadNE.y, txRoadNE.z, aur);
    const roadNWColor = RT.pack4(txRoadNW.x, txRoadNW.y, txRoadNW.z, aul);
    const roadSEColor = RT.pack4(txRoadSE.x, txRoadSE.y, txRoadSE.z, adr);
    const roadSWColor = RT.pack4(txRoadSW.x, txRoadSW.y, txRoadSW.z, adl);

    // 3 way intersection
    const txRoadNWE = SH.textureSampler(txRoadNEWSignal, uvTile);
    const txRoadSWE = SH.textureSampler(txRoadSEWSignal, uvTile);
    const txRoadNSW = SH.textureSampler(txRoadNSWSignal, uvTile);
    const txRoadNSE = SH.textureSampler(txRoadNSESignal, uvTile);
    const aNWE = iList.filter(r => r.type === IntersectionType.NWE).reduce((s, c) => RT.max(s, RT.min(between(uvGrid.y, c.row), between(uvGrid.x, c.col))), 0);
    const aSWE = iList.filter(r => r.type === IntersectionType.SWE).reduce((s, c) => RT.max(s, RT.min(between(uvGrid.y, c.row), between(uvGrid.x, c.col))), 0);
    const aNSE = iList.filter(r => r.type === IntersectionType.NSE).reduce((s, c) => RT.max(s, RT.min(between(uvGrid.y, c.row), between(uvGrid.x, c.col))), 0);
    const aNSW = iList.filter(r => r.type === IntersectionType.NSW).reduce((s, c) => RT.max(s, RT.min(between(uvGrid.y, c.row), between(uvGrid.x, c.col))), 0);
    const roadNWEColor = RT.pack4(txRoadNWE.x, txRoadNWE.y, txRoadNWE.z, aNWE);
    const roadSWEColor = RT.pack4(txRoadSWE.x, txRoadSWE.y, txRoadSWE.z, aSWE);
    const roadNSEColor = RT.pack4(txRoadNSE.x, txRoadNSE.y, txRoadNSE.z, aNSE);
    const roadNSWColor = RT.pack4(txRoadNSW.x, txRoadNSW.y, txRoadNSW.z, aNSW);

    // 4 way intersection
    const txRoad4 = SH.textureSampler(txRoad4Signal, uvTile);
    const a4 = iList.filter(r => r.type === IntersectionType.NSEW).reduce((s, c) => RT.max(s, RT.min(between(uvGrid.y, c.row), between(uvGrid.x, c.col))), 0);
    const road4Color = RT.pack4(txRoad4.x, txRoad4.y, txRoad4.z, a4);

    const col = alphaBlend([
        roadNWEColor,
        roadSWEColor,
        roadNSEColor,
        roadNSWColor,
        roadNEColor,
        roadNWColor,
        roadSEColor,
        roadSWColor,
    ]);
    const col2 = alphaBlend([
        road4Color,
        roadHColor,
        roadVColor,
    ]);

    // A limit of 8 combined textures for texture signal, splitted road textures into two materials
    mRoad.setTexture(col, { textureSlotName: SH.DefaultMaterialTextures.DIFFUSE });
    mRoad2.setTexture(col2, { textureSlotName: SH.DefaultMaterialTextures.DIFFUSE });
}

function Building(typeIdx, name, size, material) {
    this.typeIdx = typeIdx;
    this.obj = find(name);
    this.name = name;
    this.size = size;
    this.offsets = getBuildingOffset(size);
    this.material = material;
    this.row = -1;
    this.col = -1;
    let model = this.obj.child('model');
    this.hide = () => this.obj.hidden = true;
    this.show = () => this.obj.hidden = false;
    this.useGhostMaterial = () => model.material = mGhost;
    this.restoreMaterial = () => model.material = this.material;
    this.followCursor = () => this.placeAt(Signals.cursorRow, Signals.cursorCol);
    this.placeAt = (row, col) => {
        let position = gridToWorldPosition(row, col);
        this.row = row;
        this.col = col;
        this.obj.transform.x = this.size.x % 2 === 0 ? position.x.add(blockScale.mul(this.size.x).div(4)) : position.x;
        this.obj.transform.z = this.size.z % 2 === 0 ? position.z.add(blockScale.mul(this.size.z).div(4)) : position.z;
    };
}

// function rotateUV(uv, angle) {
//     let sin = Math.sin(angle);
//     let cos = Math.cos(angle);
//     let uvn = uv.sub(.5);
//     return RT.pack2(
//         uvn.x.mul(cos).sub(uvn.y.mul(sin)),
//         uvn.x.mul(sin).add(uvn.y.mul(cos)),
//     ).add(.5);
// }

function toPoint(s) {
    return RT.point(s.x, s.y, s.z);
}

function horizontalSlider(cont, scale, count, spacing, options = {}) {
    const initialIndex = +options.initialIndex || 0;
    const container = cont.transform;
    const indicator = cont.child('indicator').transform;
    const driver = timeDriver(250);

    const index = container.x.div(spacing).abs().round();   // Return index
    container.x = initialIndex * -spacing;                  // Initialize position based on initial index
    indicator.x = index.mul(spacing);

    // Tap to select. Button names are hard-coded
    for (let i = 0; i < count; i++) {
        TG.onTap(cont.child(`select${i}`)).subscribe(() => {
            container.x = AN.animate(driver, AN.samplers.easeInOutQuad(container.x.pinLastValue(), -i * spacing));
            driver.reset();
            driver.start();
        });
    }

    // Pan to select
    TG.onPan(cont).subscribe(e => {
        container.x = RT.clamp(e.translation.x.div(scale).add(container.x.pinLastValue()), (count - 1) * -spacing, 0);
        // Snap to grid on release
        e.state.eq('ENDED').onOn().subscribe(() => {
            container.x = AN.animate(driver, AN.samplers.easeInOutQuad(container.x.pinLastValue(), -(index.pinLastValue() * spacing)));
            driver.reset();
            driver.start();
        });
    });

    return index;
}

find('txt_debug').text = watchToString({
    col: Signals.cursorCol.toString(),
    row: Signals.cursorRow.toString(),
    sx: Signals.screenX,
    sz: Signals.screenZ,
    cursorState: Signals.cursorState.toString(),
    editMode: Signals.editMode.toString(),
});

txtInfo.text = watchToString({
    Type: Signals.type.toString(),
    SubType: Signals.subType.toString(),
});

function timeDriver(durationMilliseconds, loopCount = 1, mirror = false) { return AN.timeDriver({ durationMilliseconds, loopCount, mirror }) };
function between(s, l, u = l) { return RT.min(RT.step(s, l), RT.step(u, s)); }
function dist2d(a, b) { let dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function fract(s) { return s.sub(s.floor()); }
function find(p, r) { return p.split('/').reduce((s, c, i) => (i || r) ? s.child(c) : s.find(c), r || require('Scene').root); }
function findIndex(a, p) { for (let i = 0; i < a.length; i++) { if (p(a[i])) return i; } return -1; }
function SignalProxy(cl, s = []) {
    let k = ['x', 'y', 'z', 'scaleX', 'scaleY', 'scaleZ', 'rotationX', 'rotationY', 'rotationZ'];
    (Array.isArray(s) ? s : [s]).forEach((n, i) => {
        let ci = Math.floor(i / 9), ki = i % 9;
        Object.defineProperty(this, n, { enumerable: true, get() { return cl[ci].transform[k[ki]]; }, set(v) { cl[ci].transform[k[ki]] = v; } })
    });
}