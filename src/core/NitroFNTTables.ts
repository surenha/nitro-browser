import { BufferReader } from "./BufferReader";

export enum NitroFNTSubtableEntryType {
  File,
  SubDirectory,
  EndOfSubTable,
  Reserved,
}

export class NitroFNTMainTable {
  constructor(raw: BufferReader, numEntries: number) {
    this.totalDirCount = numEntries;
    this.entries = [];

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = i * 8;
      const entryBuffer = raw.slice(entryOffset, entryOffset + 8);
      const entry = {
        subTableOffset: entryBuffer.readUint32(0x00),
        firstFileID: entryBuffer.readUint16(0x04),
        parentDirectoryID: entryBuffer.readUint16(0x06),
      };
      this.entries.push(entry);
    }
  }

  totalDirCount: number;
  entries: NitroFNTMainTableEntry[];
}

export type NitroFNTMainTableEntry = {
  subTableOffset: number;
  firstFileID: number;
  parentDirectoryID: number;
};

export class NitroFNTSubTable {
  constructor(raw: BufferReader) {
    this.entries = [];

    let i = 0;
    while (true) {
      const typeAndLength = raw.readUint8(i);
      i++;

      const { type, length } = this.separateTypeAndLength(typeAndLength);

      if (type === NitroFNTSubtableEntryType.EndOfSubTable) {
        break;
      } else if (type === NitroFNTSubtableEntryType.Reserved) {
        console.warn("Reserved entry type found in NitroFNTSubTable");
        continue;
      }

      const name = raw.readChars(i, length);
      i += length;

      const entry: any = { type, length, name };

      if (type === NitroFNTSubtableEntryType.SubDirectory) {
        const id = raw.readUint16(i) & 0xfff;
        i += 2;
        entry.subDirectoryID = id;
      }

      this.entries.push(entry);
    }
  }

  entries: NitroFNTSubTableEntry[];

  private separateTypeAndLength(typeAndLength: number): {
    type: NitroFNTSubtableEntryType;
    length: number;
  } {
    if (typeAndLength === 0x00) {
      return { type: NitroFNTSubtableEntryType.EndOfSubTable, length: 0 };
    } else if (typeAndLength === 0x80) {
      return { type: NitroFNTSubtableEntryType.Reserved, length: 0 };
    } else if (typeAndLength < 0x80) {
      return {
        type: NitroFNTSubtableEntryType.File,
        length: typeAndLength % 0x80,
      };
    } else {
      return {
        type: NitroFNTSubtableEntryType.SubDirectory,
        length: typeAndLength % 0x80,
      };
    }
  }
}

export type NitroFNTSubTableEntry = {
  type: NitroFNTSubtableEntryType;
  length: number;
  name: string;
  subDirectoryID?: number;
};
