import { VexFirmwareVersion } from "./VexFirmwareVersion";
import { HostBoundPacket } from "./VexPacket";

export class PacketView extends DataView {
    position = 0;
    littleEndianDefault = true;

    constructor(buffer: ArrayBuffer, offset: number = 0, length: number = buffer.byteLength - offset) {
        super(buffer, offset, length);
    }

    static fromPacket(packet: HostBoundPacket): PacketView {
        let view = new PacketView(packet.data.buffer, packet.data.byteOffset)
        view.position = packet.ackIndex + 1;
        return view;
    }

    nextInt8(): number {
        let result = this.getInt8(this.position);
        this.position += 1;
        return result;
    }

    nextUint8(): number {
        let result = this.getUint8(this.position);
        this.position += 1;
        return result;
    }

    nextInt16(littleEndian = this.littleEndianDefault): number {
        let result = this.getInt16(this.position, littleEndian);
        this.position += 2;
        return result;
    }

    nextUint16(littleEndian = this.littleEndianDefault): number {
        let result = this.getUint16(this.position, littleEndian);
        this.position += 2;
        return result;
    }

    nextInt32(littleEndian = this.littleEndianDefault): number {
        let result = this.getInt32(this.position, littleEndian);
        this.position += 4;
        return result;
    }

    nextUint32(littleEndian = this.littleEndianDefault): number {
        let result = this.getUint32(this.position, littleEndian);
        this.position += 4;
        return result;
    }

    nextString(length: number): string {
        let result = "";
        for (let i = 0; i < length; i++) {
            result += String.fromCharCode(this.nextUint8());
        }
        return result;
    }

    nextNTBS(length: number): string { // this length is different from the document
        let result = "";
        let lastPosition = this.position;
        for (let i = 0; i < length; i++) {
            if (this.byteLength <= this.position) break;
            let g = this.nextUint8();
            if (g === 0) break;
            result += String.fromCharCode(g);
        }
        this.position = lastPosition + length;
        return result;
    }

    nextVarNTBS(length: number): string { // this length is different from the document
        let result = "";
        for (let i = 0; i < length; i++) {
            if (this.byteLength <= this.position) break;
            let g = this.nextUint8();
            if (g === 0) break;
            result += String.fromCharCode(g);
        }
        return result;
    }

    nextVersion(reverse = false): VexFirmwareVersion {
        let result = VexFirmwareVersion.fromUint8Array(new Uint8Array(this.buffer), this.position, reverse);
        this.position += 4;
        return result;
    }
}