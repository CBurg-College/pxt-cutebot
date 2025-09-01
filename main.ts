enum Led {
    //% block="left led"
    //% block.loc.nl="linker led"
    Left,
    //% block="right led"
    //% block.loc.nl="rechter led"
    Right,
    //% block="both leds"
    //% block.loc.nl="beide leds"
    Both
}

namespace Cutebot {
    // supports CutebotPro V2

    const cutebotProAddr = 0x10

    function delay_ms(ms: number) {
        let endTime = input.runningTime() + ms;
        while (endTime > input.runningTime()) { }
    }

    export function pid_delay_ms(ms: number) {
        let time = control.millis() + ms
        while (1) {
            i2cCommandSend(0xA0, [0x05])
            if (pins.i2cReadNumber(cutebotProAddr, NumberFormat.UInt8LE, false) || control.millis() >= time) {
                basic.pause(500)
                break
            }
            basic.pause(10)
        }
    }

    export function i2cCommandSend(command: number, params: number[]) {
        let buff = pins.createBuffer(params.length + 4);
        buff[0] = 0xFF;
        buff[1] = 0xF9;
        buff[2] = command;
        buff[3] = params.length;
        for (let i = 0; i < params.length; i++) {
            buff[i + 4] = params[i];
        }
        pins.i2cWriteBuffer(cutebotProAddr, buff);
        delay_ms(1);
    }

    // MOTOR MODULE

    export function speed(left: number, right: number): void {
        // speed in % [-100, 100]

        let direction: number = 0;
        if (left < 0) direction |= 0x01;
        if (right < 0) direction |= 0x02;
        i2cCommandSend(0x10, [2, Math.abs(left), Math.abs(right), direction]);
    }

    export function move(speed: number, distance: number): void {
        // speed in % [-100, -40] backward and [40, 100] forward
        // distance in cm [0, 6000]

        distance = ((distance > 6000 ? 6000 : distance) < 0 ? 0 : distance);
        distance *= 10 // cm to mm
        let distance_h = distance >> 8;
        let distance_l = distance & 0xFF;

        let direction2: number
        if (speed <= 0) {
            speed = -speed
            direction2 = 3
        } else
            direction2 = 0

        speed *= 5 // % to mm/s
        speed = ((speed > 500 ? 500 : speed) < 200 ? 200 : speed);
        let speed_h = speed >> 8;
        let speed_l = speed & 0xFF;

        i2cCommandSend(0x84, [distance_h, distance_l, speed_h, speed_l, direction2]);
        pid_delay_ms(Math.round(distance * 1.0 / 1000 * 8000 + 3000))
    }

    // SERVO MODULE

    let Servos = [180, 180, 180, 180] // all ServoType.ST180

    export function setServoType(servo: Servo, st: ServoType) {
        Servos[servo] = st
    }

    export function servoAngle(servo: Servo, angle: number): void {
        angle = Math.map(angle, 0, Servos[servo], 0, 180)
        i2cCommandSend(0x40, [servo, angle]);
    }

    // LED MODULE

    export function ledColor(led: Led, color: Color): void {
        let rgbval = rgb(color)
        let red = (rgbval >> 16) & 0xFF;
        let green = (rgbval >> 8) & 0xFF;
        let blue = (rgbval) & 0xFF;
        i2cCommandSend(0x20, [led, red, green, blue]);
    }

    // TRACKING MODULE

    export function readTracking(): number {
        i2cCommandSend(0x60, [0x00])
        let state = pins.i2cReadNumber(cutebotProAddr, NumberFormat.UInt8LE, true)
        return state
    }

    // track can be a combination of OR-ed TrackSensor values
    export function isOnTrack(track:Track) : boolean {
        let state = (readTracking() & track)
        return (state == track)
    }

    // DISTANCE MODULE

    export function readDistance(): number {
        // send pulse

        pins.setPull(DigitalPin.P8, PinPullMode.PullNone);
        pins.digitalWritePin(DigitalPin.P8, 0);
        control.waitMicros(2);
        pins.digitalWritePin(DigitalPin.P8, 1);
        control.waitMicros(10);
        pins.digitalWritePin(DigitalPin.P8, 0);

        // read pulse

        // the next code is replacing the original since
        // driving the motors causes interference with pulseIn

        while (!pins.digitalReadPin(DigitalPin.P12)) { }
        let tm1 = input.runningTimeMicros()
        while (pins.digitalReadPin(DigitalPin.P12)) {
            if (input.runningTimeMicros() - tm1 > 7288)
                return 999 // timeout at further than 250 cm
        }
        let tm2 = input.runningTimeMicros()
        let dist = (tm2 - tm1) * 343 / 20000
        return Math.floor(dist)
    }
}
