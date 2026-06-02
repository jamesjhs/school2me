import { parse as uuidParse, stringify as uuidStringify, v4 as uuidv4 } from 'uuid';

export const generateUuidBuffer = (): Buffer => Buffer.from(uuidParse(uuidv4()));

export const uuidStringToBuffer = (value: string): Buffer => Buffer.from(uuidParse(value));

export const uuidBufferToString = (value: Buffer): string => uuidStringify(new Uint8Array(value));
