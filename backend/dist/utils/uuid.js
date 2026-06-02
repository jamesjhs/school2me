import { parse as uuidParse, stringify as uuidStringify, v4 as uuidv4 } from 'uuid';
export const generateUuidBuffer = () => Buffer.from(uuidParse(uuidv4()));
export const uuidStringToBuffer = (value) => Buffer.from(uuidParse(value));
export const uuidBufferToString = (value) => uuidStringify(new Uint8Array(value));
//# sourceMappingURL=uuid.js.map