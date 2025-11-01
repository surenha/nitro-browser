import { BufferReader } from "../../core/BufferReader";

export class TEX0Header {
  constructor(raw: BufferReader) {
    this.magic = raw.readChars(0x00, 4);
    this.sectionSize = raw.readUint32(0x04);
    this.textureDataSize = raw.readUint16(0x0c);
    this.textureInfoOffset = raw.readUint16(0x0e);
    this.textureDataOffset = raw.readUint32(0x14);
    this.compressedTextureDataSize = raw.readUint16(0x1c);
    this.compressedTextureInfoOffset = raw.readUint16(0x1e);
    this.compressedTextureDataOffset = raw.readUint32(0x24);
    this.compressedTextureInfoDataOffset = raw.readUint32(0x28);
    this.paletteDataSize = raw.readUint32(0x30);
    this.paletteInfoOffset = raw.readUint32(0x34);
    this.paletteDataOffset = raw.readUint32(0x38);
  }

  public readonly magic: string;
  public readonly sectionSize: number;
  public readonly textureDataSize: number;
  public readonly textureInfoOffset: number;
  public readonly textureDataOffset: number;
  public readonly compressedTextureDataSize: number;
  public readonly compressedTextureInfoOffset: number;
  public readonly compressedTextureDataOffset: number;
  public readonly compressedTextureInfoDataOffset: number;
  public readonly paletteDataSize: number;
  public readonly paletteInfoOffset: number;
  public readonly paletteDataOffset: number;
}
