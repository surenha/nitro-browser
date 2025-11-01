import { BufferReader } from "../../core/BufferReader";
import { InfoSection } from "./InfoSection";

export class PaletteInfoSection extends InfoSection {
  entries: PaletteInfo[] = [];

  parseEntry(raw: BufferReader): void {
    this.entries.push(new PaletteInfo(raw));
  }
}

export class PaletteInfo {
  constructor(raw: BufferReader) {
    this.paletteOffset = raw.readUint16(0x00) << 3;
  }

  paletteOffset: number;
}
