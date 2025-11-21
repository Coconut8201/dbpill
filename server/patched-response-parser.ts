import { BufferReader } from 'pg-server/protocol/buffer-reader';
import { ResponseCode } from 'pg-server/protocol/responses';

const CODE_LENGTH = 1;
const LEN_LENGTH = 4;
const HEADER_LENGTH = CODE_LENGTH + LEN_LENGTH;
const emptyBuffer = Buffer.allocUnsafe(0);

export class DbResponseParser {
    private buffer: Buffer;
    private bufferLength: number;
    private bufferOffset: number;
    private reader: BufferReader;
    private mode: string;

    constructor(opts?: { mode?: string }) {
        this.buffer = emptyBuffer;
        this.bufferLength = 0;
        this.bufferOffset = 0;
        this.reader = new BufferReader();
        if (opts?.mode === 'binary') {
            throw new Error('Binary mode not supported yet');
        }
        this.mode = opts?.mode || 'text';
    }

    public process(callback: (res: any) => void, response: any, offset: number, len: number) {
        let callingback = true;
        let thisData: Buffer | undefined;
        callback({
            response,
            getRawData: () => {
                if (thisData) {
                    return thisData;
                }
                if (!callingback) {
                    throw new Error(`If you're interested in raw data, please ask for it sooner`);
                }
                return thisData = this.buffer.slice(offset, offset + len);
            },
        });
        callingback = false;
    }

    public parse(buffer: Buffer, callback: (res: any) => void) {
        this.mergeBuffer(buffer);
        const bufferFullLength = this.bufferOffset + this.bufferLength;
        let offset = this.bufferOffset;
        while (offset + HEADER_LENGTH <= bufferFullLength) {
            // code is 1 byte long - it identifies the message type
            const code = this.buffer[offset];
            // length is 1 Uint32BE - it is the length of the message EXCLUDING the code
            const length = this.buffer.readUInt32BE(offset + CODE_LENGTH);
            const fullMessageLength = CODE_LENGTH + length;

            if (offset + fullMessageLength > bufferFullLength) {
                break;
            }

            const response = this.handlePacket(offset + HEADER_LENGTH, length - LEN_LENGTH, this.buffer, code);
            this.process(callback, response, offset, fullMessageLength);
            offset += fullMessageLength;
        }

        if (offset === bufferFullLength) {
            this.buffer = emptyBuffer;
            this.bufferLength = 0;
            this.bufferOffset = 0;
        } else {
            this.bufferOffset = offset;
        }
    }

    private mergeBuffer(buffer: Buffer) {
        if (this.bufferLength > 0) {
            const newLength = this.bufferLength + buffer.length;
            const newBuffer = Buffer.allocUnsafe(newLength);
            this.buffer.copy(newBuffer, 0, this.bufferOffset, this.bufferOffset + this.bufferLength);
            buffer.copy(newBuffer, this.bufferLength);
            this.buffer = newBuffer;
            this.bufferOffset = 0;
            this.bufferLength = newLength;
        } else {
            this.buffer = buffer;
            this.bufferOffset = 0;
            this.bufferLength = buffer.length;
        }
    }

    private handlePacket(offset: number, length: number, bytes: Buffer, type: number): any {
        switch (type) {
            case ResponseCode.DataRow:
                return this.parseDataRowMessage(offset, length, bytes);
            case ResponseCode.CommandComplete:
                return this.parseCommandCompleteMessage(offset, length, bytes);
            case ResponseCode.ReadyForQuery:
                return this.parseReadyForQueryMessage(offset, length, bytes);
            case ResponseCode.NotificationResponse:
                return this.parseNotificationMessage(offset, length, bytes);
            case ResponseCode.AuthenticationResponse:
                return this.parseAuthenticationResponse(offset, length, bytes);
            case ResponseCode.ParameterStatus:
                return this.parseParameterStatusMessage(offset, length, bytes);
            case ResponseCode.BackendKeyData:
                return this.parseBackendKeyData(offset, length, bytes);
            case ResponseCode.ErrorMessage:
                return this.parseErrorMessage(offset, length, bytes, ResponseCode.ErrorMessage);
            case ResponseCode.NoticeMessage:
                return this.parseErrorMessage(offset, length, bytes, ResponseCode.NoticeMessage);
            case ResponseCode.RowDescriptionMessage:
                return this.parseRowDescriptionMessage(offset, length, bytes);
            case ResponseCode.CopyIn:
            case ResponseCode.CopyOut:
                return this.parseCopyMessage(offset, length, bytes, type);
            case ResponseCode.CopyData:
                return this.parseCopyData(offset, length, bytes);
            case 0x74: // ParameterDescription
                // Just ignore it or return a dummy response
                // We don't need to parse the content for the proxy to work, just skip it (which the main loop does using length)
                return { type: 0x74, name: 'ParameterDescription' };
            default:
                // For unknown messages, we can just return a generic object with the type
                // This prevents the parser from crashing and allows the loop to continue
                return { type };
        }
    }

    private parseReadyForQueryMessage(offset: number, length: number, bytes: Buffer) {
        this.reader.setBuffer(offset, bytes);
        const status = this.reader.string(1);
        return {
            type: ResponseCode.ReadyForQuery,
            status,
        };
    }

    private parseCommandCompleteMessage(offset: number, length: number, bytes: Buffer) {
        this.reader.setBuffer(offset, bytes);
        const text = this.reader.cstring();
        return {
            type: ResponseCode.CommandComplete,
            text,
        };
    }

    private parseCopyData(offset: number, length: number, bytes: Buffer) {
        const data = bytes.slice(offset, offset + (length - 4));
        return {
            type: ResponseCode.CopyData,
            data,
        };
    }

    private parseCopyMessage(offset: number, length: number, bytes: Buffer, type: number) {
        this.reader.setBuffer(offset, bytes);
        const isBinary = this.reader.byte() !== 0;
        const columnCount = this.reader.int16();
        const columnTypes = Array(columnCount);
        for (let i = 0; i < columnCount; i++) {
            columnTypes[i] = this.reader.int16();
        }
        return {
            type,
            columnTypes,
            isBinary,
        };
    }

    private parseNotificationMessage(offset: number, length: number, bytes: Buffer) {
        this.reader.setBuffer(offset, bytes);
        const processId = this.reader.int32();
        const channel = this.reader.cstring();
        const payload = this.reader.cstring();
        return {
            type: ResponseCode.NotificationResponse,
            processId,
            channel,
            payload
        };
    }

    private parseRowDescriptionMessage(offset: number, length: number, bytes: Buffer) {
        this.reader.setBuffer(offset, bytes);
        const fieldCount = this.reader.int16();
        const fields = Array(fieldCount);
        for (let i = 0; i < fieldCount; i++) {
            fields[i] = this.parseField();
        }
        return {
            type: ResponseCode.RowDescriptionMessage,
            fields,
        };
    }

    private parseField() {
        const name = this.reader.cstring();
        const tableID = this.reader.int32();
        const columnID = this.reader.int16();
        const dataTypeID = this.reader.int32();
        const dataTypeSize = this.reader.int16();
        const dataTypeModifier = this.reader.int32();
        const mode = this.reader.int16() === 0 ? 'text' : 'binary';
        return { name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, mode };
    }

    private parseDataRowMessage(offset: number, length: number, bytes: Buffer) {
        this.reader.setBuffer(offset, bytes);
        const fieldCount = this.reader.int16();
        const fields = new Array(fieldCount);
        for (let i = 0; i < fieldCount; i++) {
            const len = this.reader.int32();
            // a -1 for length means the value of the field is null
            fields[i] = len === -1 ? null : this.reader.string(len);
        }
        return {
            type: ResponseCode.DataRow,
            fields,
        };
    }

    private parseParameterStatusMessage(offset: number, length: number, bytes: Buffer) {
        this.reader.setBuffer(offset, bytes);
        const name = this.reader.cstring();
        const value = this.reader.cstring();
        return {
            type: ResponseCode.ParameterStatus,
            name,
            value
        };
    }

    private parseBackendKeyData(offset: number, length: number, bytes: Buffer) {
        this.reader.setBuffer(offset, bytes);
        const processID = this.reader.int32();
        const secretKey = this.reader.int32();
        return {
            type: ResponseCode.BackendKeyData,
            processID,
            secretKey
        };
    }

    private parseAuthenticationResponse(offset: number, length: number, bytes: Buffer) {
        this.reader.setBuffer(offset, bytes);
        const code = this.reader.int32();
        const ret: any = { type: ResponseCode.AuthenticationResponse };
        switch (code) {
            case 0: // AuthenticationOk
                return { ...ret, kind: 'ok' };
            case 3: // AuthenticationCleartextPassword
                if (length === 8) {
                    return { ...ret, kind: 'cleartextPassword' };
                }
                return { ...ret, kind: 'ok' };
            case 5: // AuthenticationMD5Password
                if (length === 12) {
                    const salt = this.reader.bytes(4);
                    return { ...ret, salt, kind: 'md5Password' };
                }
                return { ...ret, kind: 'ok' };
            case 10: // AuthenticationSASL
                const mechanisms = [];
                let mechanism;
                do {
                    mechanism = this.reader.cstring();
                    if (mechanism) {
                        mechanisms.push(mechanism);
                    }
                } while (mechanism);
                return { ...ret, mechanisms, kind: 'SASL' };
            case 11: // AuthenticationSASLContinue
                return { ...ret, data: this.reader.string(length - 8), kind: 'SASLContinue' };
            case 12: // AuthenticationSASLFinal
                return { ...ret, data: this.reader.string(length - 8), kind: 'SASLFinal' };
            default:
                throw new Error('Unknown authenticationOk message type ' + code);
        }
    }

    private parseErrorMessage(offset: number, length: number, bytes: Buffer, type: number) {
        this.reader.setBuffer(offset, bytes);
        const fields: any = {};
        let fieldType = this.reader.string(1);
        while (fieldType !== '\0') {
            fields[fieldType] = this.reader.cstring();
            fieldType = this.reader.string(1);
        }
        const message = {
            message: fields.M,
            severity: fields.S,
            code: fields.C,
            detail: fields.D,
            hint: fields.H,
            position: fields.P,
            internalPosition: fields.p,
            internalQuery: fields.q,
            where: fields.W,
            schema: fields.s,
            table: fields.t,
            column: fields.c,
            dataType: fields.d,
            constraint: fields.n,
            file: fields.F,
            line: fields.L,
            routine: fields.R,
        };
        return { message, type };
    }
}
