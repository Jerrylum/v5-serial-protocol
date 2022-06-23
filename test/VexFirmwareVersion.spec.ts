import { VexFirmwareVersion } from "../src";

function getRandomInt(max: number) {
    return Math.floor(Math.random() * max);
}

test("Constructor, fromString, fromCatalogString and Uint8 related methods", async () => {
    for (let i = 0; i < 1000; i++) {
        let a = getRandomInt(256), b = getRandomInt(256), c = getRandomInt(256), d = getRandomInt(256);

        let subject = new VexFirmwareVersion(a, b, c, d);
        let str = `${a}.${b}.${c}.b${d}`;

        expect(subject.toInternalString()).toBe(str);
        expect(VexFirmwareVersion.fromString(str)).toEqual(subject);
        expect(VexFirmwareVersion.fromCatalogString(`${a}_${b}_${c}_b${d}`)).toEqual(subject);
        expect(VexFirmwareVersion.fromUint8Array(subject.toUint8Array(false)).toInternalString()).toBe(str);
        expect(VexFirmwareVersion.fromUint8Array(subject.toUint8Array(true), 0, true).toInternalString()).toBe(str);
        subject.beta = 0;
        expect(VexFirmwareVersion.fromString(`${a}.${b}.${c}`)).toEqual(subject);
    }
});

test("Compare", async () => {
    let base = new VexFirmwareVersion(1, 2, 3, 4);
    expect(base.compare(base)).toBe(0);
    expect(new VexFirmwareVersion(1, 2, 3, 5).compare(base)).toBe(1);
    expect(new VexFirmwareVersion(1, 2, 4, 5).compare(base)).toBe(1);
    expect(new VexFirmwareVersion(1, 3, 4, 5).compare(base)).toBe(1);
    expect(new VexFirmwareVersion(2, 3, 4, 5).compare(base)).toBe(1);
});

test("Is beta", async () => {
    expect(VexFirmwareVersion.allZero().isBeta()).toBeFalsy();
    expect(new VexFirmwareVersion(0, 0, 0, 1).isBeta()).toBeTruthy();
});

test("All zero", async () => {
    expect(VexFirmwareVersion.allZero().toInternalString()).toBe("0.0.0.b0");
});
