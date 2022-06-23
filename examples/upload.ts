import { serial } from "node-web-serial-ponyfill";
import { ProgramIniConfig, V5SerialDevice, ZerobaseSlotNumber } from "../src";

import fs from 'fs';

function toUint8(b: Buffer): Uint8Array {
    let ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    return new Uint8Array(ab);
}

(async function() {
    let device = new V5SerialDevice(serial);

    await device.connect();

    let slot = 2;
    let bin = toUint8(fs.readFileSync("./examples/pros-demo-program/hot.package.bin"));
    let cold = toUint8(fs.readFileSync("./examples/pros-demo-program/cold.package.bin"));

    let ini = new ProgramIniConfig();
    ini.autorun = true;
    ini.baseName = "slot_" + slot;
    ini.program.name = "PROS Demo";
    ini.program.slot = (slot - 1) as ZerobaseSlotNumber;
    ini.program.icon = "USER902x.bmp";
    ini.program.description = "Demo";

    const onProgress = (state: string, current: number, total: number) => {
        console.log(state, current, total);
    };

    let isDone = await device.brain.uploadProgram(ini, bin, cold, onProgress);
    console.log("done", isDone);
})();