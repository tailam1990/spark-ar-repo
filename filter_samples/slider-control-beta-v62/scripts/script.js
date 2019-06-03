const Scene = require('Scene');
const TouchGestures = require('TouchGestures');
const Animation = require('Animation');
const Reactive = require('Reactive');
const Patches = require('Patches');
const Materials = require('Materials');

const screenScale = Patches.getScalarValue('screenScale');

const rectangle = Scene.root.find('rectangle0');
const container = Scene.root.find('container');

const selectionCount = 9;   // Number of selections
const spacing = .6;         // Spacing between button (rectangle position offset)
const initialIndex = 3;     // Initial selection index on startup, defaults to 0

const selectedIndex = HorizontalSlider(container, screenScale, selectionCount, spacing, {
    initialIndex
});

// Change material based on slider selected index
selectedIndex.monitor({ fireOnInitialValue: true }).subscribe(e => {
    rectangle.material = Materials.get(`material${e.newValue}`);
});

function HorizontalSlider(cont, scale, count, spacing, options = {}) {
    spacing *= 100;

    const initialIndex = +options.initialIndex || 0;
    const container = cont.transform;
    const indicator = cont.child('indicator').transform;
    const driver = Animation.timeDriver({ durationMilliseconds: 250 });
    
    const index = container.x.div(spacing).abs().round();   // Return index
    container.x = initialIndex * -spacing;                  // Initialize position based on initial index
    indicator.x = index.mul(spacing);

    TouchGestures.onPan(container).subscribe(e => {
        container.x = Reactive.clamp(e.translation.x.div(scale).add(container.x.pinLastValue()), (count - 1) * -spacing, 0);
        // Snap to grid on release
        e.state.eq('ENDED').onOn().subscribe(() => {
            container.x = Animation.animate(driver, Animation.samplers.easeInOutQuad(container.x.pinLastValue(), -(index.pinLastValue() * spacing)));
            driver.reset();
            driver.start();
        });
    });

    return index;
}