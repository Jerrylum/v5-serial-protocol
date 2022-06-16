import { VexFirmwareVersion } from "./VexFirmwareVersion";
import { HostBoundPacket } from "./VexPacket";

export const USER_PROG_CHUNK_SIZE = 4096; // chunk size
export const USER_FLASH_START = 0x03000000; // start address of memory
export const USER_FLASH_SYS_CODE_START = 0x03400000; // start address of system code
export const USER_FLASH_USR_CODE_START = 0x03800000; // start address of user code
export const USER_FLASH_END = 0x08000000; // end address of memory
export const USER_FLASH_MAX_FILE_SIZE = 0x200000; // maximum file size for qspi
export const USER_FLASH_START_B = 0x10200000; // special app flash start
export const USER_FLASH_END_B = 0x10400000; // special app flash end
export const USER_FLASH_START_C = 0x30200000; // special app flash start
export const USER_FLASH_END_C = 0x31000000; // special app flash end

export interface ISmartDeviceInfo {
    port: number;
    type: SmartDeviceType;
    status: number;
    betaversion: number;
    version: number;
    bootversion: number;
}

export interface IFileBasicInfo {
    filename: string;
    vendor: FileVendor;
    loadAddress?: number;
    size?: number;
}

export interface IFileMetadata {
    loadAddress: number;
    size: number;
    crc32: number;
    type: string;
    timestamp: number;
    version: VexFirmwareVersion;
}

export interface IFileHandle extends IFileBasicInfo, IFileMetadata {
    loadAddress: number
    size: number;
}

export interface IFileEntry extends IFileMetadata {
    index: number;
    filename: string;
}

export interface IFileWriteRequest {
    filename: string;
    vendor?: FileVendor;
    loadAddress?: number;
    buf?: Uint8Array;
    downloadTarget: FileDownloadTarget;
    exttype?: string;
    autoRun: boolean;
    linkedFile?: IFileWriteRequest;
}

export interface IProgramInfo {
    name: string;
    binfile: string,
    size: number,
    time: Date,
    slot: number,
    requestedSlot: number
}

export interface IPacketCallback {
    callback: (data: HostBoundPacket | ArrayBuffer | AckType) => void;
    timeout: NodeJS.Timeout;
    wantedCommandId: number | undefined;
    wantedCommandExId: number | undefined;
}

export type DataArray = ArrayBuffer | Uint8Array;

export type MatchMode = "driver" | "autonomous" | "disabled";

export enum FileVendor { // a.k.a vid
    USER = 1,
    SYS = 15,
    DEV1 = 16,
    DEV2 = 24,
    DEV3 = 32,
    DEV4 = 40,
    DEV5 = 48,
    DEV6 = 56,
    VEXVM = 64,
    VEX = 240,
    UNDEFINED = 241
}

export enum FileDownloadTarget {
    FILE_TARGET_DDR = 0,
    FILE_TARGET_QSPI = 1,
    FILE_TARGET_CBUF = 2,
    FILE_TARGET_VBUF = 3,
    FILE_TARGET_DDRC = 4,
    FILE_TARGET_DDRE = 5,
    FILE_TARGET_FLASH = 6, // for IQ2
    FILE_TARGET_RADIO = 7, // for IQ2
    FILE_TARGET_A1 = 13,
    FILE_TARGET_B1 = 14,
    FILE_TARGET_B2 = 15
}

export enum FileInitAction {
    WRITE = 1,
    READ = 2
}

export enum FileInitOption {
    NONE = 0,
    OVERWRITE = 1,
}

export enum FileLoadAction {
    RUN = 0,
    STOP = 128
}

export enum FileExitAction {
    EXIT_NONE = 0,
    EXIT_RUN = 1,
    EXIT_HALT = 3
}

export enum RadioChannelType {
    PIT = 0,
    DOWNLOAD = 1
}

export type SlotNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type ZerobaseSlotNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type PortNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21;

export enum AckType {
    CDC2_ACK = 118,
    CDC2_NACK = 255,
    CDC2_NACK_PACKET_CRC = 206,
    CDC2_NACK_CMD_LENGTH = 208,
    CDC2_NACK_SIZE = 209,
    CDC2_NACK_CRC = 210,
    CDC2_NACK_FILE = 211,
    CDC2_NACK_INIT = 212,
    CDC2_NACK_FUNC = 213,
    CDC2_NACK_ALIGN = 214,
    CDC2_NACK_ADDR = 215,
    CDC2_NACK_INCOMPLETE = 216,
    CDC2_NACK_DIR_INDEX = 217,
    CDC2_NACK_MAX_USER_FILES = 218,
    CDC2_NACK_FILE_EXISTS = 219,
    CDC2_NACK_FILE_SYS_FULL = 220,
    TIMEOUT = 256,
    WRITE_ERROR = 257
}

export enum SmartDeviceType {
    EMPTY = 0,
    V5_POWER = 1,
    MOTOR = 2,
    LED = 3,
    ABS_ENCODER_SENSOR = 4,
    CR_MOTOR = 5,
    IMU_SENSOR = 6,
    DISTANCE_SENSOR = 7,
    RADIO_SENSOR = 8,
    CONTROLLER = 9,
    BRAIN = 10,
    VISION_SENSOR = 11,
    ADI = 12,
    PARTNER_CONTROLLER = 13,
    BATTERY = 14,
    SOL = 15,
    OPTICAL_SENSOR = 16,
    MAGNET = 17,
    GPS_SENSOR = 20,
    UNDEFINED_SENSOR = 255
}

export enum SerialDeviceType {
    V5_BRAIN = 1281,
    V5_BRAIN_DFU = 1282,
    V5_CONTROLLER = 1283,

    XILINX = 256,

    IQ_BRAIN = 2,
    IQ_BRAIN2 = 3,
    IQ_BRAIN_DFU = 255,

    IQ2_BRAIN = 512,
    IQ2_BRAIN_DFU = 527,
    IQ2_CONTROLLER = 528,
    IQ2_CONTROLLER_DFU = 543,

    EXP_BRAIN = 1536,
    EXP_BRAIN_DFU = 1551,

    EXP_CONTROLLER = 1552,
    EXP_CONTROLLER_DFU = 1567,

    PIXY = 61440,
    PIXY_DFU = 12,

    VEXCAM = 1287,
    VEXCAM_DFU = 1288,

    SENSOR_TEST = 1535,

    CORTEX_PROGCBL = 10,
    CORTEX_BRAIN = 11,
    CORTEX_JOYSTK = 12,

    VEXNET_KEY_20 = 7,
    VEXNET_KEY_10 = 9587,

    PROLIFIC = 8963
}
