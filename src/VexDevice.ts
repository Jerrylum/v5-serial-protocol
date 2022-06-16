import { unzip } from "unzipit";
import { MatchMode, SerialDeviceType, SlotNumber, ISmartDeviceInfo, SmartDeviceType, FileVendor, IProgramInfo, FileExitAction, IFileHandle, FileDownloadTarget, USER_FLASH_USR_CODE_START, IFileBasicInfo, IFileWriteRequest, RadioChannelType } from "./Vex";
import { V5SerialConnection } from "./VexConnection";
import { VexEventTarget } from "./VexEvent";
import { VexFirmwareVersion } from "./VexFirmwareVersion";
import { ProgramIniConfig } from "./VexIniConfig";
import { EraseFileH2DPacket, EraseFileReplyD2HPacket, ExitFileTransferH2DPacket, ExitFileTransferReplyD2HPacket, FactoryEnableH2DPacket, FactoryEnableReplyD2HPacket, FactoryStatusH2DPacket, FactoryStatusReplyD2HPacket, FileClearUpH2DPacket, FileClearUpReplyD2HPacket, FileControlH2DPacket, FileControlReplyD2HPacket, GetDirectoryEntryH2DPacket, GetDirectoryEntryReplyD2HPacket, GetDirectoryFileCountH2DPacket, GetDirectoryFileCountReplyD2HPacket, GetProgramSlotInfoH2DPacket, GetProgramSlotInfoReplyD2HPacket, ReadKeyValueH2DPacket, ReadKeyValueReplyD2HPacket, WriteKeyValueH2DPacket, WriteKeyValueReplyD2HPacket } from "./VexPacket";

export function downloadFileFromInternet(link: string) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
        var oReq = new XMLHttpRequest();
        oReq.open("GET", link, true);
        oReq.responseType = "arraybuffer";

        oReq.onload = function (_oEvent) {
            var arrayBuffer = oReq.response; // Note: not oReq.responseText
            resolve(arrayBuffer);
        };

        oReq.onerror = function (oEvent) {
            reject(oEvent);
        };

        oReq.send(null);
    });
}

export function sleepUntil(f: (...args: any[]) => any, timeout: number, interval = 20) {
    return new Promise<boolean>((resolve) => {
        const timeWas = new Date().getTime();
        const wait = setInterval(async function () {
            if (await f()) {
                clearInterval(wait);
                resolve(true);
            } else if (new Date().getTime() - timeWas > timeout) { // Timeout
                clearInterval(wait);
                resolve(false);
            }
        }, interval);
    });
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function shallowEqual(object1: any, object2: any) {
    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);
    if (keys1.length !== keys2.length) {
        return false;
    }
    for (let key of keys1) {
        if (object1[key] !== object2[key]) {
            return false;
        }
    }
    return true;
}

export abstract class VexSerialDevice extends VexEventTarget {
    connection: V5SerialConnection | undefined;
    defaultSerial: Serial;

    get isConnected() {
        return this.connection ? this.connection.isConnected : false;
    }

    get deviceType(): SerialDeviceType | undefined {
        return this.isConnected ? this.connection?.port?.getInfo().usbProductId : undefined;
    }

    constructor(defaultSerial: Serial) {
        super();
        this.defaultSerial = defaultSerial;
    }

    abstract connect(conn?: V5SerialConnection): Promise<boolean>;

    abstract disconnect(): void;
}



class V5SerialDeviceProxyHandler implements ProxyHandler<{}> {
    device?: V5SerialDevice;
    parent?: V5SerialDeviceProxyHandler;
    rootkey?: string

    constructor(device?: V5SerialDevice, parent?: V5SerialDeviceProxyHandler, rootkey?: string) {
        this.device = device;
        this.parent = parent;
        this.rootkey = rootkey;
    }

    get(target: any, key: any): any {
        if (
            typeof target[key] === 'object' &&
            target[key] !== null &&
            (typeof key !== "string" ? true : !key.startsWith("_"))) {
            return new Proxy(target[key], new V5SerialDeviceProxyHandler(this.device, this, key));
        } else {
            return target[key];
        }
    }

    set(target: any, key: any, value: any): boolean {
        let oldValue = (target as any)[key];
        if (oldValue === value) {
            return true;
        } else if (
            typeof oldValue === "object" &&
            typeof value === "object" &&
            oldValue !== null && value !== null) {
            if (shallowEqual(oldValue, value)) return true;
        }

        (target as any)[key] = value;

        this.parent?.childSet(this.rootkey, key, value);

        return true;
    }

    childSet(rootkey: string | undefined, subkey: string, value: any) {
        if (this.parent)
            this.parent.childSet(this.rootkey, rootkey + '.' + subkey, value);
        else
            console.log("changed", rootkey + '.' + subkey, value); // TODO
    }
}

class V5SerialDeviceState {
    _instance: V5SerialDevice;
    _isFileTransferring = false;

    brain = {
        activeProgram: 0,
        battery: {
            batteryPercent: 0,
            isCharging: false
        },
        button: {
            isPressed: false,
            isDoublePressed: false
        },
        cpu0Version: VexFirmwareVersion.allZero(),
        cpu1Version: VexFirmwareVersion.allZero(),
        isAvailable: false,
        settings: {
            isScreenReversed: false,
            isWhiteTheme: false,
            usingLanguage: 0
        },
        systemVersion: VexFirmwareVersion.allZero(),
        uniqueId: 0
    }
    controllers = [
        {
            battery: 0,
            isAvailable: false,
            isCharging: false
        },
        {
            battery: 0,
            isAvailable: false
        }
    ];
    devices: ISmartDeviceInfo[] = [];
    isFieldControllerConnected = false;
    matchMode: MatchMode = "disabled";
    radio = {
        channel: 0,
        isAvailable: false,
        isConnected: false,
        isVexNet: false,
        isRadioData: false,
        latency: 0,
        signalQuality: 0,
        signalStrength: 0
    }

    constructor(instance: V5SerialDevice) {
        this._instance = instance;
    }
}

export class V5Brain {
    private state: V5SerialDeviceState;

    constructor(state: V5SerialDeviceState) {
        this.state = state;
    }

    get isRunningProgram() {
        return this.activeProgram !== 0;
    }

    get activeProgram() { return this.state.brain.activeProgram; }

    set activeProgram(value) {
        (async () => {
            if (this.state.brain.activeProgram === value) return;

            let conn = this.state._instance.connection;
            if (!conn) return;

            let fn = value === 0
                ? await conn.stopProgram()
                : await conn.loadProgram(value as SlotNumber);

            if (fn) this.state.brain.activeProgram = value;
        })();
    }

    get battery() { return new V5Battery(this.state); }

    get button() { return new V5BrainButton(this.state); }

    get cpu0Version() { return this.state.brain.cpu0Version; }

    get cpu1Version() { return this.state.brain.cpu1Version; }

    get isAvailable() { return this.state.brain.isAvailable; }

    get settings() { return new V5BrainSettings(this.state); }

    get systemVersion() { return this.state.brain.systemVersion; }

    get uniqueId() { return this.state.brain.uniqueId; }

    async getValue(key: string) {
        let result = await this.state._instance.connection?.writeDataAsync(new ReadKeyValueH2DPacket(key));
        return result instanceof ReadKeyValueReplyD2HPacket ? result.value : undefined;
    }

    async setValue(key: string, value: string) {
        let result = await this.state._instance.connection?.writeDataAsync(new WriteKeyValueH2DPacket(key, value));
        return result instanceof WriteKeyValueReplyD2HPacket ? true : false;
    }

    async listFiles(vendor = FileVendor.USER) {
        let conn = this.state._instance.connection;
        if (!conn) return undefined;

        let result = await conn.writeDataAsync(new GetDirectoryFileCountH2DPacket(vendor));
        if (!(result instanceof GetDirectoryFileCountReplyD2HPacket)) return undefined;

        let files: IFileHandle[] = [];
        for (let i = 0; i < result.count; i++) {
            let result2 = await conn.writeDataAsync(new GetDirectoryEntryH2DPacket(i));
            if (!(result2 instanceof GetDirectoryEntryReplyD2HPacket)) return undefined;

            // .file is undefined if the file is not found
            // .file is a file entry but not a file handle
            if (result2.file) {
                files.push({
                    filename: result2.file.filename,
                    vendor,
                    loadAddress: result2.file.loadAddress,

                    size: result2.file.size,
                    crc32: result2.file.crc32,

                    type: result2.file.type,
                    timestamp: result2.file.timestamp,
                    version: result2.file.version
                });
            }
        }

        return files;
    }

    async listProgram() {
        let conn = this.state._instance.connection;
        if (!conn?.isConnected) return undefined;

        let files = await this.listFiles(FileVendor.USER);
        if (files === undefined) return undefined;

        let programList: IProgramInfo[] = [];
        let iniFiles = files.filter((file => file && file.filename.search(/.ini$/) > 0)) as IFileHandle[];

        for (let i = 0; i < iniFiles.length; i++) {
            let ini = iniFiles[i];
            if (!ini.size) continue;

            let programName = (/(.+?)(\.[^.]*$|$)/.exec(ini.filename) || "")[1];
            let bin = files.filter((e => e && e.filename === programName + ".bin"))[0];
            if (!bin || !bin.timestamp || !bin.size) continue;

            let n = new Date();
            n.setTime(1000 * bin.timestamp);
            let program: IProgramInfo = {
                name: programName,
                binfile: bin.filename,
                size: ini.size + bin.size,
                slot: -1,
                time: n,
                requestedSlot: -1
            };

            let result2 = await conn.writeDataAsync(new GetProgramSlotInfoH2DPacket(FileVendor.USER, program.binfile));
            if (result2 instanceof GetProgramSlotInfoReplyD2HPacket) {
                program.slot = result2.slot;
                program.requestedSlot = result2.requestedSlot;
            }
            programList.push(program);
        }
        return programList;
    }

    async readFile(
        request: IFileBasicInfo | string,
        downloadTarget = FileDownloadTarget.FILE_TARGET_QSPI,
        progressCallback?: (current: number, total: number) => void) {

        let conn = this.state._instance.connection;
        if (!conn?.isConnected) return undefined;

        this.state._isFileTransferring = true;

        let handle: IFileBasicInfo;

        // If request is a string, then it is a filename
        if (typeof request === "string") {
            handle = { filename: request, vendor: FileVendor.USER };
        } else {
            handle = request;
        }

        try { return conn.downloadFileToHost(handle, downloadTarget, progressCallback); }
        catch (e) { throw e; }
        finally { this.state._isFileTransferring = false; }


    }

    async removeFile(request: IFileBasicInfo | string) {
        let conn = this.state._instance.connection;
        if (!conn?.isConnected) return undefined;

        let vendor: FileVendor, filename: string;

        // If request is a string, then it is a filename
        if (typeof request === "string") {
            vendor = FileVendor.USER;
            filename = request;
        } else {
            vendor = request.vendor;
            filename = request.filename;
        }

        let result = await conn.writeDataAsync(new EraseFileH2DPacket(vendor, filename));
        let result2 = await conn.writeDataAsync(new ExitFileTransferH2DPacket(FileExitAction.EXIT_HALT));

        if (!(result instanceof EraseFileReplyD2HPacket)) return false;
        if (!(result2 instanceof ExitFileTransferReplyD2HPacket)) return false;

        return true;
    }

    async removeAllFiles() {
        let conn = this.state._instance.connection;
        if (!conn?.isConnected) return undefined;

        let result = await conn.writeDataAsync(new FileClearUpH2DPacket(FileVendor.USER), 30000);
        return result instanceof FileClearUpReplyD2HPacket ? true : false;
    }

    async uploadFirmware(
        publicUrl = "https://content.vexrobotics.com/vexos/public/V5/",
        usingVersion?: string,
        progressCallback?: (state: string, current: number, total: number) => void) {

        let device = this.state._instance;
        let conn = device.connection;
        if (!conn?.isConnected) return undefined;

        const pcb = progressCallback ?? (() => { });

        let vexos: ArrayBuffer, bootBin: ArrayBuffer, assertBin: ArrayBuffer;

        try {
            if (usingVersion === undefined) {
                pcb("FETCH CATALOG", 0, 1);

                const catalog = await downloadFileFromInternet(publicUrl + "catalog.txt");
                let latestVersion = new TextDecoder().decode(catalog);
                usingVersion = latestVersion;

                pcb("FETCH CATALOG", 1, 1);

                console.log("fetched catalog.txt", latestVersion);
            }

            pcb("FETCH VEXOS", 0, 1);

            vexos = await downloadFileFromInternet(publicUrl + usingVersion + ".vexos");

            pcb("FETCH VEXOS", 1, 1);
            pcb("UNZIP VEXOS", 0, 1);

            let { entries } = await unzip(vexos);

            bootBin = await entries[usingVersion + "/BOOT.bin"].arrayBuffer();
            assertBin = await entries[usingVersion + "/assets.bin"].arrayBuffer();

            pcb("UNZIP VEXOS", 1, 1);
        } catch (e) {
            return undefined;
        }

        try {
            this.state._isFileTransferring = true;

            pcb("FACTORY ENB BOOT", 0, 0);

            let result = await conn.writeDataAsync(new FactoryEnableH2DPacket());
            if (!(result instanceof FactoryEnableReplyD2HPacket)) return false;

            let bootWriteRequest: IFileWriteRequest = {
                filename: "null.bin",
                vendor: FileVendor.USER,
                loadAddress: USER_FLASH_USR_CODE_START,
                buf: new Uint8Array(bootBin),
                downloadTarget: FileDownloadTarget.FILE_TARGET_B1,
                exttype: "bin",
                autoRun: true, // need to set EXIT_RUN
                linkedFile: undefined
            };

            let result2 = await conn.uploadFileToDevice(bootWriteRequest, (c, t) => pcb("UPLOAD BOOT", c, t));
            if (!result2) return false;

            while (true) {
                let result3 = await conn.writeDataAsync(new FactoryStatusH2DPacket(), 10000);
                if (result3 instanceof FactoryStatusReplyD2HPacket) {
                    switch (result3.status) {
                        case 2:
                            pcb("ERASE BOOT", result3.percent, 100);
                            break;
                        case 3:
                            pcb("WRITE BOOT", result3.percent, 100);
                            break;
                        case 4:
                            pcb("VERIFY BOOT", result3.percent, 100);
                            break;
                        case 8:
                            pcb("FINISHING BOOT", result3.percent, 100);
                            break;
                    }
                    if (result3.status === 0 && result3.percent === 100) break;
                } else {
                    return false;
                }
                await sleep(500);
            }

            pcb("FACTORY ENB ASSERT", 0, 0);

            let result5 = await conn.writeDataAsync(new FactoryEnableH2DPacket());
            if (!(result5 instanceof FactoryEnableReplyD2HPacket)) return false;

            let assertWriteRequest: IFileWriteRequest = {
                filename: "null.bin",
                vendor: FileVendor.USER,
                loadAddress: USER_FLASH_USR_CODE_START,
                buf: new Uint8Array(assertBin),
                downloadTarget: FileDownloadTarget.FILE_TARGET_A1,
                exttype: "bin",
                autoRun: true, // need to set EXIT_RUN
                linkedFile: undefined
            }

            let result6 = await conn.uploadFileToDevice(assertWriteRequest, (c, t) => pcb("UPLOAD ASSERT", c, t));
            if (!result6) return false;

            while (true) {
                let result7 = await conn.writeDataAsync(new FactoryStatusH2DPacket(), 10000);
                if (result7 instanceof FactoryStatusReplyD2HPacket) {
                    switch (result7.status) {
                        case 2:
                            pcb("ERASE ASSERT", result7.percent, 100);
                            break;
                        case 3:
                            pcb("WRITE ASSERT", result7.percent, 100);
                            break;
                        case 4:
                            pcb("VERIFY ASSERT", result7.percent, 100);
                            break;
                        case 8:
                            pcb("FINISHING ASSERT", result7.percent, 100);
                            break;
                    }

                    if (result7.status === 0 && result7.percent === 100) break;
                } else {
                    return false;
                }
                await sleep(500);
            }

        }
        catch (e) { throw e; }
        finally { this.state._isFileTransferring = false; }

        return true;
    }

    async uploadProgram(
        iniConfig: ProgramIniConfig,
        binFileBuf: Uint8Array,
        coldFileBuf: Uint8Array | undefined,
        progressCallback: (state: string, current: number, total: number) => void) {

        let device = this.state._instance;
        let conn = device.connection;
        if (!conn?.isConnected) return undefined;

        this.state._isFileTransferring = true;

        try {
            if (device.isV5Controller) {
                await sleep(250);

                // V5 Controller doesn\'t appear to be connected to a V5 Brain
                if (!device.refresh()) return undefined;

                console.log("Transferring to download channel");

                let p1 = await device.radio.changeChannel(RadioChannelType.DOWNLOAD);
                if (!p1) return false;

                await sleep(250);
                await sleepUntil(async () => await conn?.getSystemStatus(150), 10000, 200);

                console.log("Transferred to download channel");
            }

            let p2 = await conn.uploadProgramToDevice(iniConfig, binFileBuf, coldFileBuf, progressCallback);
            if (!p2) return false;

            if (device.isV5Controller) {
                // Disconnected
                if (!device.brain.isAvailable) return false;

                console.log("Transferring back to pit channel");

                let p3 = await device.radio.changeChannel(RadioChannelType.PIT);
                if (!p3) return false;

                await sleep(250);
                await sleepUntil(async () => await conn?.getSystemStatus(150), 10000, 200);

                console.log("All done");
            }

            return true;
        }
        catch (e) { throw e; }
        finally { this.state._isFileTransferring = false; }
    }

    async writeFile(
        request: IFileWriteRequest,
        progressCallback?: (current: number, total: number) => void) {

        this.state._isFileTransferring = true;

        let conn = this.state._instance.connection;
        if (!conn?.isConnected) return undefined;

        try { return conn.uploadFileToDevice(request, progressCallback); }
        catch (e) { throw e; }
        finally { this.state._isFileTransferring = false; }
    }
}

export class V5Battery {
    private state: V5SerialDeviceState;

    constructor(state: V5SerialDeviceState) {
        this.state = state;
    }

    get batteryPercent() {
        return this.state.brain.battery.batteryPercent;
    }

    get isCharging() {
        return this.state.brain.battery.isCharging;
    }
}

export class V5BrainButton {
    private state: V5SerialDeviceState;

    constructor(state: V5SerialDeviceState) {
        this.state = state;
    }

    get isPressed() {
        return this.state.brain.button.isPressed;
    }

    get isDoublePressed() {
        return this.state.brain.button.isDoublePressed;
    }
}

export class V5BrainSettings {
    private state: V5SerialDeviceState;

    constructor(state: V5SerialDeviceState) {
        this.state = state;
    }

    get isScreenReversed() {
        return this.state.brain.settings.isScreenReversed;
    }

    get isWhiteTheme() {
        return this.state.brain.settings.isWhiteTheme;
    }

    get usingLanguage() {
        return this.state.brain.settings.usingLanguage;
    }
}

export class V5Controller {
    private state: V5SerialDeviceState;
    private controllerIndex: number;

    constructor(state: V5SerialDeviceState, controllerIndex: number) {
        this.state = state;
        this.controllerIndex = controllerIndex;
    }

    get batteryPercent() {
        return this.state.controllers[this.controllerIndex].battery;
    }

    get isMasterController() {
        return this.controllerIndex === 0;
    }

    get isAvailable() {
        return this.state.controllers[this.controllerIndex].isAvailable;
    }

    get isCharging(): boolean | undefined {
        return this.state.controllers[this.controllerIndex].isCharging;
    }
}

export class V5SmartDevice {
    private state: V5SerialDeviceState;
    private deviceIndex: number;

    constructor(state: V5SerialDeviceState, index: number) {
        this.state = state;
        this.deviceIndex = index;
    }

    get isAvailable() {
        return this.state.devices[this.deviceIndex] !== undefined;
    }

    get port() {
        return this.deviceIndex;
    }

    get type() {
        return this.isAvailable ? this.state.devices[this.deviceIndex].type : SmartDeviceType.EMPTY;
    }

    get version() {
        return this.isAvailable ? this.state.devices[this.deviceIndex].version : 0;
    }
}

export class V5Radio {
    private state: V5SerialDeviceState;

    constructor(state: V5SerialDeviceState) {
        this.state = state;
    }

    get channel() {
        return this.state.radio.channel;
    }

    get isAvailable() {
        return this.state.radio.isAvailable;
    }

    get isConnected() {
        return this.state.radio.isConnected;
    }

    get isVexNet() {
        return this.state.radio.isVexNet;
    }

    get isRadioData() {
        return this.state.radio.isRadioData;
    }

    get latency() {
        return this.state.radio.latency;
    }

    async changeChannel(channel: RadioChannelType) {
        let result = await this.state._instance.connection?.writeDataAsync(new FileControlH2DPacket(1, channel));
        return result instanceof FileControlReplyD2HPacket ? true : false;
    }
}

export class V5SerialDevice extends VexSerialDevice {
    autoReconnect = true;
    autoRefresh = true;
    pauseRefreshOnFileTransfer = true;

    protected _isReconnecting = false;
    protected proxy = new V5SerialDeviceProxyHandler(this);
    state = new Proxy<V5SerialDeviceState>(new V5SerialDeviceState(this), this.proxy);

    constructor(defaultSerial: Serial) {
        super(defaultSerial);

        setInterval(() => {
            if (this.autoRefresh) {
                if (!this.isConnected) {
                    this.state.brain.isAvailable = false;
                    return;
                }

                if (this.pauseRefreshOnFileTransfer && !this.state._isFileTransferring) {
                    this.refresh();
                }
            }
        }, 200);
    }

    get isV5Controller() {
        return this.deviceType === SerialDeviceType.V5_CONTROLLER;
    }

    get brain() {
        return new V5Brain(this.state);
    }

    get controllers() {
        return [new V5Controller(this.state, 0), new V5Controller(this.state, 1)];
    }

    get devices() {
        let rtn = [];
        for (let i = 1; i <= this.state.devices.length; i++) {
            if (this.state.devices[i])
                rtn.push(new V5SmartDevice(this.state, i));
        }
        return rtn;
    }

    get isFieldControllerConnected() {
        return this.state.isFieldControllerConnected;
    }

    get matchMode() { return this.state.matchMode; }

    set matchMode(value) {
        (async () => {
            if (await this.connection?.setMatchMode(value))
                this.state.matchMode = value;
        })();
    }

    get radio() { return new V5Radio(this.state); }

    async mockTouch(x: number, y: number, press: boolean) {
        return (await this.connection?.mockTouch(x, y, press)) ? true : false;
    }

    async connect(conn?: V5SerialConnection): Promise<boolean> {
        if (this.isConnected) return true;

        if (conn?.isConnected) {
            if (await conn.query1() === null) return false;

            this.connection = conn;
        } else {
            let tryIdx = 0;
            while (true) {
                let c = new V5SerialConnection(this.defaultSerial);

                let result = await c.open(tryIdx++, true);
                if (result === undefined) return false; // no port left
                if (result === false) { // has been opened
                    await c.close();
                    continue;
                }

                if (await c.query1() === null) { // no response
                    await c.close();
                    continue;
                }

                this.connection = c;
                break;
            }
        }

        if (!this.isConnected) return false;

        await this.doAfterConnect();

        return true;
    }

    async disconnect() {
        await this.connection?.close();
        this.connection = undefined;
    }

    async reconnect(timeout: number = 0): Promise<boolean> {
        if (this.isConnected) return true;
        if (timeout < 0) return false;

        let endTime = new Date().getTime() + timeout;

        if (this._isReconnecting) {
            let successB4Timeout;
            do {
                successB4Timeout = await sleepUntil(() => !this._isReconnecting, timeout || 1000);
            } while (timeout === 0 && !successB4Timeout);

            if (this.isConnected) return true;
            if (!successB4Timeout) return false;
        }

        this._isReconnecting = true;

        while (timeout === 0 || new Date().getTime() > endTime) {
            // console.log("try to reconnect");

            let tryIdx = 0;
            while (true) {
                let c = new V5SerialConnection(this.defaultSerial);

                let result = await c.open(tryIdx++, false);

                if (result === undefined) break; // no port left
                if (result === false) { // has been opened
                    await c.close();
                    continue;
                }

                let result2 = await c.getSystemStatus(200);
                if (result2 === null) { // no response
                    await c.close();
                    continue;
                }

                if (this.brain.uniqueId !== 0 && result2.uniqueId !== this.brain.uniqueId) { // uuid not match
                    await c.close();
                    continue;
                }

                this.connection = c;
                break;
            }

            if (this.isConnected) break;

            // try again every second or when the number of ports is different
            let getPortCount = async () => (await this.defaultSerial.getPorts()).length;
            let portsCount = await getPortCount();
            await sleepUntil(async () => await getPortCount() !== portsCount, 1000);
        }

        this._isReconnecting = false;

        if (!this.isConnected) return false;

        this.doAfterConnect();

        return true;
    }

    private async doAfterConnect() {
        if (!this.connection) return;

        console.log("doAfterConnect");

        this.connection.on("disconnected", (_data) => {
            if (this.autoReconnect) this.reconnect();
        });

        await this.refresh();
    }

    async refresh() {
        // let matchStatus = await this.connection?.getMatchStatus();
        // console.log(matchStatus);

        let ssPacket = await this.connection?.getSystemStatus();
        if (!ssPacket) {
            this.state.brain.isAvailable = false;
            return false;
        }

        this.state.brain.cpu0Version = ssPacket.cpu0Version;
        this.state.brain.cpu1Version = ssPacket.cpu1Version;
        this.state.brain.systemVersion = ssPacket.systemVersion;

        let flags2 = ssPacket.sysflags[2];
        this.state.controllers[0].isCharging = (flags2 & 0b10000000) !== 0;
        this.state.matchMode = flags2 & 0b00100000 ? "disabled" : (flags2 & 0b01000000 ? "autonomous" : "driver");
        this.state.isFieldControllerConnected = (flags2 & 0b00010000) !== 0;

        let flags4 = ssPacket.sysflags[4];
        this.state.brain.settings.usingLanguage = (flags4 & 0b11110000) >> 4;
        this.state.brain.settings.isWhiteTheme = (flags4 & 0b00000100) !== 0;
        this.state.brain.settings.isScreenReversed = (flags4 & 0b00000001) === 0;

        this.state.brain.uniqueId = ssPacket.uniqueId;

        // let sfPacket = await this.connection?.getSystemFlags();
        // if (!sfPacket) return false;

        // let flags5 = sfPacket.flags; // Math.pow(2, 32 - i);
        // this.state.radio.isRadioData = (flags5 & Math.pow(2, 32 - 12)) !== 0;
        // this.state.brain.button.isDoublePressed = (flags5 & Math.pow(2, 32 - 14)) !== 0;
        // this.state.brain.battery.isCharging = (flags5 & Math.pow(2, 32 - 15)) !== 0;
        // this.state.brain.button.isPressed = (flags5 & Math.pow(2, 32 - 17)) !== 0;
        // this.state.radio.isVexNet = (flags5 & Math.pow(2, 32 - 18)) !== 0;
        // this.state.controllers[1].isAvailable = (flags5 & Math.pow(2, 32 - 19)) !== 0;
        // this.state.radio.isConnected = (flags5 & Math.pow(2, 32 - 22)) !== 0;
        // this.state.radio.isAvailable = (flags5 & Math.pow(2, 32 - 23)) !== 0;
        // this.state.brain.battery.batteryPercent = sfPacket.battery || 0;
        // this.state.controllers[0].isAvailable = this.state.radio.isConnected || this.state.controllers[0].isCharging;
        // this.state.controllers[0].battery = sfPacket.controllerBatteryPercent || 0;
        // this.state.controllers[1].battery = sfPacket.partnerControllerBatteryPercent || 0;
        // this.state.brain.activeProgram = sfPacket.currentProgram;
        // this.state.brain.isAvailable = !this.isV5Controller || this.state.radio.isConnected;

        // let rdPacket = await this.connection?.getRadioStatus();
        // if (!rdPacket) return false;

        // this.state.radio.channel = rdPacket.channel;
        // this.state.radio.latency = rdPacket.timeslot;
        // this.state.radio.signalQuality = rdPacket.quality;
        // this.state.radio.signalStrength = rdPacket.strength;

        // let dsPacket = await this.connection?.getDeviceStatus();
        // if (!dsPacket) return false;

        // let missingPorts = this.state.devices.map((d) => d?.port).filter((p) => p !== undefined);

        // for (let i = 0; i < dsPacket.devices.length; i++) {
        //     let device = dsPacket.devices[i];
        //     this.state.devices[device.port] = device;

        //     // remove device port from missing ports
        //     missingPorts = missingPorts.filter((p) => p !== device.port);
        // }

        // missingPorts.forEach((port) => delete this.state.devices[port]);

        // console.log(this.state);


        return true;
    }
}