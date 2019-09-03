const Animation = require('Animation');
const Scene = require('Scene');
const Diagnostics = require('Diagnostics');
const Patches = require('Patches');

const TIME_MS = 70000;
const driver = Animation.timeDriver({ durationMilliseconds: TIME_MS });
const time = Animation.animate(driver, Animation.samplers.linear(TIME_MS, 0));
const endGame = Patches.getBooleanValue('endGame');

Scene.root.find('2dText0').text = formatTime(time);

// Your pause/resume logic
endGame.monitor().subscribe(e => {
    if (e.newValue) {
        driver.stop();
    } else {
        driver.start();
    }
});

driver.onAfterIteration().subscribe(() => {
    Diagnostics.log('Times up');
});

function formatTime(t) {
    const minute = t.div(60000).mod(60).floor();
    const second = t.div(1000).mod(60).floor();
    const millisecond = t.mod(1000).div(10).floor();
    const minuteText = minute.lt(10).ifThenElse('0', '').concat(minute.toString());
    const secondText = second.lt(10).ifThenElse('0', '').concat(second.toString());
    const millisecondText = millisecond.lt(10).ifThenElse('0', '').concat(millisecond.toString());
    return minuteText.concat(':').concat(secondText).concat(':').concat(millisecondText);
}