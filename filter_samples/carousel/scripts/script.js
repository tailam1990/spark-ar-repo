const Scene = require('Scene');
const Reactive = require('Reactive');
const Patches = require('Patches');
const Materials = require('Materials');
const { resolveObject } = require('./common');

const screenScale = Patches.getScalarValue('screenScale');

resolveObject({
    testRectangle: Scene.root.findFirst('testRectangle'),
    carousel: Scene.root.findFirst('carousel'),
    materials: Materials.findUsingPattern('material*'),
}).then(({ testRectangle, carousel, materials }) => {
    const spacing = 60;         // Spacing between button (rectangle position offset)
    const initialIndex = 3;     // Initial selection index on startup, defaults to 0

    // Initialize carousel
    const selectedIndex = useCarousel(carousel, screenScale, spacing, {
        initialIndex
    });

    // Export to patch
    Patches.setScalarValue('selectedIndex', selectedIndex);

    // Change material based on carousel selected index
    selectedIndex.monitor({ fireOnInitialValue: true }).subscribe(e => {
        testRectangle.material = materials[e.newValue];
    });
});

function useCarousel(cont, scale, spacing, options = {}) {
    const Animation = require('Animation');
    const TouchGestures = require('TouchGestures');
    const initialIndex = +options.initialIndex || 0;
    const container = cont.transform;
    const driver = Animation.timeDriver({ durationMilliseconds: 250 });

    const index = container.x.div(spacing).abs().round();   // Return selected index
    container.x = initialIndex * -spacing;                  // Initialize position based on initial index

    resolveObject({
        indicator: cont.findFirst('indicator'),
        selections: cont.findByPath('select*'),
    }).then(({ indicator, selections }) => {
        indicator.transform.x = index.mul(spacing);

        // Tap to select. Button names are hard-coded
        selections.forEach((s, i) => {
            TouchGestures.onTap(s).subscribe(() => {
                container.x = Animation.animate(driver, Animation.samplers.easeInOutQuad(container.x.pinLastValue(), -i * spacing));
                driver.reset();
                driver.start();
            });
        });

        // Pan to select
        TouchGestures.onPan(cont).subscribe(e => {
            container.x = Reactive.clamp(e.translation.x.div(scale).add(container.x.pinLastValue()), (selections.length - 1) * -spacing, 0);
            // Snap to grid on release
            e.state.eq('ENDED').onOn().subscribe(() => {
                container.x = Animation.animate(driver, Animation.samplers.easeInOutQuad(container.x.pinLastValue(), -(index.pinLastValue() * spacing)));
                driver.reset();
                driver.start();
            });
        });
    });

    return index;
}
