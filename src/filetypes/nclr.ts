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
    const blockSize = this.view.getUint32(offset + 4, true);
    const blockEnd = offset + blockSize;

    const dataOffset = offset + 8;

    const colorFormat = this.view.getUint32(dataOffset, true);
    const extended = this.view.getUint32(dataOffset + 4, true);

    const declaredPaletteSize = this.view.getUint32(dataOffset + 8, true);

    const relativeDataOffset = this.view.getUint32(dataOffset + 12, true);
    const paletteDataOffset = dataOffset + relativeDataOffset;

    const availableInBlock = blockEnd - paletteDataOffset;
    const availableInBuffer = this.view.byteLength - paletteDataOffset;
    const paletteSize = Math.min(declaredPaletteSize, availableInBlock, availableInBuffer);

    if (paletteSize <= 0) {
      throw new RangeError(`Malformed NCLR: Palette block (offset: ${paletteDataOffset}) has no room for color data inside a ${this.view.byteLength}-byte buffer.`);
    }

    const format = colorFormat === 3 ? "palette16" : "palette256";
    const numColors = paletteSize / 2;

    // cap palette size to 16 if not extended
    // const format = colorFormat === 3 ? "palette16" : "palette256";
    // let numColors = paletteSize / 2;
    // if (format === "palette16" && extended !== 1) {
    //   numColors = Math.min(numColors, 16);
    // }
    const colors: NCLRColor[] = [];

    for (let i = 0; i < numColors; i++) {
      const currentByteIndex = paletteDataOffset + i * 2;
      const color16 = this.view.getUint16(currentByteIndex, true);

      const r5 = (color16 >> 0) & 0x1f;
      const g5 = (color16 >> 5) & 0x1f;
      const b5 = (color16 >> 10) & 0x1f;

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

  // public renderHTML(): string {
  //   if (!this.palette) return "<p>No palette data</p>";

  //   const isPalette16 = this.palette.format === "palette16";
  //   const colorsPerRow = isPalette16 ? 16 : 32;

  //   // Generates an 8px vertical row gap for 16-color bank visualization
  //   const rowGap = isPalette16 ? "8px" : "2px";
  //   let html = `<div style="display: grid; grid-template-columns: repeat(${colorsPerRow}, 20px); gap: ${rowGap} 2px;">`;

  //   for (const color of this.palette.colors) {
  //     html += `<div style="width: 20px; height: 20px; background: ${color.hex};" title="${color.hex}"></div>`;
  //   }

  //   html += "</div>";
  //   return html;
  // }

  public renderHTML(bankIndex = 0): string {
    if (!this.palette) return "<p>No palette data</p>";

    const isPalette16 = this.palette.format === "palette16";
    const colorsPerRow = isPalette16 ? 16 : 32;
    const colors = isPalette16 ? this.palette.colors.slice(bankIndex * 16, bankIndex * 16 + 16) : this.palette.colors;

    let html = `<div style="display: grid; grid-template-columns: repeat(${colorsPerRow}, 20px); gap: 2px;">`;
    for (const color of colors) {
      html += `<div style="width: 20px; height: 20px; background: ${color.hex};" title="${color.hex}"></div>`;
    }
    html += "</div>";
    return html;
  }
}
