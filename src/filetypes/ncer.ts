// ncer.ts: NCER (Nitro Cell Resource) Parser
// Parses cell/OBJ arrangement data used to composite sprites from NCGR tile data.
// Format: GBATEK "DS Files - 2D Video" (RECN header, KBEC/CEBK chunk).

interface NCEROAM {
  y: number;
  rotScale: boolean;
  doubleSize: boolean;
  disable: boolean;
  mode: number;
  mosaic: boolean;
  colorFormat: "palette16" | "palette256";
  shape: number;
  x: number;
  rotScaleParam: number;
  flipX: boolean;
  flipY: boolean;
  size: number;
  tileIndex: number;
  priority: number;
  paletteIndex: number;
  widthPixels: number;
  heightPixels: number;
}

interface NCERCell {
  oam: NCEROAM[];
}

interface NCERData {
  numCells: number;
  metatileEntrySize: 8 | 16;
  boundarySize: number;
  cells: NCERCell[];
}

const OBJ_SHAPE_SIZE_TABLE: Record<string, [number, number]> = {
  "0-0": [8, 8],
  "0-1": [16, 16],
  "0-2": [32, 32],
  "0-3": [64, 64],
  "1-0": [16, 8],
  "1-1": [32, 8],
  "1-2": [32, 16],
  "1-3": [64, 32],
  "2-0": [8, 16],
  "2-1": [8, 32],
  "2-2": [16, 32],
  "2-3": [32, 64],
};

export class NCER {
  private view: DataView;
  private data: Uint8Array;
  private cellData: NCERData | null = null;

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
    if (magic !== "RECN") {
      throw new Error(`Invalid NCER file: expected RECN, got ${magic}`);
    }

    const numBlocks = this.view.getUint16(0x0e, true);
    let offset = 0x10;

    for (let i = 0; i < numBlocks; i++) {
      if (offset + 8 > this.view.byteLength) break;

      const blockSig = this.readString(offset, 4);
      const blockSize = this.view.getUint32(offset + 4, true);

      if (blockSig === "KBEC") {
        this.parseCEBK(offset);
      }

      offset += blockSize;
    }
  }

  private parseCEBK(offset: number): void {
    const dataOffset = offset + 8;

    const numCells = this.view.getUint16(dataOffset, true);
    const entrySizeFlag = this.view.getUint16(dataOffset + 0x02, true);
    const metatileEntrySize: 8 | 16 = entrySizeFlag === 1 ? 16 : 8;
    const tableOffset = this.view.getUint32(dataOffset + 0x04, true);
    const boundarySize = this.view.getUint32(dataOffset + 0x08, true);

    const metatileTableOffset = dataOffset + tableOffset;
    const cells: NCERCell[] = [];

    for (let i = 0; i < numCells; i++) {
      const entryOffset = metatileTableOffset + i * metatileEntrySize;
      if (entryOffset + 8 > this.view.byteLength) break;

      const numOAM = this.view.getUint16(entryOffset, true);
      const oamOffsetRel = this.view.getUint32(entryOffset + 0x04, true);
      const oamTableOffset = dataOffset + oamOffsetRel;

      const oam: NCEROAM[] = [];

      for (let j = 0; j < numOAM; j++) {
        const oamOffset = oamTableOffset + j * 6;
        if (oamOffset + 6 > this.view.byteLength) break;

        const attr0 = this.view.getUint16(oamOffset, true);
        const attr1 = this.view.getUint16(oamOffset + 2, true);
        const attr2 = this.view.getUint16(oamOffset + 4, true);

        const yRaw = attr0 & 0xff;
        const y = yRaw >= 128 ? yRaw - 256 : yRaw;
        const rotScale = ((attr0 >> 8) & 0x1) === 1;
        const doubleSize = rotScale && ((attr0 >> 9) & 0x1) === 1;
        const disable = !rotScale && ((attr0 >> 9) & 0x1) === 1;
        const mode = (attr0 >> 10) & 0x3;
        const mosaic = ((attr0 >> 12) & 0x1) === 1;
        const colorFormat: "palette16" | "palette256" = ((attr0 >> 13) & 0x1) === 1 ? "palette256" : "palette16";
        const shape = (attr0 >> 14) & 0x3;

        const xRaw = attr1 & 0x1ff;
        const x = xRaw >= 256 ? xRaw - 512 : xRaw;
        const rotScaleParam = (attr1 >> 9) & 0x1f;
        const flipX = !rotScale && ((attr1 >> 12) & 0x1) === 1;
        const flipY = !rotScale && ((attr1 >> 13) & 0x1) === 1;
        const size = (attr1 >> 14) & 0x3;

        const tileIndex = attr2 & 0x3ff;
        const priority = (attr2 >> 10) & 0x3;
        const paletteIndex = (attr2 >> 12) & 0xf;

        const [widthPixels, heightPixels] = OBJ_SHAPE_SIZE_TABLE[`${shape}-${size}`] || [8, 8];

        oam.push({
          y,
          rotScale,
          doubleSize,
          disable,
          mode,
          mosaic,
          colorFormat,
          shape,
          x,
          rotScaleParam,
          flipX,
          flipY,
          size,
          tileIndex,
          priority,
          paletteIndex,
          widthPixels,
          heightPixels,
        });
      }

      cells.push({ oam });
    }

    this.cellData = { numCells, metatileEntrySize, boundarySize, cells };
  }

  public getCellData(): NCERData | null {
    return this.cellData;
  }

  public getInfo(): string {
    if (!this.cellData) return "No cell data found";
    const { numCells, metatileEntrySize, boundarySize } = this.cellData;
    return `Cells: ${numCells}\nEntry size: ${metatileEntrySize} bytes\nBoundary size: ${boundarySize}`;
  }

  // Composites a single cell's OBJ list onto an RGBA canvas using tile pixel data from an NCGR
  // and palette colors from an NCLR. tileWidth/tileHeight give the source tile sheet dimensions
  // in 8px tiles (needed to index into linear or 2D-mapped NCGR pixel data).
  public renderCellRGBA(
    cellIndex: number,
    ncgrPixelData: Uint8Array,
    ncgrColorFormat: "palette16" | "palette256",
    tileSheetWidthTiles: number,
    mappingMode: "1D" | "2D",
    paletteColors: { r: number; g: number; b: number }[],
    canvasWidth: number,
    canvasHeight: number,
    originX: number = canvasWidth / 2,
    originY: number = canvasHeight / 2,
  ): Uint8ClampedArray | null {
    if (!this.cellData) return null;
    const cell = this.cellData.cells[cellIndex];
    if (!cell) return null;

    const rgba = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);

    for (const o of cell.oam) {
      const tilesWide = o.widthPixels / 8;
      const tilesHigh = o.heightPixels / 8;
      const paletteOffset = ncgrColorFormat === "palette16" ? o.paletteIndex * 16 : 0;

      for (let ty = 0; ty < tilesHigh; ty++) {
        for (let tx = 0; tx < tilesWide; tx++) {
          // 1D mapping: tiles within an OBJ are consecutive in memory.
          // 2D mapping: tiles are addressed as rows within the fixed-width tile sheet.
          const tileIndex = mappingMode === "1D" ? o.tileIndex + ty * tilesWide + tx : o.tileIndex + ty * tileSheetWidthTiles + tx;

          for (let py = 0; py < 8; py++) {
            for (let px = 0; px < 8; px++) {
              const srcPx = o.flipX ? 7 - px : px;
              const srcPy = o.flipY ? 7 - py : py;

              const pixelOffsetInTile = srcPy * 8 + srcPx;
              const globalPixelIndex = tileIndex * 64 + pixelOffsetInTile;
              if (globalPixelIndex >= ncgrPixelData.length) continue;

              const destX = Math.round(originX + o.x + tx * 8 + px);
              const destY = Math.round(originY + o.y + ty * 8 + py);
              if (destX < 0 || destX >= canvasWidth || destY < 0 || destY >= canvasHeight) continue;

              const palValue = ncgrPixelData[globalPixelIndex];
              if (palValue === 0) continue;

              const color = paletteColors[paletteOffset + palValue] || { r: 0, g: 0, b: 0 };
              const rgbaOffset = (destY * canvasWidth + destX) * 4;

              rgba[rgbaOffset] = color.r;
              rgba[rgbaOffset + 1] = color.g;
              rgba[rgbaOffset + 2] = color.b;
              rgba[rgbaOffset + 3] = 255;
            }
          }
        }
      }
    }

    return rgba;
  }
}
