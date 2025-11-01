import { BufferReader } from "../../core/BufferReader";

export abstract class InfoSection {
  constructor(raw: BufferReader) {
    this.numberOfEntries = raw.readUint8(0x01);
    this.sectionSize = raw.readUint16(0x02);

    let offset = 8 + 4 * this.numberOfEntries + 4;

    this.dataSize = raw.readUint16(offset + 2);
    const dataSectionSize = (this.dataSize - 4) / this.numberOfEntries;
    offset += 4;

    for (let i = 0; i < this.numberOfEntries; i++) {
      this.parseEntry(raw.slice(offset, offset + dataSectionSize));
      offset += dataSectionSize;
    }

    this.names = [];
    for (let i = 0; i < this.numberOfEntries; i++) {
      this.names.push(raw.readChars(offset, 16).replace(/\0/g, ""));
      offset += 16;
    }
  }

  numberOfEntries: number;
  sectionSize: number;
  dataSize: number;
  names: string[];

  abstract parseEntry(raw: BufferReader): void;
}
