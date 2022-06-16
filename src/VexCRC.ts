export class CrcGenerator {
    crc16Table: Uint32Array;
    crc32Table: Uint32Array;
    static POLYNOMIAL_CRC32 = 79764919;
    static POLYNOMIAL_CRC16 = 4129;

    constructor() {
        this.crc16Table = new Uint32Array(256);
        this.crc32Table = new Uint32Array(256);
        this.crc16GenTable();
        this.crc32GenTable();
    }

    crc16GenTable() {
        let e, t, a;
        for (this.crc16Table = new Uint32Array(256),
            e = 0; e < 256; e++) {
            for (a = e << 8, t = 0; t < 8; t++) {
                32768 & a ? a = a << 1 ^ CrcGenerator.POLYNOMIAL_CRC16 : a <<= 1;
            }
            this.crc16Table[e] = a;
        }
    }

    crc16(data: Uint8Array, t: number) {
        const len = data.byteLength;
        let n: number, r: number, i: number = t;
        for (r = 0; r < len; r++) {
            n = 255 & (i >>> 8 ^ data[r]);
            i = (i << 8 ^ this.crc16Table[n]) >>> 0;
        }
        return (65535 & i) >>> 0;
    }

    crc32GenTable() {
        let e, t, a;
        for (e = 0; e < 256; e++) {
            for (a = e << 24, t = 0; t < 8; t++) {
                2147483648 & a ? a = a << 1 ^ CrcGenerator.POLYNOMIAL_CRC32 : a <<= 1;
            }
            this.crc32Table[e] = a;
        }
    }

    crc32(data: Uint8Array, t: number) {
        const a = data.byteLength;
        let n, r, i = t;
        for (r = 0; r < a; r++) {
            n = 255 & (i >>> 24 ^ data[r]);
            i = (i << 8 ^ this.crc32Table[n]) >>> 0;
        }
        return (4294967295 & i) >>> 0;
    }
}