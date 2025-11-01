import { BufferReader } from "../../core/BufferReader";
import { InfoSection } from "./InfoSection";

export class TextureInfoSection extends InfoSection {
  entries: TextureInfo[] = [];

  parseEntry(raw: BufferReader): void {
    this.entries.push(new TextureInfo(raw));
  }
}

export class TextureInfo {
  constructor(raw: BufferReader) {
    this.textureOffset = raw.readUint16(0x00) << 3;

    const parameters = raw.readUint16(0x02);
    this.firstColorTransparent =
      (parameters & 0b0010_0000_0000_0000) >> 13 === 1;
    this.format = (parameters & 0b0001_1100_0000_0000) >> 10;
    this.height = (parameters & 0b0000_0011_1000_0000) >> 7;
    this.width = (parameters & 0b0000_0000_0111_0000) >> 4;

    this.width = 8 << this.width;
    this.height = 8 << this.height;
  }

  textureOffset: number;
  firstColorTransparent: boolean;
  format: number;
  height: number;
  width: number;
}
