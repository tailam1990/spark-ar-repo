const isBackCam = require('CameraInfo').captureDevicePosition.eq('BACK');

function moveOnPan(obj) {
    TG.onPan(obj).subscribe(e => {
        let loc = SC.unprojectToFocalPlane(e.location);
        let locX = isBackCam.ifThenElse(loc.x, loc.x.neg());
        obj.transform.x = locX.add(obj.transform.x.pinLastValue()).sub(locX.pin());
        obj.transform.y = loc.y.add(obj.transform.y.pinLastValue()).sub(loc.y.pin());
    });
}

function resizeOnPinch(obj, min = .5, max = 2) {
    TG.onPinch(obj).subscribe(e => {
        obj.transform.scaleX = RT.clamp(e.scale.mul(obj.transform.scaleX.pinLastValue()), min, max);
        obj.transform.scaleY = RT.clamp(e.scale.mul(obj.transform.scaleY.pinLastValue()), min, max);
        obj.transform.scaleZ = RT.clamp(e.scale.mul(obj.transform.scaleZ.pinLastValue()), min, max);
    });
}