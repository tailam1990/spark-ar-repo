const RT = require('Reactive');

const map0 = {
    fans: [],
    grid: [[1,1,1,8,8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4],[1,1,1,8,8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],[1,1,1,8,8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0,0],[4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0],[4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0,0],[4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4],[0,0,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],[0,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],[0,0,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4],[4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],[4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0,0],[4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0],[4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0,0],[4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4],[0,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],[0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,0,0,2,2,2],[4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2],[4,4,0,0,0,0,0,4,0,0,0,0,0,0,0,0,0,4,0,0,0,0,2,2,2]]
};
const mapWithFans = {"grid":[[0,0,0,0,0,4,4,4,4,4,4,4,4,0,0,0,0,0,4,4,4,4,4,4,4],[0,0,0,0,0,0,0,0,0,0,4,4,0,0,0,0,0,0,4,4,4,1,1,1,4],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,4,1,1,1,4],[0,0,0,0,0,0,4,4,0,0,0,0,0,0,0,0,0,0,4,4,4,1,1,1,4],[0,0,0,0,0,4,4,4,4,4,4,4,4,0,0,0,0,0,4,4,4,0,0,4,4],[4,0,0,0,4,4,4,4,4,4,4,4,4,4,0,0,0,4,4,4,4,0,0,4,4],[4,0,0,0,4,4,4,4,4,4,4,4,4,4,4,0,0,4,4,4,4,0,0,4,4],[4,0,0,0,4,4,4,4,2,2,2,2,4,4,4,0,0,4,4,4,4,0,0,0,4],[4,4,0,0,4,4,4,4,2,2,2,2,4,4,4,0,0,4,4,4,4,0,0,0,4],[4,4,0,0,4,4,4,4,2,2,2,2,4,4,4,0,0,4,4,4,4,4,0,0,4],[4,4,0,0,4,4,4,4,2,2,2,2,4,4,4,0,0,4,4,4,4,4,0,0,4],[4,0,0,0,4,4,4,4,4,0,0,4,4,4,4,0,0,4,4,4,4,4,0,0,4],[4,0,0,0,4,4,4,4,4,0,0,4,4,4,4,0,0,4,4,4,4,0,0,0,4],[4,0,0,0,4,4,4,4,4,0,0,4,4,4,0,0,0,4,4,4,4,0,0,0,4],[4,0,0,4,4,4,4,4,4,0,0,0,4,0,0,0,0,4,4,4,4,0,0,4,4],[4,0,0,4,4,4,4,4,4,0,0,0,0,0,0,0,4,4,4,4,4,0,0,4,4],[4,0,0,4,4,4,4,4,4,4,0,0,0,0,0,4,4,4,4,4,4,0,0,4,4],[4,0,0,0,4,4,4,4,4,4,4,0,0,0,4,4,4,4,4,4,4,0,0,0,4],[4,0,0,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0,0,4],[4,0,0,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0,0,4],[0,0,0,0,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,4,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,4,4,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,0,0,0,0]],"fans":[{"len":5,"speed":2,"center":[2,2]},{"len":5,"speed":2,"center":[2,15]},{"len":5,"speed":2,"center":[22,2]},{"len":5,"speed":2,"center":[22,22]}]}
const mapWithSpinningThing = {"grid":[[1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,4,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,4,0,0,0],[0,0,0,4,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,4,0,0,0],[0,0,0,4,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,4,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,2,2,2,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,4,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,4,0,0,0],[0,0,0,4,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,4,0,0,0],[0,0,0,4,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0,4,4,4,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],"fans":[],"spinners":[{"margin":0.1,"offset":0,"dir":1,"len":4},{"margin":0.2,"offset":0.05,"dir":-1,"len":2}]}

const maps = [
    map0,
    mapWithFans,
    mapWithSpinningThing,
];

export default maps;