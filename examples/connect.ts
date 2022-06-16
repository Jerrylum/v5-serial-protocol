// TODO
import { serial } from "node-web-serial-ponyfill";
import { ProgramIniConfig, V5SerialDevice, ZerobaseSlotNumber } from "../src";

import fs from 'fs';

function toUint8(b: Buffer): Uint8Array {
    let ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    return new Uint8Array(ab);
}

(async function() {
    let device = new V5SerialDevice(serial);

    device.autoRefresh = false;

    await device.connect();

    // device.brain.activeProgram = 1;

    // console.log(device.brain.systemVersion);

    // read file


    let slot = 2;
    // let bin = await readFileFromInternet("./field_skills_1_0_0_0.bin");
    let bin = new Uint8Array(toUint8(fs.readFileSync("./slot_8.bin")));
    let cold = undefined;
    // let bin = new Uint8Array(await readFileFromInternet("./hot.package.bin"));
    // let cold = new Uint8Array(await readFileFromInternet("./cold.package.bin"));

    // console.log(bin);
    

    let ini = new ProgramIniConfig();
    ini.autorun = true;
    ini.baseName = "slot_" + slot;
    ini.program.name = "Their Program";
    ini.program.slot = (slot - 1) as ZerobaseSlotNumber;
    ini.program.icon = "USER902x.bmp";
    ini.program.description = "My Program Description";

    const onProgress = (state: string, current: number, total: number) => {
        console.log(state, current, total);

        // TODO
    };

    let isDone = await device.brain.uploadProgram(ini, bin, cold, onProgress);
    console.log("done", isDone);
})();