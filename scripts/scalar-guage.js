// Increment output value when input bool signal is true, decrement otherwise
function ScalarGuage(opt = {}) {
    const self = this;
    const TM = require('Time');
    const INC = opt.inc || 1;              // Increment multiplier
    const DEC = opt.dec || -1;             // Decrement multiplier
    const MAX = opt.max || 100;            // Max signal value
    const MIN = opt.min || 0;              // Min signal value
    const v = opt.container.transform;     // Scene object transforms usdd as intermediary signals

    opt.input.monitor({ fireOnInitialValue: true }).subscribe(e => update(e.newValue));

    this.output = RT.clamp(v.x.add(v.y), MIN, MAX);
    this.isFull = this.output.ge(MAX);
    this.isEmpty = this.output.le(MIN);
    this.setValue = (val) => update(opt.input.pinLastValue(), val);

    function dt() {
        return TM.ms.sub(TM.ms.pinLastValue()).div(1000);
    }
    function update(isInc, val) {
        v.x = dt().mul(isInc ? INC : DEC);                      // Time signal
        v.y = val == null ? self.output.pinLastValue() : val;   // Signal offset for direction change
    }
}