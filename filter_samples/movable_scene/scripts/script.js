const SC = require('Scene');
const { resolveObject, watchToString } = require('./common');
const SignalProxy = require('./ScalarProxy').default;

// Using pan gestures to move scene around the camera
resolveObject({
    joystick: findFirst('joystick'),
    scene: findFirst('scene'),
    signals: findFirst('signals'),
    txtDebug: findFirst('txt_debug'),
}).then(({ joystick, scene, signals, txtDebug }) => {
    // Create movable scene from scene object
    // This subscribes on pan position changes so SparkAR is bound to complains about high callback rate whenever the finger moves
    const moveableScene = new MovableScene(scene, signals, {
        bounds: {
            x: [-250, 250],
            z: [-250, 250],
        },
        speed: 5,
        joystick
    });

    // Print debug info
    txtDebug.text = watchToString({
        x: scene.transform.x,
        z: scene.transform.z,
        vx: moveableScene.velocity.x,
        vz: moveableScene.velocity.z,
    });
});

// Move scene along x and y axis with pan touch gestures
function MovableScene(obj, signals, o = {}) {
    const TG = require('TouchGestures');
    const RT = require('Reactive');
    const DM = require('DeviceMotion');
    const TM = require('Time');

    // Temp signals for velocity, time and last position offset
    const s = new SignalProxy(signals, {
        vx: 0,
        vz: 0,
        t: 0,
        x: 0,
        z: 0,
    });
    const speed = RT.add(o.speed || 1, 0);
    const PI_2 = Math.PI / 2;

    // Position x and z bounds
    const bxu = !Array.isArray(o.bounds.x) || o.bounds.x[1] == null ? Infinity : o.bounds.x[1];
    const bxl = !Array.isArray(o.bounds.x) || o.bounds.x[0] == null ? -Infinity : o.bounds.x[0];
    const bzu = !Array.isArray(o.bounds.z) || o.bounds.z[1] == null ? Infinity : o.bounds.z[1];
    const bzl = !Array.isArray(o.bounds.z) || o.bounds.z[0] == null ? -Infinity : o.bounds.z[0];

    // Device rotation direction vector
    const dr = getDirectionVector(DM.worldTransform.rotationX, DM.worldTransform.rotationY);
    const ry = RT.atan2(dr.x, dr.z).neg();

    // Save subscription to be unsubscribed later
    let sub = { unsubscribe() { } };

    dt();   // Bind time signal to something so Time.ms.pinLastValue doesn't always return 0 for the first call
    obj.transform.x = RT.clamp(s.t.mul(s.vx).add(s.x), bxl, bxu);
    obj.transform.z = RT.clamp(s.t.mul(s.vz).add(s.z), bzl, bzu);

    // Show joystick only when panning
    if (o.joystick) {
        o.joystick.hidden = s.vx.eq(0).and(s.vz.eq(0));
    }

    TG.onPan().subscribe(e => {
        update();

        let cx = RT.clamp(e.translation.x.div(10), -20, 20);
        let cz = RT.clamp(e.translation.y.div(10), -20, 20);
        let len = cx.mul(cx).add(cz.mul(cz)).sqrt();
        let rot = ry.add(RT.atan2(e.translation.y, e.translation.x).add(PI_2).neg());

        s.vx = speed.mul(len).mul(RT.sin(rot));
        s.vz = speed.mul(len).mul(RT.cos(rot));

        if (o.joystick) {
            o.joystick.x = RT.clamp(e.translation.x.div(50), -5, 5);
            o.joystick.y = RT.clamp(e.translation.y.div(50).neg(), -5, 5);
        }

        e.state.eq('ENDED').onOn().subscribe(() => {
            update();
            s.vx = 0;
            s.vz = 0;
            if (o.joystick) {
                o.joystick.x = 0;
                o.joystick.y = 0;
            }
            sub.unsubscribe();
        });

        sub = RT.monitorMany({
            x: e.translation.x,
            y: e.translation.y,
            rx: DM.worldTransform.rotationX,
            ry: DM.worldTransform.rotationY,
            rz: DM.worldTransform.rotationZ,
        }).subscribe(update);
    });

    this.getVelocity = () => RT.vector(s.vx, 0, s.vz);

    this.velocity = RT.vector(s.vx, 0, s.vz);

    function update() {
        s.t = dt();
        s.x = obj.transform.x.pinLastValue();
        s.z = obj.transform.z.pinLastValue();
    }
    function getDirectionVector(x, y) {
        return RT.vector(RT.sin(y).neg(), RT.cos(y).mul(RT.sin(x)), RT.cos(x).mul(RT.cos(y)));
    }
    function dt() {
        return TM.ms.sub(TM.ms.pinLastValue()).div(1000);
    }
};

function findFirst(a) { return SC.root.findFirst(a); }