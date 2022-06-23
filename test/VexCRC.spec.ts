import crc16ccitt from 'crc/calculators/crc16ccitt';
import { CrcGenerator } from '../src';


function getRandomInt(max: number) {
    return Math.floor(Math.random() * max);
}

function getRandomUInt8Array(size: number) {
    let rtn: number[] = [];
    for (let i = 0; i < size; i++) {
        rtn.push(getRandomInt(256));
    }
    return new Uint8Array(rtn);
}

const crcgen = new CrcGenerator();

test("CRC 16 ccitt", async () => {
    for (let i = 10; i < 100; i++) {
        let test = getRandomUInt8Array(i);
        if (crc16ccitt(test, 0) !== crcgen.crc16(test, 0)) {
            fail();
        }
    }
});