const TM = require('Time');

// Increment output value when input bool signal is true, decrement otherwise
function ScalarGuage(container, opt = {}) {
    const INC = opt.inc || .1;          // Increment multiplier
    const DEC = opt.dec || -.1;         // Decrement multiplier
    const MAX = opt.max || 1;           // Max signal value
    const MIN = opt.min || 0;           // Min signal value
    const v = container.transform;      // Scene object transforms usdd as intermediary signals

    let update = (isInc, val) => {
        v.x = dt().mul(isInc ? INC : DEC);                      // Time signal
        v.y = val == null ? this.output.pinLastValue() : val;   // Signal offset for direction change
    }
    this.output = RT.clamp(v.x.add(v.y), MIN, MAX);
    this.isFull = this.output.ge(MAX);
    this.isEmpty = this.output.le(MIN);
    this.setValue = (val) => update(opt.input.pinLastValue(), val);

    opt.input.monitor({ fireOnInitialValue: true }).subscribe(e => update(e.newValue));

    function dt() {
        return TM.ms.sub(TM.ms.pinLastValue()).div(1000);
    }
}