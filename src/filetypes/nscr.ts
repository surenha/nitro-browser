// nscr.ts: NSCR (NITRO-System Screen Layout) Parser

export interface NSCRTile {
  tileIndex: number;
  flipX: boolean;
  flipY: boolean;
  paletteIndex: number;
}

export interface NSCRLayout {
  widthPixels: number;
  heightPixels: number;
  tiles: NSCRTile[];
}

export class NSCR {
  private view: DataView;
  private data: Uint8Array;
  private layout: NSCRLayout | null = null;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);
    this.parse();
  }

  private readString(offset: number, length: number): string {
    return String.fromCharCode(...this.data.slice(offset, offset + length));
  }

  private parse(): void {
    const magic = this.readString(0, 4);
    if (magic !== "RCSN") {
      // Little-endian 'NSCR'
      throw new Error(`Invalid NSCR file: expected RCSN, got ${magic}`);
    }

    const numBlocks = this.view.getUint16(0x0e, true);
    let offset = this.view.getUint16(0x0c, true); // Header size (usually 0x10)

    for (let i = 0; i < numBlocks; i++) {
      if (offset + 8 > this.view.byteLength) break;

      const blockSig = this.readString(offset, 4);
      const blockSize = this.view.getUint32(offset + 4, true);

      if (blockSig === "NRCS") {
        // Little-endian 'SCRN'
        this.parseSCRN(offset);
      }

      offset += blockSize;
    }
  }

  private parseSCRN(offset: number): void {
    const dataOffset = offset + 8;

    // MATCHES TINKE C# CODE EXACTLY:
    const widthPixels = this.view.getUint16(dataOffset, true); // br.ReadUInt16() -> width
    const heightPixels = this.view.getUint16(dataOffset + 2, true); // br.ReadUInt16() -> height
    // dataOffset + 4 is a 32-bit field (4 bytes)! This was the misalignment bug:
    const padding = this.view.getUint32(dataOffset + 4, true); // br.ReadUInt32() -> padding
    const dataSize = this.view.getUint32(dataOffset + 8, true); // br.ReadUInt32() -> data_size

    // Map data starts exactly 12 bytes out from the SCRN block header payload segment
    const tileMapOffset = dataOffset + 12;
    const numTiles = dataSize / 2;
    const tiles: NSCRTile[] = [];

    // Bounds checking
    if (tileMapOffset + dataSize > this.view.byteLength) {
      throw new RangeError("Malformed NSCR: Layout data block extends past file buffer limits.");
    }

    for (let i = 0; i < numTiles; i++) {
      const tileValue = this.view.getUint16(tileMapOffset + i * 2, true);

      // Bits 0-9:   Character Tile index
      // Bit 10:     Flip X
      // Bit 11:     Flip Y
      // Bits 12-15: Sub-palette bank ID
      tiles.push({
        tileIndex: tileValue & 0x03ff,
        flipX: (tileValue & 0x0400) !== 0,
        flipY: (tileValue & 0x0800) !== 0,
        paletteIndex: (tileValue & 0xf000) >> 12,
      });
    }

    this.layout = { widthPixels, heightPixels, tiles };
  }

  public getLayout(): NSCRLayout | null {
    return this.layout;
  }
}
