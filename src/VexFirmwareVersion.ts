
/**
 * This is a class to make it easier to handle passing the VEXos version
 * information around in the application. This provides ways to get any
 * form of the string representation and quickly compare versions.
 */
export class VexFirmwareVersion {
    major: number;
    minor: number;
    build: number;
    beta: number;

    constructor(major: number, minor: number, build: number, beta: number) {
        this.major = major;
        this.minor = minor;
        this.build = build;
        this.beta = beta;
    }

    /**
     * Take a a string of MAJOR.MINOR.BUILD.bBETA and converts it to a
     * VexFirmwareVersion instance
     * @param version the string to process
     * @returns a VexFirmwareVersion representing the provided string
     */
    static fromString(version: string) {
        const parts = version
            .toLowerCase()
            .replace(/b/g, "")
            .split(".")
            .map((x) => parseInt(x, 10));
        while (parts.length < 4) {
            parts.push(0);
        }
        return new VexFirmwareVersion(parts[0], parts[1], parts[2], parts[3]);
    }

    /**
     * Take a a Uint8Array and converts it to a VexFirmwareVersion instance
     * @param data the array to process
     * @param offset the offset to start at
     * @returns a VexFirmwareVersion representing the provided string
     */
    static fromUint8Array(data: Uint8Array, offset: number = 0, reverse: boolean = false) {
        return new VexFirmwareVersion(
            data[offset + (reverse ? 3 : 0)],
            data[offset + (reverse ? 2 : 1)],
            data[offset + (reverse ? 1 : 2)],
            data[offset + (reverse ? 0 : 3)]
        );
    }

    static allZero() {
        return new VexFirmwareVersion(0, 0, 0, 0);
    }
    /**
     * Take a a string of MAJOR_MINOR_BUILD_BETA and converts it to a
     * VexFirmwareVersion instance
     * @param version the string to process
     * @returns a VexFirmwareVersion representing the provided string
     */
    static fromCatalogString(version: string) {
        return VexFirmwareVersion.fromString(version.replace(/_/g, "."));
    }

    isBeta() {
        return this.beta !== 0;
    }

    /**
     * returns version as Uint Array
     */
    toUint8Array(reverse: boolean = false) {
        const data = new Uint8Array(4);
        data[reverse ? 3 : 0] = this.major;
        data[reverse ? 2 : 1] = this.minor;
        data[reverse ? 1 : 2] = this.build;
        data[reverse ? 0 : 3] = this.beta;
        return data;
    }

    /**
     * returns version as major.minor.build
     */
    toUserString() {
        return `${this.major}.${this.minor}.${this.build}`;
    }

    /**
     * returns version as ${major}.${minor}.4{build}.b${beta}
     */
    toInternalString() {
        return `${this.toUserString()}.b${this.beta}`;
    }
    /**
     * compares this version to the provided version.
     * * if this < b: negative
     * * if this = b: 0
     * * if this > b: positive
     * @param that the version to compare again
     */
    compare(that: VexFirmwareVersion) {
        const majorComp = this.major - that.major;
        const minorComp = this.minor - that.minor;
        const buildComp = this.build - that.build;
        const betaComp = this.beta - that.beta;

        if (majorComp !== 0) {
            return majorComp;
        } else if (minorComp !== 0) {
            return minorComp;
        } else if (buildComp !== 0) {
            return buildComp;
        } else if (betaComp !== 0) {
            return betaComp;
        }
        return 0;
    }
}