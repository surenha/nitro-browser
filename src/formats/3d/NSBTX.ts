import { BufferReader } from "../../core/BufferReader";

export class NSBTX {
  constructor(raw: BufferReader) {
    this.raw = raw;

    // Check magic
    const magic = raw.readChars(0x00, 4);
    console.log("NSBTX Magic:", magic);

    if (magic !== "BTX0" && magic !== "BTX1") {
      throw new Error(`Invalid NSBTX magic: ${magic}`);
    }

    this.magic = magic;
    this.fileSize = raw.readUint32(0x04);

    // Parse NSBTX structure properly
    this.parseNSBTX();
  }

  raw: BufferReader;
  magic: string;
  fileSize: number;
  textures: NSBTXTexture[] = [];

  private parseNSBTX() {
    console.log("Parsing NSBTX file structure...");

    // NSBTX file structure for Mario Kart DS:
    // - File header
    // - TEX0 section
    // - Texture info
    // - Actual texture data

    const tex0Offset = this.findTEX0Offset();
    if (tex0Offset === -1) {
      console.error("No TEX0 section found");
      return;
    }

    console.log("TEX0 section at:", tex0Offset.toString(16));
    this.parseTEX0(tex0Offset);
  }

  private findTEX0Offset(): number {
    // TEX0 section starts after file header
    for (let offset = 0x10; offset < this.raw.length - 4; offset += 4) {
      if (this.raw.readChars(offset, 4) === "TEX0") {
        return offset;
      }
    }
    return -1;
  }

  private parseTEX0(tex0Offset: number) {
    const tex0Size = this.raw.readUint32(tex0Offset + 4);

    // First try the structured approach
    const textureDataStarts = [0x50, 0x100, 0x200, 0x300, 0x400, 0x500];

    for (const relOffset of textureDataStarts) {
      const absOffset = tex0Offset + relOffset;
      if (absOffset < this.raw.length - 1024) {
        console.log(`Checking for textures at 0x${absOffset.toString(16)}...`);

        const foundTextures = this.scanForTextures(
          absOffset,
          tex0Size - relOffset
        );
        if (foundTextures.length > 0) {
          this.textures.push(...foundTextures);
          console.log(
            `Found ${
              foundTextures.length
            } textures starting at 0x${absOffset.toString(16)}`
          );
          return;
        }
      }
    }

    // If structured approach fails, extract all texture data
    console.log("Structured approach failed, extracting all texture data...");
    this.extractAllTextureData(tex0Offset, tex0Size);

    // Final fallback
    if (this.textures.length === 0) {
      this.findTexturesByPattern(tex0Offset + 0x50, tex0Size - 0x50);
    }
  }

  private scanForTextures(
    startOffset: number,
    maxSize: number
  ): NSBTXTexture[] {
    const textures: NSBTXTexture[] = [];
    let offset = startOffset;

    // Look for texture headers or data patterns
    while (offset < startOffset + maxSize - 512) {
      // Check if this could be texture data
      if (this.looksLikeTextureData(offset)) {
        // Try common texture sizes
        const sizes = [
          { width: 128, height: 128 }, // Character textures
          { width: 64, height: 64 }, // Face textures
          { width: 256, height: 256 }, // Large textures
          { width: 32, height: 32 }, // Small textures
          { width: 16, height: 16 }, // Icons
        ];

        for (const size of sizes) {
          const dataSize = size.width * size.height * 2; // RGBA5551
          if (offset + dataSize <= this.raw.length) {
            const texture = this.extractTexture(
              offset,
              size.width,
              size.height,
              7
            );
            if (texture && this.isValidTexture(texture)) {
              textures.push(texture);
              console.log(
                `✓ Extracted ${size.width}x${
                  size.height
                } texture at 0x${offset.toString(16)}`
              );
              offset += dataSize; // Move past this texture
              break;
            }
          }
        }
      }

      offset += 0x10; // Move to next potential texture
    }

    return textures;
  }

  private looksLikeTextureData(offset: number): boolean {
    // Check if data at this offset looks like texture data
    // Textures often have patterns and reasonable color values

    const sampleSize = 16;
    let validPixels = 0;

    for (let i = 0; i < sampleSize; i++) {
      if (offset + i * 2 + 2 > this.raw.length) break;

      const pixel = this.raw.readUint16(offset + i * 2);
      const r = (pixel >> 0) & 0x1f;
      const g = (pixel >> 5) & 0x1f;
      const b = (pixel >> 10) & 0x1f;

      if (r <= 31 && g <= 31 && b <= 31) {
        validPixels++;
      }
    }

    return validPixels >= sampleSize * 0.8;
  }

  private findTexturesByPattern(startOffset: number, maxSize: number) {
    console.log("Scanning for texture patterns...");

    // Look for the actual texture data by finding regions with good data
    let offset = startOffset;

    while (offset < startOffset + maxSize - 2048) {
      // Sample the data to see if it looks like a texture
      const sample = this.sampleTextureData(offset, 32);
      if (sample.score > 0.7) {
        console.log(
          `Potential texture at 0x${offset.toString(
            16
          )} (score: ${sample.score.toFixed(2)})`
        );

        // Try to extract textures of various sizes
        const textures = this.tryExtractTextures(offset, 2048);
        if (textures.length > 0) {
          this.textures.push(...textures);
          console.log(
            `Found ${textures.length} textures at 0x${offset.toString(16)}`
          );
          return;
        }
      }

      offset += 0x100; // Check every 256 bytes
    }
  }

  private sampleTextureData(
    offset: number,
    sampleCount: number
  ): { score: number; pixels: number[] } {
    const pixels: number[] = [];
    let validPixels = 0;
    let interestingPixels = 0;

    for (let i = 0; i < sampleCount; i++) {
      if (offset + i * 2 + 2 > this.raw.length) break;

      const pixel = this.raw.readUint16(offset + i * 2);
      pixels.push(pixel);

      const r = (pixel >> 0) & 0x1f;
      const g = (pixel >> 5) & 0x1f;
      const b = (pixel >> 10) & 0x1f;

      // Check if pixel values are valid
      if (r <= 31 && g <= 31 && b <= 31) {
        validPixels++;

        // Check if pixel is interesting (not all zeros or pattern)
        if (pixel !== 0x0000 && pixel !== 0xffff && pixel !== 0xaaaa) {
          interestingPixels++;
        }
      }
    }

    const validityScore = validPixels / sampleCount;
    const interestScore = interestingPixels / sampleCount;
    const overallScore = (validityScore + interestScore) / 2;

    return { score: overallScore, pixels };
  }

  private tryExtractTextures(
    offset: number,
    maxDataSize: number
  ): NSBTXTexture[] {
    const textures: NSBTXTexture[] = [];

    // Try different texture sizes
    const sizes = [
      { width: 128, height: 128 }, // Most likely for characters
      { width: 64, height: 128 }, // Tall textures
      { width: 128, height: 64 }, // Wide textures
      { width: 64, height: 64 }, // Square textures
      { width: 32, height: 32 }, // Small textures
      { width: 256, height: 256 }, // Large textures
    ];

    for (const size of sizes) {
      const dataSize = size.width * size.height * 2; // RGBA5551
      if (dataSize <= maxDataSize && offset + dataSize <= this.raw.length) {
        const texture = this.extractTexture(offset, size.width, size.height, 7);
        if (texture && this.isValidTexture(texture)) {
          textures.push(texture);
        }
      }
    }

    return textures;
  }

  private extractTexture(
    offset: number,
    width: number,
    height: number,
    format: number
  ): NSBTXTexture | null {
    try {
      const dataSize = width * height * 2; // RGBA5551
      const data = this.raw.slice(offset, offset + dataSize).getBuffer();

      return {
        width,
        height,
        format,
        data: new Uint8Array(data),
        offset,
        name: `Texture_${width}x${height}`,
      };
    } catch (error) {
      return null;
    }
  }

  private isValidTexture(texture: NSBTXTexture): boolean {
    // Basic validation that this looks like actual texture data
    if (texture.format === 7) {
      const dataView = new DataView(texture.data.buffer);
      let validPixels = 0;
      const sampleCount = Math.min(64, texture.data.length / 2);

      for (let i = 0; i < sampleCount; i++) {
        const pixel = dataView.getUint16(i * 2, true);
        const r = (pixel >> 0) & 0x1f;
        const g = (pixel >> 5) & 0x1f;
        const b = (pixel >> 10) & 0x1f;

        if (r <= 31 && g <= 31 && b <= 31) {
          validPixels++;
        }
      }

      const validity = validPixels / sampleCount;
      console.log(
        `Texture validation: ${validPixels}/${sampleCount} valid pixels (${(
          validity * 100
        ).toFixed(1)}%)`
      );

      return validity > 0.8;
    }

    return true;
  }

  getTextureCount(): number {
    return this.textures.length;
  }

  getTexture(index: number): NSBTXTexture | null {
    return this.textures[index] || null;
  }

  getAllTextures(): NSBTXTexture[] {
    return this.textures;
  }

  private extractAllTextureData(tex0Offset: number, tex0Size: number) {
    // Extract the entire TEX0 data section and try to interpret it as textures
    const dataStart = tex0Offset + 0x50; // Skip TEX0 header and some metadata
    const dataSize = tex0Size - 0x50;

    if (dataSize <= 0) return;

    console.log(
      `Extracting ${dataSize} bytes of texture data from 0x${dataStart.toString(
        16
      )}`
    );

    // The entire data section might be one large texture
    // Common sizes for character textures in Mario Kart DS
    const largeTextures = [
      { width: 256, height: 256 }, // 128KB
      { width: 128, height: 256 }, // 64KB
      { width: 256, height: 128 }, // 64KB
      { width: 128, height: 128 }, // 32KB
    ];

    for (const size of largeTextures) {
      const requiredSize = size.width * size.height * 2;
      if (dataSize >= requiredSize) {
        const texture = this.extractTexture(
          dataStart,
          size.width,
          size.height,
          7
        );
        if (texture && this.isValidTexture(texture)) {
          this.textures.push(texture);
          console.log(`✓ Found large ${size.width}x${size.height} texture`);
          return;
        }
      }
    }

    // If no large texture found, try multiple smaller textures
    this.extractMultipleTextures(dataStart, dataSize);
  }

  private extractMultipleTextures(startOffset: number, maxSize: number) {
    // Try to extract multiple textures from the data section
    let offset = startOffset;
    const textureSize = 32 * 32 * 2; // 32x32 RGBA5551 = 2KB

    while (offset + textureSize <= startOffset + maxSize) {
      const texture = this.extractTexture(offset, 32, 32, 7);
      if (texture && this.isValidTexture(texture)) {
        this.textures.push(texture);
        console.log(`✓ Found 32x32 texture at 0x${offset.toString(16)}`);
      }
      offset += textureSize;
    }
  }
}

export interface NSBTXTexture {
  width: number;
  height: number;
  format: number;
  data: Uint8Array;
  offset: number;
  name?: string;
}
