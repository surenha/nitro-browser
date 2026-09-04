// NCLR parser: Extracts color palettes from Nintendo DS NCLR files

interface NCLRColor {
  r: number;
  g: number;
  b: number;
  hex: string;
}

interface NCLRPalette {
  colors: NCLRColor[];
  format: "palette16" | "palette256";
  extended: boolean;
}

export class NCLR {
  private view: DataView;
  private data: Uint8Array;
  private palette: NCLRPalette | null = null;

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
    if (magic !== "RLCN" && magic !== "RPCN") {
      throw new Error(`Invalid NCLR file: expected RLCN or RPCN, got ${magic}`);
    }

    const numBlocks = this.view.getUint16(0x0e, true);
    let offset = 0x10;

    for (let i = 0; i < numBlocks; i++) {
      const blockSig = this.readString(offset, 4);
      const blockSize = this.view.getUint32(offset + 4, true);

      if (blockSig === "TTLP") {
        this.parsePLTT(offset);
      }

      offset += blockSize;
    }
  }

  private parsePLTT(offset: number): void {
    // TTLP Chunk Header starts at offset
    // 0x00: Magic 'TTLP' (4 bytes)
    // 0x04: Chunk Size (4 bytes)

    // According to NCLR spec, fields relative to TTLP start (+8):
    const dataOffset = offset + 8;

    const colorFormat = this.view.getUint32(dataOffset, true); // 3 = 4bpp, 4 = 8bpp
    const extended = this.view.getUint32(dataOffset + 4, true);

    // Read the actual size of the palette data payload
    const paletteSize = this.view.getUint32(dataOffset + 8, true);

    // CRITICAL FIX: Read the relative offset to the palette data from the file structure
    // Instead of hardcoding 0x18, use the structural pointer located at dataOffset + 12
    const relativeDataOffset = this.view.getUint32(dataOffset + 12, true);
    const paletteDataOffset = dataOffset + relativeDataOffset;

    // BOUNDS CHECK: Verify that the color array fits inside the ArrayBuffer
    if (paletteDataOffset + paletteSize > this.view.byteLength) {
      throw new RangeError(`Malformed NCLR: Palette block (offset: ${paletteDataOffset}, size: ${paletteSize}) overflows total buffer size (${this.view.byteLength} bytes).`);
    }

    const format = colorFormat === 3 ? "palette16" : "palette256";
    const numColors = paletteSize / 2;
    const colors: NCLRColor[] = [];

    for (let i = 0; i < numColors; i++) {
      const currentByteIndex = paletteDataOffset + i * 2;
      const color16 = this.view.getUint16(currentByteIndex, true);

      // Extract 5-bit color channels
      const r5 = (color16 >> 0) & 0x1f;
      const g5 = (color16 >> 5) & 0x1f;
      const b5 = (color16 >> 10) & 0x1f;

      // Accurate hardware-accurate BGR555 scaling (replicates upper bits to lowest bits)
      const r = r5 * 8;
      const g = g5 * 8;
      const b = b5 * 8;

      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

      colors.push({ r, g, b, hex });
    }

    this.palette = { colors, format, extended: extended === 1 };
  }

  public getPalette(): NCLRPalette | null {
    return this.palette;
  }

  public getInfo(): string {
    if (!this.palette) return "No palette data found";

    const { colors, format, extended } = this.palette;
    return `Format: ${format}\nExtended: ${extended}\nColors: ${colors.length}`;
  }

  public renderHTML(): string {
    if (!this.palette) return "<p>No palette data</p>";

    const isPalette16 = this.palette.format === "palette16";
    const colorsPerRow = isPalette16 ? 16 : 32;

    // Generates an 8px vertical row gap for 16-color bank visualization
    const rowGap = isPalette16 ? "8px" : "2px";
    let html = `<div style="display: grid; grid-template-columns: repeat(${colorsPerRow}, 20px); gap: ${rowGap} 2px;">`;

    for (const color of this.palette.colors) {
      html += `<div style="width: 20px; height: 20px; background: ${color.hex};" title="${color.hex}"></div>`;
    }

    html += "</div>";
    return html;
  }
}
