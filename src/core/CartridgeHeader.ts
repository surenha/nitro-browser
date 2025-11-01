import { BufferReader } from "./BufferReader";

export class CartridgeHeader {
  constructor(raw: BufferReader) {
    this.gameTitle = raw.readChars(0x00, 12).replace(/\0/g, "");
    this.gameCode = raw.readChars(0x0c, 4).replace(/\0/g, "");
    this.fntOffset = raw.readUint32(0x40);
    this.fntLength = raw.readUint32(0x44);
    this.fatOffset = raw.readUint32(0x48);
    this.fatLength = raw.readUint32(0x4c);
  }

  public readonly gameTitle: string;
  public readonly gameCode: string;
  public readonly fntOffset: number;
  public readonly fntLength: number;
  public readonly fatOffset: number;
  public readonly fatLength: number;
}
