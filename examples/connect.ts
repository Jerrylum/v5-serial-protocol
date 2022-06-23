import { serial } from "node-web-serial-ponyfill";
import { V5SerialDevice } from "../src";

(async function() {
    let device = new V5SerialDevice(serial);

    await device.connect();

    console.log(device.brain.systemVersion);
})();