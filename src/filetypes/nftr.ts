// nftr.ts: NFTR (Nitro Font Resource) Parser
// Parses bitmap font data: per-glyph tile bitmaps (CGLP), character widths (CWDH),
// and code-point-to-glyph-index mappings (CMAP, chained list of direct/table/scan blocks).
// Format: GBATEK "DS Cartridge Nitro Font Resource Format" / DSHack NFTR wiki.

interface NFTRFontInfo {
  height: number;
  width: number;
  encoding: number;
}

interface NFTRGlyphData {
  tileWidth: number;
  tileHeight: number;
  tileSizeBytes: number;
  bitsPerPixel: number;
  tiles: Uint8Array[]; // raw packed bitmap bytes per glyph tile, indexed by glyph index
}

interface NFTRWidthEntry {
  leading: number;
  glyphWidth: number;
  charWidth: number;
}

export class NFTR {
  private view: DataView;
  private data: Uint8Array;
  private info: NFTRFontInfo | null = null;
  private glyphData: NFTRGlyphData | null = null;
  private widths: NFTRWidthEntry[] = [];
  private codeToGlyph: Map<number, number> = new Map();

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
    if (magic !== "RTFN") {
      throw new Error(`Invalid NFTR file: expected RTFN, got ${magic}`);
    }

    const finfOffsetRel = 0x10; // "FNIF" chunk always immediately follows the RTFN header
    const finfMagic = this.readString(finfOffsetRel, 4);
    if (finfMagic !== "FNIF") {
      throw new Error(`Invalid NFTR file: expected FNIF chunk, got ${finfMagic}`);
    }

    const height = this.view.getUint8(finfOffsetRel + 0x09);
    const width = this.view.getUint8(finfOffsetRel + 0x0d);
    const encoding = this.view.getUint8(finfOffsetRel + 0x0f);
    this.info = { height, width, encoding };

    const cglpAbsOffset = this.view.getUint32(finfOffsetRel + 0x10, true);
    const cwdhAbsOffset = this.view.getUint32(finfOffsetRel + 0x14, true);
    const cmapAbsOffset = this.view.getUint32(finfOffsetRel + 0x18, true);

    if (cglpAbsOffset) this.parseCGLP(cglpAbsOffset - 8);
    if (cwdhAbsOffset) this.parseCWDHChain(cwdhAbsOffset - 8);
    if (cmapAbsOffset) this.parseCMAPChain(cmapAbsOffset - 8);
  }

  private parseCGLP(offset: number): void {
    const magic = this.readString(offset, 4);
    if (magic !== "PLGC") return;

    const tileWidth = this.view.getUint8(offset + 0x08);
    const tileHeight = this.view.getUint8(offset + 0x09);
    const tileSizeBytes = this.view.getUint16(offset + 0x0a, true);
    const bitsPerPixel = this.view.getUint8(offset + 0x0e);

    const tiles: Uint8Array[] = [];
    let tileOffset = offset + 0x10;
    const chunkSize = this.view.getUint32(offset + 4, true);
    const chunkEnd = offset + chunkSize;

    while (tileOffset + tileSizeBytes <= chunkEnd && tileOffset + tileSizeBytes <= this.data.length) {
      tiles.push(this.data.slice(tileOffset, tileOffset + tileSizeBytes));
      tileOffset += tileSizeBytes;
    }

    this.glyphData = { tileWidth, tileHeight, tileSizeBytes, bitsPerPixel, tiles };
  }

  private parseCWDHChain(offset: number): void {
    let blockOffset = offset;

    while (blockOffset !== 0) {
      const magic = this.readString(blockOffset, 4);
      if (magic !== "HDWC") break;

      const firstIndex = this.view.getUint16(blockOffset + 0x08, true);
      const lastIndex = this.view.getUint16(blockOffset + 0x0a, true);
      const nextBlockAbsOffset = this.view.getUint32(blockOffset + 0x0c, true);

      let entryOffset = blockOffset + 0x10;
      for (let i = firstIndex; i <= lastIndex; i++) {
        if (entryOffset + 3 > this.data.length) break;
        const leading = this.view.getInt8(entryOffset);
        const glyphWidth = this.view.getUint8(entryOffset + 1);
        const charWidth = this.view.getUint8(entryOffset + 2);
        this.widths[i] = { leading, glyphWidth, charWidth };
        entryOffset += 3;
      }

      blockOffset = nextBlockAbsOffset ? nextBlockAbsOffset - 8 : 0;
    }
  }

  private parseCMAPChain(offset: number): void {
    let blockOffset = offset;

    while (blockOffset !== 0) {
      const magic = this.readString(blockOffset, 4);
      if (magic !== "PAMC") break;

      const firstCode = this.view.getUint16(blockOffset + 0x08, true);
      const lastCode = this.view.getUint16(blockOffset + 0x0a, true);
      const mappingType = this.view.getUint16(blockOffset + 0x0c, true);
      const nextBlockAbsOffset = this.view.getUint32(blockOffset + 0x10, true);

      const payloadOffset = blockOffset + 0x14;

      if (mappingType === 0) {
        // Direct mapping: sequential glyph indices starting at the given base.
        const firstGlyphIndex = this.view.getUint16(payloadOffset, true);
        for (let code = firstCode; code <= lastCode; code++) {
          this.codeToGlyph.set(code, firstGlyphIndex + (code - firstCode));
        }
      } else if (mappingType === 1) {
        // Table mapping: one glyph index per code point, 0xFFFF = unmapped.
        const count = lastCode - firstCode + 1;
        for (let i = 0; i < count; i++) {
          const glyphIndex = this.view.getUint16(payloadOffset + i * 2, true);
          if (glyphIndex !== 0xffff) {
            this.codeToGlyph.set(firstCode + i, glyphIndex);
          }
        }
      } else if (mappingType === 2) {
        // Scan mapping: explicit (code, glyphIndex) pairs, ascending order.
        const entryCount = this.view.getUint16(payloadOffset, true);
        let pairOffset = payloadOffset + 2;
        for (let i = 0; i < entryCount; i++) {
          const code = this.view.getUint16(pairOffset, true);
          const glyphIndex = this.view.getUint16(pairOffset + 2, true);
          this.codeToGlyph.set(code, glyphIndex);
          pairOffset += 4;
        }
      }

      blockOffset = nextBlockAbsOffset ? nextBlockAbsOffset - 8 : 0;
    }
  }

  public getInfo(): string {
    if (!this.info || !this.glyphData) return "No font data found";
    return `Height: ${this.info.height}\nWidth: ${this.info.width}\nEncoding: ${this.info.encoding}\nGlyphs: ${this.glyphData.tiles.length}\nMapped code points: ${this.codeToGlyph.size}\nBPP: ${this.glyphData.bitsPerPixel}`;
  }

  public getGlyphCount(): number {
    return this.glyphData?.tiles.length || 0;
  }

  public getMappedCodePoints(): number[] {
    return Array.from(this.codeToGlyph.keys()).sort((a, b) => a - b);
  }

  public getGlyphIndexForCodePoint(codePoint: number): number | null {
    return this.codeToGlyph.get(codePoint) ?? null;
  }

  // Renders a single glyph's tile bitmap as grayscale RGBA (white glyph pixels on transparent background).
  public renderGlyphRGBA(glyphIndex: number): { rgba: Uint8ClampedArray; width: number; height: number } | null {
    if (!this.glyphData) return null;
    const tile = this.glyphData.tiles[glyphIndex];
    if (!tile) return null;

    const { tileWidth, tileHeight, bitsPerPixel } = this.glyphData;
    const rgba = new Uint8ClampedArray(tileWidth * tileHeight * 4);
    const maxValue = (1 << bitsPerPixel) - 1;

    let bitPos = 0;
    for (let y = 0; y < tileHeight; y++) {
      for (let x = 0; x < tileWidth; x++) {
        const bytePos = bitPos >> 3;
        const bitOffsetInByte = bitPos & 7;

        let value = 0;
        for (let b = 0; b < bitsPerPixel; b++) {
          const curByte = bytePos + ((bitOffsetInByte + b) >> 3);
          const curBit = (bitOffsetInByte + b) & 7;
          if (curByte < tile.length) {
            const bitVal = (tile[curByte] >> (7 - curBit)) & 1;
            value |= bitVal << (bitsPerPixel - 1 - b);
          }
        }

        const intensity = Math.round((value / maxValue) * 255);
        const idx = (y * tileWidth + x) * 4;
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
        rgba[idx + 3] = value === 0 ? 0 : intensity;

        bitPos += bitsPerPixel;
      }
    }

    return { rgba, width: tileWidth, height: tileHeight };
  }
}
