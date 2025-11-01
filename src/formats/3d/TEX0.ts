import { BufferReader } from "../../core/BufferReader";
import { TEX0Header } from "./TEX0Header";
import { TextureInfoSection } from "./TextureInfoSection";
import { PaletteInfoSection } from "./PaletteInfoSection";
import { TextureFormats } from "./TextureFormats";

export class TEX0 {
  constructor(raw: BufferReader) {
    this.raw = raw;
    this.header = new TEX0Header(raw.slice(0, 0x40));

    if (this.header.magic !== "TEX0") {
      throw new Error(`Invalid TEX0 magic: ${this.header.magic}`);
    }

    this.textureInfo = new TextureInfoSection(
      raw.slice(this.header.textureInfoOffset)
    );
    this.paletteInfo = new PaletteInfoSection(
      raw.slice(this.header.paletteInfoOffset)
    );
  }

  raw: BufferReader;
  header: TEX0Header;
  textureInfo: TextureInfoSection;
  paletteInfo: PaletteInfoSection;

  parseTexture(texIndex: number, palIndex: number = texIndex): Uint8Array {
    const textureInfo = this.textureInfo.entries[texIndex];

    try {
      const texOffset =
        this.header.textureDataOffset + textureInfo.textureOffset;

      let texSize = 0;
      switch (textureInfo.format) {
        case 1: // A3I5
        case 4: // 256-color
        case 6: // A5I3
          texSize = textureInfo.width * textureInfo.height;
          break;
        case 2: // 4-color
          texSize = (textureInfo.width * textureInfo.height) / 4;
          break;
        case 3: // 16-color
          texSize = (textureInfo.width * textureInfo.height) / 2;
          break;
        case 5: // Compressed
          texSize = (textureInfo.width * textureInfo.height) / 2;
          break;
        case 7: // Direct color
          texSize = textureInfo.width * textureInfo.height * 2;
          break;
        default:
          throw new Error(`Unsupported texture format: ${textureInfo.format}`);
      }

      const texRaw = this.raw.slice(texOffset, texOffset + texSize);

      let palRaw: BufferReader | null = null;
      if (textureInfo.format >= 2 && textureInfo.format <= 4) {
        const paletteInfo = this.paletteInfo.entries[palIndex];
        const paletteOffset =
          this.header.paletteDataOffset + paletteInfo.paletteOffset;
        const palSize =
          textureInfo.format === 2
            ? 0x08
            : textureInfo.format === 3
            ? 0x20
            : 0x400;
        palRaw = this.raw.slice(paletteOffset, paletteOffset + palSize);
      }

      return TextureFormats.parseFormat(
        textureInfo.format,
        texRaw,
        palRaw,
        textureInfo.width,
        textureInfo.height,
        textureInfo.firstColorTransparent
      );
    } catch (error) {
      console.warn(
        "Failed to parse actual texture data, using fallback:",
        error
      );
      return this.createPlaceholderTexture(
        textureInfo.width,
        textureInfo.height,
        texIndex
      );
    }
  }

  private createPlaceholderTexture(
    width: number,
    height: number,
    texIndex: number
  ): Uint8Array {
    const textureData = new Uint8Array(width * height * 4);
    const name = this.textureInfo.names[texIndex] || `Texture${texIndex}`;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;

        const r = (texIndex * 50) % 255;
        const g = (name.length * 30) % 255;
        const b = ((x + y) * 2) % 255;

        const isGrid = x % 16 < 2 || y % 16 < 2;

        textureData[index] = isGrid ? 255 : r;
        textureData[index + 1] = isGrid ? 255 : g;
        textureData[index + 2] = isGrid ? 255 : b;
        textureData[index + 3] = 255;
      }
    }

    return textureData;
  }
}
