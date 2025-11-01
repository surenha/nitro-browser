import { BufferReader } from "../../core/BufferReader";

export class TextureFormats {
  static parseFormat(
    format: number,
    texRaw: BufferReader,
    palRaw: BufferReader | null,
    width: number,
    height: number,
    firstColorTransparent: boolean = false
  ): Uint8Array {
    switch (format) {
      case 7: // Direct color (RGBA5551)
        return this.parseDirectColor(texRaw, width, height);
      case 4: // 256-color palette
        return this.parsePalette256(
          texRaw,
          palRaw!,
          width,
          height,
          firstColorTransparent
        );
      case 3: // 16-color palette
        return this.parsePalette16(
          texRaw,
          palRaw!,
          width,
          height,
          firstColorTransparent
        );
      case 2: // 4-color palette
        return this.parsePalette4(
          texRaw,
          palRaw!,
          width,
          height,
          firstColorTransparent
        );
      default:
        return this.createDiagnosticTexture(format, width, height);
    }
  }

  static parseDirectColor(
    texRaw: BufferReader,
    width: number,
    height: number
  ): Uint8Array {
    const textureData = new Uint8Array(width * height * 4);

    for (let i = 0; i < width * height; i++) {
      const color = texRaw.readUint16(i * 2);

      const r = ((color >> 0) & 0x1f) * 8;
      const g = ((color >> 5) & 0x1f) * 8;
      const b = ((color >> 10) & 0x1f) * 8;
      const a = ((color >> 15) & 0x01) * 255;

      const index = i * 4;
      textureData[index] = r;
      textureData[index + 1] = g;
      textureData[index + 2] = b;
      textureData[index + 3] = a;
    }

    return textureData;
  }

  static parsePalette256(
    texRaw: BufferReader,
    palRaw: BufferReader,
    width: number,
    height: number,
    firstColorTransparent: boolean
  ): Uint8Array {
    const textureData = new Uint8Array(width * height * 4);

    for (let i = 0; i < width * height; i++) {
      const paletteIndex = texRaw.readUint8(i);
      const color = palRaw.readUint16(paletteIndex * 2);

      const r = ((color >> 0) & 0x1f) * 8;
      const g = ((color >> 5) & 0x1f) * 8;
      const b = ((color >> 10) & 0x1f) * 8;
      const a = firstColorTransparent && paletteIndex === 0 ? 0 : 255;

      const index = i * 4;
      textureData[index] = r;
      textureData[index + 1] = g;
      textureData[index + 2] = b;
      textureData[index + 3] = a;
    }

    return textureData;
  }

  static parsePalette16(
    texRaw: BufferReader,
    palRaw: BufferReader,
    width: number,
    height: number,
    firstColorTransparent: boolean
  ): Uint8Array {
    const textureData = new Uint8Array(width * height * 4);

    for (let i = 0; i < (width * height) / 2; i++) {
      const byte = texRaw.readUint8(i);
      const paletteIndex1 = byte & 0x0f;
      const paletteIndex2 = (byte >> 4) & 0x0f;

      const color1 = palRaw.readUint16(paletteIndex1 * 2);
      const color2 = palRaw.readUint16(paletteIndex2 * 2);

      const index1 = i * 8;
      const index2 = i * 8 + 4;

      // First pixel
      textureData[index1] = ((color1 >> 0) & 0x1f) * 8;
      textureData[index1 + 1] = ((color1 >> 5) & 0x1f) * 8;
      textureData[index1 + 2] = ((color1 >> 10) & 0x1f) * 8;
      textureData[index1 + 3] =
        firstColorTransparent && paletteIndex1 === 0 ? 0 : 255;

      // Second pixel
      textureData[index2] = ((color2 >> 0) & 0x1f) * 8;
      textureData[index2 + 1] = ((color2 >> 5) & 0x1f) * 8;
      textureData[index2 + 2] = ((color2 >> 10) & 0x1f) * 8;
      textureData[index2 + 3] =
        firstColorTransparent && paletteIndex2 === 0 ? 0 : 255;
    }

    return textureData;
  }

  static parsePalette4(
    texRaw: BufferReader,
    palRaw: BufferReader,
    width: number,
    height: number,
    firstColorTransparent: boolean
  ): Uint8Array {
    const textureData = new Uint8Array(width * height * 4);

    for (let i = 0; i < (width * height) / 4; i++) {
      const byte = texRaw.readUint8(i);
      const paletteIndex1 = byte & 0x03;
      const paletteIndex2 = (byte >> 2) & 0x03;
      const paletteIndex3 = (byte >> 4) & 0x03;
      const paletteIndex4 = (byte >> 6) & 0x03;

      const colors = [
        palRaw.readUint16(paletteIndex1 * 2),
        palRaw.readUint16(paletteIndex2 * 2),
        palRaw.readUint16(paletteIndex3 * 2),
        palRaw.readUint16(paletteIndex4 * 2),
      ];

      for (let j = 0; j < 4; j++) {
        const index = i * 16 + j * 4;
        const color = colors[j];
        const paletteIndex = [
          paletteIndex1,
          paletteIndex2,
          paletteIndex3,
          paletteIndex4,
        ][j];

        textureData[index] = ((color >> 0) & 0x1f) * 8;
        textureData[index + 1] = ((color >> 5) & 0x1f) * 8;
        textureData[index + 2] = ((color >> 10) & 0x1f) * 8;
        textureData[index + 3] =
          firstColorTransparent && paletteIndex === 0 ? 0 : 255;
      }
    }

    return textureData;
  }

  static createDiagnosticTexture(
    format: number,
    width: number,
    height: number
  ): Uint8Array {
    const textureData = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;

        const stripe = Math.floor(x / 16) % 2;
        const formatColor = format * 40;

        textureData[index] = stripe ? formatColor : 0;
        textureData[index + 1] = stripe ? 0 : formatColor;
        textureData[index + 2] = 0;
        textureData[index + 3] = 255;
      }
    }

    return textureData;
  }
}
