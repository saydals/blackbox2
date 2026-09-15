const FLIGHT_LOG_FIELD_ENCODING_NEG_14BIT = 3;
const FLIGHT_LOG_FIELD_ENCODING_NULL = 9;
const FLIGHT_LOG_FIELD_ENCODING_SIGNED_VB = 0;
const FLIGHT_LOG_FIELD_ENCODING_TAG2_3S32 = 7;
const FLIGHT_LOG_FIELD_ENCODING_TAG2_3SVARIABLE = 10;
const FLIGHT_LOG_FIELD_ENCODING_TAG8_4S16 = 8;
const FLIGHT_LOG_FIELD_ENCODING_TAG8_8SVB = 6;
const FLIGHT_LOG_FIELD_ENCODING_UNSIGNED_VB = 1;

const END_OF_LOG_MESSAGE = "End of log\0";
const END_OF_LOG_BYTES = new TextEncoder().encode(END_OF_LOG_MESSAGE);

class ByteArrayWriter {
    constructor() {
        this.buffer = [];
    }

    writeByte(value) {
        this.buffer.push(value & 0xff);
    }

    writeU8(value) {
        this.writeByte(value);
    }

    writeS16(value) {
        this.writeByte(value & 0xff);
        this.writeByte((value >> 8) & 0xff);
    }

    writeU32(value) {
        this.writeByte(value & 0xff);
        this.writeByte((value >> 8) & 0xff);
        this.writeByte((value >> 16) & 0xff);
        this.writeByte((value >> 24) & 0xff);
    }

    writeSignedVB(value) {
        const unsigned = ((value << 1) ^ (value >> 31)) >>> 0;
        this.writeUnsignedVB(unsigned);
    }

    writeUnsignedVB(value) {
        while (value > 0x7f) {
            this.writeByte((value & 0x7f) | 0x80);
            value >>>= 7;
        }
        this.writeByte(value & 0x7f);
    }

    writeString(value) {
        for (let i = 0; i < value.length; i++) {
            this.writeByte(value.codePointAt(i));
        }
    }

    writeBytes(values) {
        for (let i = 0; i < values.length; i++) {
            this.writeByte(values[i]);
        }
    }

    toUint8Array() {
        return new Uint8Array(this.buffer);
    }
}

function signExtend14Bit(value) {
    return (value << 18) >> 18;
}

function writeTag8_4S16_v1(writer, values) {
    const types = values.map((v) => {
        if (v === 0) return 0;
        if (v >= -8 && v <= 7) return 1;
        if (v >= -128 && v <= 127) return 2;
        return 3;
    });

    let selector = 0;
    for (let i = 3; i >= 0; i--) {
        selector = (selector << 2) | (types[i] & 0x03);
    }
    writer.writeByte(selector);

    let nibbleBuffer = 0;
    let nibbleIndex = 0;

    for (let i = 0; i < 4; i++) {
        switch (types[i]) {
            case 0:
                break;
            case 1:
                if (nibbleIndex === 0) {
                    nibbleBuffer = values[i] & 0x0f;
                    nibbleIndex = 1;
                } else {
                    writer.writeByte(nibbleBuffer | ((values[i] & 0x0f) << 4));
                    nibbleIndex = 0;
                }
                break;
            case 2:
                if (nibbleIndex === 0) {
                    writer.writeByte(values[i] & 0xff);
                } else {
                    writer.writeByte(nibbleBuffer | ((values[i] & 0x0f) << 4));
                    writer.writeByte((values[i] >> 4) & 0xff);
                    nibbleIndex = 0;
                }
                break;
            case 3:
                if (nibbleIndex === 0) {
                    writer.writeByte(values[i] & 0xff);
                    writer.writeByte((values[i] >> 8) & 0xff);
                } else {
                    writer.writeByte(nibbleBuffer | ((values[i] & 0x0f) << 4));
                    writer.writeByte((values[i] >> 4) & 0xff);
                    writer.writeByte((values[i] >> 12) & 0xff);
                    nibbleIndex = 0;
                }
                break;
        }
    }

    if (nibbleIndex === 1) {
        writer.writeByte(nibbleBuffer);
    }
}

function _writeTag8_4S16_v2(writer, values) {
    const types = values.map((v) => {
        if (v === 0) return 0;
        if (v >= -8 && v <= 7) return 1;
        if (v >= -128 && v <= 127) return 2;
        return 3;
    });

    let selector = 0;
    for (let i = 3; i >= 0; i--) {
        selector = (selector << 2) | (types[i] & 0x03);
    }
    writer.writeByte(selector);

    let nibbleBuffer = 0;
    let nibbleIndex = 0;

    for (let i = 0; i < 4; i++) {
        switch (types[i]) {
            case 0:
                break;
            case 1:
                if (nibbleIndex === 0) {
                    nibbleBuffer = (values[i] & 0x0f) << 4;
                    nibbleIndex = 1;
                } else {
                    nibbleBuffer |= values[i] & 0x0f;
                    writer.writeByte(nibbleBuffer);
                    nibbleIndex = 0;
                }
                break;
            case 2:
                if (nibbleIndex === 0) {
                    writer.writeByte(values[i] & 0xff);
                } else {
                    nibbleBuffer |= (values[i] & 0x0f) << 4;
                    writer.writeByte(nibbleBuffer);
                    writer.writeByte((values[i] >> 4) & 0xff);
                    nibbleIndex = 0;
                }
                break;
            case 3:
                if (nibbleIndex === 0) {
                    writer.writeByte(values[i] & 0xff);
                    writer.writeByte((values[i] >> 8) & 0xff);
                } else {
                    nibbleBuffer |= (values[i] & 0x0f) << 4;
                    writer.writeByte(nibbleBuffer);
                    writer.writeByte((values[i] >> 4) & 0xff);
                    writer.writeByte((values[i] >> 12) & 0xff);
                    nibbleIndex = 0;
                }
                break;
        }
    }

    if (nibbleIndex === 1) {
        writer.writeByte(nibbleBuffer);
    }
}

function writeTag2_3S32(writer, values) {
    const ranges = values.map((v) => {
        if (v === 0) return 0;
        if (v >= -2 && v <= 1) return 1;
        if (v >= -8 && v <= 7) return 2;
        if (v >= -32 && v <= 31) return 3;
        if (v >= -128 && v <= 127) return 4;
        return 5;
    });

    const maxRange = Math.max(...ranges);
    let leadByte = maxRange << 6;

    for (let i = 0; i < 3; i++) {
        const r = ranges[i];
        const v = values[i];
        switch (maxRange) {
            case 1:
                leadByte |= (v & 0x03) << (2 * (2 - i));
                break;
            case 2:
                if (r < 2) {
                    leadByte |= (v & 0x03) << (2 * (2 - i));
                } else {
                    writer.writeByte(leadByte);
                    writer.writeByte(v & 0xff);
                    return;
                }
                break;
            default:
                if (r < maxRange) {
                    leadByte |= (v & 0x03) << (2 * (2 - i));
                } else {
                    writer.writeByte(leadByte);
                    if (maxRange === 3 || maxRange === 4) {
                        writer.writeByte(v & 0xff);
                        if (maxRange === 4 && (v < -128 || v > 127)) {
                            writer.writeByte((v >> 8) & 0xff);
                        }
                    } else {
                        writer.writeByte(v & 0xff);
                        writer.writeByte((v >> 8) & 0xff);
                    }
                    return;
                }
                break;
        }
    }
    writer.writeByte(leadByte);
}

function writeTag2_3SVariable(writer, values) {
    writeTag2_3S32(writer, values);
}

function writeTag8_8SVB(writer, values, valueCount) {
    if (valueCount === 1) {
        writer.writeSignedVB(values[0]);
    } else {
        let header = 0;
        for (let i = valueCount - 1; i >= 0; i--) {
            header = (header << 1) | (values[i] !== 0 ? 1 : 0);
        }
        writer.writeByte(header);
        for (let i = 0; i < valueCount; i++) {
            if (values[i] !== 0) {
                writer.writeSignedVB(values[i]);
            }
        }
    }
}

function encodeFieldValue(writer, value, encoding) {
    switch (encoding) {
        case FLIGHT_LOG_FIELD_ENCODING_SIGNED_VB:
            writer.writeSignedVB(value);
            break;
        case FLIGHT_LOG_FIELD_ENCODING_UNSIGNED_VB:
            writer.writeUnsignedVB(value);
            break;
        case FLIGHT_LOG_FIELD_ENCODING_NEG_14BIT:
            writer.writeUnsignedVB(signExtend14Bit(-value) & 0x3fff);
            break;
        case FLIGHT_LOG_FIELD_ENCODING_TAG8_4S16:
            writeTag8_4S16_v1(writer, [value]);
            break;
        case FLIGHT_LOG_FIELD_ENCODING_TAG2_3S32:
            writeTag2_3S32(writer, [value]);
            break;
        case FLIGHT_LOG_FIELD_ENCODING_TAG2_3SVARIABLE:
            writeTag2_3SVariable(writer, [value]);
            break;
        case FLIGHT_LOG_FIELD_ENCODING_TAG8_8SVB:
            writeTag8_8SVB(writer, [value], 1);
            break;
        case FLIGHT_LOG_FIELD_ENCODING_NULL:
            break;
        default:
            writer.writeSignedVB(value);
            break;
    }
}

export function modifyHeaderText(headerText, sampleRateOptions) {
    const { originalRate: _originalRate, targetRate: _targetRate, downsamplingFactor } = sampleRateOptions;
    const lines = headerText.split("\n");
    const modifiedLines = [];
    let foundInterval = false;
    let foundPInterval = false;

    for (const line of lines) {
        if (line.startsWith("H I interval:")) {
            modifiedLines.push("H I interval:1");
            foundInterval = true;
        } else if (line.startsWith("H P interval:")) {
            const pIntervalMatch = line.match(/^H P interval:(\d+(?:\/\d+)?)$/);
            if (pIntervalMatch) {
                const pInterval = pIntervalMatch[1];
                const slashIdx = pInterval.indexOf("/");
                let pNum, pDenom;
                if (slashIdx === -1) {
                    pNum = 1;
                    pDenom = Number.parseInt(pInterval, 10);
                } else {
                    pNum = Number.parseInt(pInterval.substring(0, slashIdx), 10);
                    pDenom = Number.parseInt(pInterval.substring(slashIdx + 1), 10);
                }
                const newPDenom = pDenom * downsamplingFactor;
                if (newPDenom <= 1) {
                    modifiedLines.push(`H P interval:${pNum}`);
                } else {
                    modifiedLines.push(`H P interval:${pNum}/${newPDenom}`);
                }
            } else {
                modifiedLines.push(line);
            }
            foundPInterval = true;
        } else if (line.startsWith("H Field I encoding:")) {
            const count = line.split(":").pop().split(",").length;
            modifiedLines.push(`H Field I encoding:${Array(count).fill("0").join(",")}`);
        } else if (line.startsWith("H Field I predictor:")) {
            const count = line.split(":").pop().split(",").length;
            modifiedLines.push(`H Field I predictor:${Array(count).fill("0").join(",")}`);
        } else if (line.startsWith("H Field P encoding:")) {
            const count = line.split(":").pop().split(",").length;
            modifiedLines.push(`H Field P encoding:${Array(count).fill("0").join(",")}`);
        } else if (line.startsWith("H Field P predictor:")) {
            const count = line.split(":").pop().split(",").length;
            modifiedLines.push(`H Field P predictor:${Array(count).fill("0").join(",")}`);
        } else {
            modifiedLines.push(line);
        }
    }

    if (!foundInterval) {
        modifiedLines.unshift("H I interval:1");
    }
    if (!foundPInterval) {
        modifiedLines.unshift("H P interval:1");
    }

    return modifiedLines.join("\n");
}

export function encodeIFrame(writer, frame, frameDef) {
    writer.writeByte(0x49); // 'I'
    const count = frameDef.count;
    for (let i = 0; i < count; i++) {
        encodeFieldValue(writer, frame[i], frameDef.encoding[i]);
    }
}

export function buildBbl(headerText, frames, frameDef, rawData) {
    const writer = new ByteArrayWriter();
    writer.writeString(headerText);
    writer.writeByte(0x0a); // newline after header

    for (const f of frames) {
        if (f.marker === "I" || f.marker === "P") {
            encodeIFrame(writer, f.frame, frameDef);
        } else if (rawData && f.frameStart != null && f.frameSize != null) {
            const bytes = rawData.slice(f.frameStart, f.frameStart + f.frameSize);
            writer.writeBytes(bytes);
        }
    }

    writer.writeByte(0x45); // 'E'
    writer.writeByte(0xff); // LOG_END event
    writer.writeBytes(END_OF_LOG_BYTES);

    return writer.toUint8Array();
}
