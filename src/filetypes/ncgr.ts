// ncgr.ts: NCGR (NITRO-System Character Graphics for Runtime) Parser

interface NCGRHeader {
  magic: string;
  version: number;
  fileSize: number;
  numBlocks: number;
}

interface NCGRCharData {
  widthChars: number;
  heightChars: number;
  colorFormat: "palette16" | "palette256";
  mappingMode: "2D" | "1D";
  graphicsType: "character" | "bitmap";
  pixelData: Uint8Array;
}

// Pass a raw shape object interface instead of importing the full NSCR class
interface SimpleLayout {
  widthPixels: number;
  heightPixels: number;
  tiles: Array<{
    tileIndex: number;
    flipX: boolean;
    flipY: boolean;
    paletteIndex: number;
  }>;
}

export class NCGR {
  private view: DataView;
  private data: Uint8Array;
  private header!: NCGRHeader;
  private charData: NCGRCharData | null = null;

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
    if (magic !== "RGCN" && magic !== "RBCN") {
      throw new Error(`Invalid NCGR file: expected RGCN or RBCN, got ${magic}`);
    }

    const versionMajor = this.view.getUint8(0x07);
    const versionMinor = this.view.getUint8(0x06);
    const fileSize = this.view.getUint32(0x08, true);
    const headerSize = this.view.getUint16(0x0c, true);
    const numBlocks = this.view.getUint16(0x0e, true);

    this.header = {
      magic,
      version: versionMajor + versionMinor / 10,
      fileSize,
      numBlocks,
    };

    let offset = headerSize;

    for (let i = 0; i < numBlocks; i++) {
      if (offset + 8 > this.view.byteLength) break;

      const blockSig = this.readString(offset, 4);
      const blockSize = this.view.getUint32(offset + 4, true);

      if (blockSig === "RAHC") {
        this.parseCHAR(offset);
      }

      offset += blockSize;
    }
  }

  private parseCHAR(offset: number): void {
    const dataOffset = offset + 8;

    const heightChars = this.view.getUint16(dataOffset, true);
    const widthChars = this.view.getUint16(dataOffset + 0x02, true);

    const colorFormatRaw = this.view.getUint32(dataOffset + 0x04, true);
    const mappingModeRaw = this.view.getUint32(dataOffset + 0x08, true);
    const tiledFlag = this.view.getUint32(dataOffset + 0x0c, true);
    const graphicsDataSize = this.view.getUint32(dataOffset + 0x10, true);

    const relativeDataOffset = this.view.getUint32(dataOffset + 0x14, true);
    const pixelDataOffset = dataOffset + relativeDataOffset;

    if (pixelDataOffset + graphicsDataSize > this.view.byteLength) {
      throw new RangeError("Malformed NCGR: Graphics payload footprint extends past file buffer limits.");
    }

    const colorFormat = colorFormatRaw === 3 ? "palette16" : "palette256";
    const mappingMode = (mappingModeRaw & 0xff) !== 0 ? "1D" : "2D";
    const graphicsType = (tiledFlag & 0xff) === 0 ? "character" : "bitmap";

    const rawPixels = this.data.slice(pixelDataOffset, pixelDataOffset + graphicsDataSize);
    let normalizedPixels: Uint8Array;

    if (colorFormat === "palette16") {
      normalizedPixels = new Uint8Array(rawPixels.length * 2);
      for (let i = 0; i < rawPixels.length; i++) {
        const byte = rawPixels[i];
        normalizedPixels[i * 2] = byte & 0x0f;
        normalizedPixels[i * 2 + 1] = (byte >> 4) & 0x0f;
      }
    } else {
      normalizedPixels = rawPixels;
    }

    this.charData = {
      widthChars,
      heightChars,
      colorFormat,
      mappingMode,
      graphicsType,
      pixelData: normalizedPixels,
    };
  }

  public getGraphicsData(): NCGRCharData | null {
    return this.charData;
  }

  public getRGBA(paletteColors: { r: number; g: number; b: number }[], subPaletteIndex: number = 0, nscrLayout: SimpleLayout | null = null): Uint8ClampedArray | null {
    if (!this.charData) return null;

    const { widthChars, heightChars, pixelData, mappingMode } = this.charData;

    let totalWidth = 0;
    let totalHeight = 0;

    if (nscrLayout) {
      totalWidth = nscrLayout.widthPixels;
      totalHeight = nscrLayout.heightPixels;
    } else {
      totalWidth = widthChars !== 0xffff ? widthChars * 8 : 256;
      totalHeight = heightChars !== 0xffff ? heightChars * 8 : Math.ceil(pixelData.length / totalWidth);
    }

    const rgbaData = new Uint8ClampedArray(totalWidth * totalHeight * 4);

    // --- RENDERING PATH A: NSCR TILEMAP SCREEN RENDERING ---
    if (nscrLayout) {
      const tilesWide = totalWidth / 8;
      const tilesHigh = totalHeight / 8;

      for (let ty = 0; ty < tilesHigh; ty++) {
        for (let tx = 0; tx < tilesWide; tx++) {
          const screenTileIndex = ty * tilesWide + tx;
          if (screenTileIndex >= nscrLayout.tiles.length) break;

          const tileMapEntry = nscrLayout.tiles[screenTileIndex];
          const charTileIndex = tileMapEntry.tileIndex;
          const tilePaletteOffset = this.charData.colorFormat === "palette16" ? tileMapEntry.paletteIndex * 16 : 0;

          for (let py = 0; py < 8; py++) {
            for (let px = 0; px < 8; px++) {
              const srcPx = tileMapEntry.flipX ? 7 - px : px;
              const srcPy = tileMapEntry.flipY ? 7 - py : py;

              const pixelOffsetInTile = srcPy * 8 + srcPx;
              const globalPixelIndex = charTileIndex * 64 + pixelOffsetInTile;

              const destX = tx * 8 + px;
              const destY = ty * 8 + py;
              const rgbaOffset = (destY * totalWidth + destX) * 4;

              if (globalPixelIndex >= pixelData.length) {
                rgbaData[rgbaOffset + 3] = 0;
                continue;
              }

              const palIdx = tilePaletteOffset + pixelData[globalPixelIndex];
              const color = paletteColors[palIdx] || { r: 0, g: 0, b: 0 };

              rgbaData[rgbaOffset] = color.r;
              rgbaData[rgbaOffset + 1] = color.g;
              rgbaData[rgbaOffset + 2] = color.b;
              rgbaData[rgbaOffset + 3] = pixelData[globalPixelIndex] === 0 ? 0 : 255;
            }
          }
        }
      }
      return rgbaData;
    }

    // --- RENDERING PATH B: STANDARD FALLBACK RENDERING ---
    const paletteOffset = this.charData.colorFormat === "palette16" ? subPaletteIndex * 16 : 0;

    for (let i = 0; i < pixelData.length; i++) {
      const totalWidthTiles = totalWidth / 8;
      const tileIndex = Math.floor(i / 64);
      const pixelIndexInTile = i % 64;

      const tileX = tileIndex % totalWidthTiles;
      const tileY = Math.floor(tileIndex / totalWidthTiles);

      const pixelX = tileX * 8 + (pixelIndexInTile % 8);
      const pixelY = tileY * 8 + Math.floor(pixelIndexInTile / 8);

      if (pixelX >= totalWidth || pixelY >= totalHeight) continue;

      const palIdx = paletteOffset + pixelData[i];
      const color = paletteColors[palIdx] || { r: 0, g: 0, b: 0 };

      const rgbaOffset = (pixelY * totalWidth + pixelX) * 4;

      rgbaData[rgbaOffset] = color.r;
      rgbaData[rgbaOffset + 1] = color.g;
      rgbaData[rgbaOffset + 2] = color.b;
      rgbaData[rgbaOffset + 3] = pixelData[i] === 0 ? 0 : 255;
    }

    return rgbaData;
  }
}
