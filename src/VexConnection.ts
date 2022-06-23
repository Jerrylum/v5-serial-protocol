import { AckType, FileDownloadTarget, FileExitAction, FileInitAction, FileInitOption, FileLoadAction, FileVendor, IFileBasicInfo, IFileWriteRequest, IPacketCallback, MatchMode, SerialDeviceType, SlotNumber, USER_FLASH_USR_CODE_START, USER_PROG_CHUNK_SIZE } from "./Vex";
import { VexEventTarget } from "./VexEvent";
import { ProgramIniConfig } from "./VexIniConfig";
import { MatchStatusReplyD2HPacket, DeviceBoundPacket, GetMatchStatusH2DPacket, UpdateMatchModeH2DPacket, MatchModeReplyD2HPacket, GetSystemStatusReplyD2HPacket, GetSystemStatusH2DPacket, Packet, HostBoundPacket, InitFileTransferH2DPacket, InitFileTransferReplyD2HPacket, LinkFileH2DPacket, ExitFileTransferH2DPacket, ExitFileTransferReplyD2HPacket, WriteFileReplyD2HPacket, WriteFileH2DPacket, LinkFileReplyD2HPacket, ReadFileH2DPacket, ReadFileReplyD2HPacket, PacketEncoder, SystemVersionH2DPacket, SystemVersionReplyD2HPacket, Query1H2DPacket, Query1ReplyD2HPacket, LoadFileActionH2DPacket, LoadFileActionReplyD2HPacket, GetSystemFlagsH2DPacket, GetSystemFlagsReplyD2HPacket, GetRadioStatusH2DPacket, GetRadioStatusReplyD2HPacket, GetDeviceStatusH2DPacket, GetDeviceStatusReplyD2HPacket, SendDashTouchH2DPacket, SendDashTouchReplyD2HPacket } from "./VexPacket";

const thePacketEncoder = PacketEncoder.getInstance();

/**
 * A connection to a V5 device.
 * Emit events: connected, disconnected
 */
export class VexSerialConnection extends VexEventTarget {
    filters: SerialPortFilter[] = [{ usbVendorId: 10376 }];

    writer: WritableStreamDefaultWriter<any> | undefined;
    reader: ReadableStreamDefaultReader<any> | undefined;
    port: SerialPort | undefined;
    serial: Serial;

    callbacksQueue: IPacketCallback[] = [];

    get isConnected() {
        return this.port && this.reader && this.writer ? true : false;
    }

    constructor(serial: Serial) {
        super();
        this.serial = serial;
    }

    async close() {
        if (!this.isConnected) return;

        try {
            await this.writer?.close();
            this.writer = undefined;
        } catch (e) { }

        try {
            await this.reader?.cancel();
            try {
                while (true && this.reader) {
                    const { value, done } = await this.reader.read();
                    if (done) break;
                }
            } catch (e) { }
            this.reader = undefined;
        } catch (e) { }

        try {
            await new Promise(resolve => setTimeout(resolve, 1)); // HACK: wait for the lock to be released
            await this.port?.close();
            this.port = undefined;
        } catch (e) {
            console.warn("Close port error.", e)
        } finally {
            this.emit("disconnected", undefined)
        }
    }

    async open(use: number | undefined = 0, askUser: boolean = true) {
        if (this.port)
            throw new Error("Already connected.");

        let port: SerialPort | undefined;

        if (use !== undefined) {
            let ports = (await this.serial.getPorts())
                .filter((p => {
                    let info = p.getInfo();
                    return this.filters.find(f =>
                        (f.usbVendorId === undefined || f.usbVendorId === info.usbVendorId) &&
                        (f.usbProductId === undefined || f.usbProductId === info.usbProductId)
                    );
                }))
                .filter((e => !e.readable));

            port = ports[use];
        }        

        if (!port && askUser) {
            try {
                port = await this.serial.requestPort({ filters: this.filters });
            } catch (e) {
                console.warn("No valid port selected.");
            }
        }

        if (!port) return undefined;

        if (port.readable) return false;

        try {
            await port.open({ baudRate: 115200 });

            this.port = port;

            this.port.addEventListener("disconnect", (async () => {
                await this.close();
            }));

            this.emit("connected", undefined);

            this.writer = this.port.writable.getWriter();
            this.reader = this.port.readable.getReader();
            this.startReader();

            return true;
        } catch (e) {
            return false;
        }
    }

    writeData(rawData: DeviceBoundPacket | Uint8Array, resolve: ((data: HostBoundPacket | ArrayBuffer | AckType) => void), timeout: number = 1000) {
        this.writeDataAsync(rawData, timeout).then(resolve);
    }

    writeDataAsync(rawData: DeviceBoundPacket | Uint8Array, timeout: number = 1000) {
        return new Promise<HostBoundPacket | ArrayBuffer | AckType>(async done => {
            if (this.writer === undefined) {
                done(AckType.CDC2_NACK);
                return;
            }

            let data: Uint8Array = rawData instanceof DeviceBoundPacket ? rawData.data : rawData;
            let cb = {
                callback: done,
                timeout: setTimeout(() => { this.callbacksQueue.shift()?.callback(AckType.TIMEOUT) }, timeout),
                wantedCommandId: rawData instanceof DeviceBoundPacket ? (rawData.constructor as any).COMMAND_ID : undefined,
                wantedCommandExId: rawData instanceof DeviceBoundPacket ? (rawData.constructor as any).COMMAND_EXTENDED_ID : undefined
            };
            this.callbacksQueue.push(cb);

            try {
                this.writer.write(data).then(() => { logData(data, 100); });
            } catch (error) {
                this.callbacksQueue.splice(this.callbacksQueue.indexOf(cb), 1);
                done(AckType.WRITE_ERROR);
                return;
            }

        });
    }

    protected async readData(cache: Uint8Array, expectedSize: number) {
        if (!this.reader) throw new Error("No reader");

        while (cache.byteLength < expectedSize) {
            const { value: readData, done: isDone } = await this.reader.read();

            if (isDone) throw new Error("No data");

            cache = binaryArrayJoin(cache, readData);
        }

        return cache;
    }

    protected async startReader() {
        let cache = new Uint8Array([]), sliceIdx = 0;
        for (; ;)
            try {
                cache = await this.readData(cache, 5);
                sliceIdx = 0;

                if (!thePacketEncoder.validateHeader(cache)) throw new Error("Invalid header");

                const payloadExpectedSize = thePacketEncoder.getPayloadSize(cache);
                const n = payloadExpectedSize > 128 ? 5 : 4;
                const totalSize = n + payloadExpectedSize;

                cache = await this.readData(cache, totalSize);
                sliceIdx = totalSize + 1;

                const cmdId = cache[2];
                const hasExtId = cmdId == 88 || cmdId == 86;
                const cmdExId = hasExtId ? cache[n] : undefined;

                const ack = cache[n + 1];

                if (hasExtId) {
                    if (!thePacketEncoder.validateMessageCdc(cache)) throw new Error("Invalid message CDC");
                }

                let callbackInfo: IPacketCallback | undefined;
                let wantedCmdId: number | undefined;
                let wantedCmdExId: number | undefined;
                let tryIdx = 0;
                while (callbackInfo = this.callbacksQueue[tryIdx++]) {
                    wantedCmdId = callbackInfo?.wantedCommandId;
                    wantedCmdExId = callbackInfo?.wantedCommandExId;

                    if ((wantedCmdId !== undefined && wantedCmdId !== cmdId) ||
                        (wantedCmdExId !== undefined && wantedCmdExId !== cmdExId)) {
                        continue;
                    }
                    break;
                }



                if (callbackInfo === undefined) {
                    console.warn("Unexpected command", cmdId, cmdExId, ack);
                    // TODO: trigger event
                    continue;
                }

                let data = cache.slice(0, sliceIdx);
                let packageType = thePacketEncoder.allPacketsTable[wantedCmdId + " " + wantedCmdExId];
                if ((wantedCmdId === undefined && wantedCmdExId === undefined) || packageType === undefined) {
                    callbackInfo.callback(data);
                } else {
                    if (!hasExtId || packageType.isValidPacket(data, n)) {
                        callbackInfo.callback(new packageType(data));
                    } else {
                        console.warn("ack", ack);

                        callbackInfo.callback(ack);
                    }
                }

                clearTimeout(callbackInfo.timeout);

                this.callbacksQueue.splice(tryIdx - 1, 1);
            } catch (e) {
                console.warn("Read error.", e, cache);

                await this.close();
                break;
            } finally {
                cache = cache.slice(sliceIdx);
            }
    }

    async query1() {
        let result = await this.writeDataAsync(new Query1H2DPacket(), 100);
        return result instanceof Query1ReplyD2HPacket ? result : null;
    }

    async getSystemVersion() {
        let result = await this.writeDataAsync(new SystemVersionH2DPacket());
        return result instanceof SystemVersionReplyD2HPacket ? result.version : null;
    }
}

export class V5SerialConnection extends VexSerialConnection {
    filters: SerialPortFilter[] = [
        { usbVendorId: 10376, usbProductId: SerialDeviceType.V5_BRAIN },
        { usbVendorId: 10376, usbProductId: SerialDeviceType.V5_BRAIN_DFU },
        { usbVendorId: 10376, usbProductId: SerialDeviceType.V5_CONTROLLER },
    ];

    async getDeviceStatus() {
        let result = await this.writeDataAsync(new GetDeviceStatusH2DPacket());
        return result instanceof GetDeviceStatusReplyD2HPacket ? result : null;
    }

    async getRadioStatus() {
        let result = await this.writeDataAsync(new GetRadioStatusH2DPacket());
        return result instanceof GetRadioStatusReplyD2HPacket ? result : null;
    }

    async getSystemFlags() {
        let result = await this.writeDataAsync(new GetSystemFlagsH2DPacket());
        return result instanceof GetSystemFlagsReplyD2HPacket ? result : null;
    }

    async getSystemStatus(timeout = 1000) {
        let result = await this.writeDataAsync(new GetSystemStatusH2DPacket(), timeout);
        return result instanceof GetSystemStatusReplyD2HPacket ? result : null;
    }

    async getMatchStatus() {
        let result = await this.writeDataAsync(new GetMatchStatusH2DPacket());
        return result instanceof MatchStatusReplyD2HPacket ? result : null;
    }

    async uploadProgramToDevice(
        iniConfig: ProgramIniConfig,
        binFileBuf: Uint8Array,
        coldFileBuf: Uint8Array | undefined,
        progressCallback: (state: string, current: number, total: number) => void) {
        let iniFileBuffer = new TextEncoder().encode(iniConfig.createIni());

        let basename = iniConfig.baseName;

        let iniRequest = {
            filename: basename + '.ini',
            buf: iniFileBuffer,
            downloadTarget: FileDownloadTarget.FILE_TARGET_QSPI,
            vid: FileVendor.USER,
            autoRun: false,
        };
        let r1 = await this.uploadFileToDevice(iniRequest, (current, total) => progressCallback("INI", current, total));
        if (!r1) return false;

        // let prjRequest = { filename: basename + '.prj', buf: prjfile, vid: FileVendor.USER, loadAddr: undefined, exttype: 0, linkedFile: undefined };
        // await this.uploadFileToDeviceAsync(prjRequest, onProgress);

        let coldRequest = coldFileBuf !== undefined
            ? {
                filename: basename + '_lib.bin',
                buf: coldFileBuf,
                downloadTarget: FileDownloadTarget.FILE_TARGET_QSPI,
                vid: 24, // PROS vendor id
                autoRun: false
            }
            : undefined;
        if (coldRequest) {
            let r2 = await this.uploadFileToDevice(coldRequest, (current, total) => progressCallback("COLD", current, total));
            if (!r2) return;
        }

        let binRequest = {
            filename: basename + '.bin',
            buf: binFileBuf,
            downloadTarget: FileDownloadTarget.FILE_TARGET_QSPI,
            vid: FileVendor.USER,
            loadAddress: coldFileBuf ? 0x07800000 : undefined,
            autoRun: iniConfig.autorun,
            linkedFile: coldRequest
        };
        let r3 = await this.uploadFileToDevice(binRequest, (current, total) => progressCallback("BIN", current, total));

        return r3;
    }

    async downloadFileToHost(
        request: IFileBasicInfo,
        downloadTarget = FileDownloadTarget.FILE_TARGET_QSPI,
        progressCallback?: (current: number, total: number) => void) {

        // TODO assert that the device is connected

        let { filename, vendor, loadAddress, size } = request;

        let nextAddress = loadAddress ?? USER_FLASH_USR_CODE_START;

        let p1 = await this.writeDataAsync(
            new InitFileTransferH2DPacket(
                FileInitAction.READ,
                downloadTarget,
                vendor,
                FileInitOption.NONE,
                new Uint8Array(),
                nextAddress,
                filename,
                ""));

        if (!(p1 instanceof InitFileTransferReplyD2HPacket)) throw new Error("InitFileTransferH2DPacket failed");

        let fileSize = size ?? p1.fileSize;

        // console.log("size:", fileSize);


        let bufferChunkSize = (p1.windowSize > 0 && p1.windowSize <= USER_PROG_CHUNK_SIZE) ? p1.windowSize : USER_PROG_CHUNK_SIZE;
        let bufferOffset = 0;
        let fileBuf = new Uint8Array(fileSize + bufferChunkSize);

        let lastBlock = false;

        while (!lastBlock) {
            if (fileSize <= bufferOffset + bufferChunkSize) {
                lastBlock = true;
            }

            let p2 = await this.writeDataAsync(new ReadFileH2DPacket(nextAddress, bufferChunkSize), 3000);

            if (!(p2 instanceof ReadFileReplyD2HPacket)) throw new Error("ReadFileReplyD2HPacket failed");

            fileBuf.set(new Uint8Array(p2.buf), bufferOffset);

            if (progressCallback)
                progressCallback(bufferOffset, fileSize);

            // next chunk
            bufferOffset += bufferChunkSize;
            nextAddress += bufferChunkSize;
        }

        let p3 = await this.writeDataAsync(new ExitFileTransferH2DPacket(FileExitAction.EXIT_HALT), 30000);
        // console.log(p3);

        fileBuf = fileBuf.slice(0, fileSize);

        return fileBuf;
    }

    async uploadFileToDevice(
        request: IFileWriteRequest,
        progressCallback?: (current: number, total: number) => void) {

        let { filename, buf, downloadTarget, vendor, loadAddress, exttype, autoRun, linkedFile } = request;

        if (buf === undefined) { // TODO: check connection status
            return false;
        }

        // no download to special capture or vision buffers

        // if (this.downloadTarget === VexDeviceWebSerial.FILE_TARGET_CBUF || this.downloadTarget === VexDeviceWebSerial.FILE_TARGET_VBUF) {
        //     // error !
        //     if (doneCallback != undefined) {
        //         doneCallback(false);
        //     }
        //     return;
        // }

        downloadTarget = downloadTarget ?? FileDownloadTarget.FILE_TARGET_QSPI;
        vendor = vendor ?? FileVendor.USER;

        let nextAddress = loadAddress ?? USER_FLASH_USR_CODE_START;

        // TODO if downloadTarget is FILE_TARGET_A1, FactoryEnable

        // TODO if buf.length > USER_FLASH_MAX_FILE_SIZE and downloadTarget is FILE_TARGET_QSPI, change to FILE_TARGET_DDR

        console.log("init file transfer", filename);

        let p1 = await this.writeDataAsync(
            new InitFileTransferH2DPacket(
                FileInitAction.WRITE,
                downloadTarget,
                vendor,
                FileInitOption.OVERWRITE,
                buf,
                nextAddress,
                filename,
                exttype));

        if (!(p1 instanceof InitFileTransferReplyD2HPacket)) throw new Error("InitFileTransferH2DPacket failed");
        console.log(p1);

        if (linkedFile !== undefined) {
            let p3 = await this.writeDataAsync(
                new LinkFileH2DPacket((linkedFile.vendor ?? FileVendor.USER), linkedFile.filename, 0), 10000);

            if (!(p3 instanceof LinkFileReplyD2HPacket)) throw new Error("LinkFileH2DPacket failed");
        }

        let bufferChunkSize = (p1.windowSize > 0 && p1.windowSize <= USER_PROG_CHUNK_SIZE) ? p1.windowSize : USER_PROG_CHUNK_SIZE;
        let bufferOffset = 0;

        let lastBlock = false;

        while (!lastBlock) {
            var tmpbuf;
            if (buf.byteLength - bufferOffset > bufferChunkSize) {
                tmpbuf = buf.subarray(bufferOffset, bufferOffset + bufferChunkSize);
            } else {
                // last chunk
                // word align length
                let length = (((buf.byteLength - bufferOffset) + 3) / 4) >>> 0;
                tmpbuf = new Uint8Array(length * 4);
                tmpbuf.set(buf.subarray(bufferOffset, buf.byteLength));
                lastBlock = true;
            }

            let p2 = await this.writeDataAsync(new WriteFileH2DPacket(nextAddress, tmpbuf), 3000);

            if (!(p2 instanceof WriteFileReplyD2HPacket)) throw new Error("WriteFileReplyD2HPacket failed");

            if (progressCallback)
                progressCallback(bufferOffset, buf.byteLength);

            // next chunk
            bufferOffset += bufferChunkSize;
            nextAddress += bufferChunkSize;
        }

        let p4 = await this.writeDataAsync(new ExitFileTransferH2DPacket(autoRun ? FileExitAction.EXIT_RUN : FileExitAction.EXIT_HALT), 30000);

        return p4 instanceof ExitFileTransferReplyD2HPacket;
    }

    async setMatchMode(mode: MatchMode) {
        let result = await this.writeDataAsync(new UpdateMatchModeH2DPacket(mode, 0));
        return result instanceof MatchModeReplyD2HPacket ? result : null;
    }

    async loadProgram(value: SlotNumber | string) {
        let result = await this.writeDataAsync(new LoadFileActionH2DPacket(FileVendor.USER, FileLoadAction.RUN, value));
        return result instanceof LoadFileActionReplyD2HPacket ? result : null;
    }

    async stopProgram() {
        let result = await this.writeDataAsync(new LoadFileActionH2DPacket(FileVendor.USER, FileLoadAction.STOP, ""));
        return result instanceof LoadFileActionReplyD2HPacket ? result : null;
    }

    async mockTouch(x: number, y: number, press: boolean) {
        let result = await this.writeDataAsync(new SendDashTouchH2DPacket(x, y, press));
        return result instanceof SendDashTouchReplyD2HPacket ? result : null;
    }
}

function logData(data: Uint8Array, limitedSize: number) {
    if (data === undefined) return;

    limitedSize || (limitedSize = data.length);
    let a = "";
    for (let n = 0; n < data.length && n < limitedSize; n++)
        a += ("00" + data[n].toString(16)).substr(-2, 2) + " ";
    limitedSize < data.length && (a += " ... ")

    // console.log(a);

    // XXX: NOT USED?
}

function binaryArrayJoin(left: Uint8Array | ArrayBuffer | null, right: Uint8Array | ArrayBuffer | null): Uint8Array {
    const leftSize = left ? left.byteLength : 0;
    const rightSize = right ? right.byteLength : 0;
    const all = new Uint8Array(leftSize + rightSize);
    return 0 === all.length ? new Uint8Array() : (left && all.set(new Uint8Array(left), 0), right && all.set(new Uint8Array(right), leftSize), all);
}
