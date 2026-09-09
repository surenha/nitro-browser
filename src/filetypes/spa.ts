// spa.ts: SPA (Particle Archive) Parser
// Based on HaroohiePals.Nitro.JNLib.Spl's SplArchive.cs. Parses the 32-byte
// header ("SPA " + version "1_21"), then the texture block ("SPT " entries,
// fully decoded including the packed TexParams bitfield). The emitter block
// is only recorded as a raw byte range (offset/length) since the SplEmitter
// class layout itself hasn't been supplied yet, so individual emitters are
// not decoded. ImageFormat values follow the standard NDS texture format
// enum, not something confirmed from this source.

enum ImageFormat {
  None = 0,
  A3I5 = 1,
  Palette4 = 2,
  Palette16 = 3,
  Palette256 = 4,
  Compressed4x4 = 5,
  A5I3 = 6,
  Direct = 7,
}

interface SPATexParams {
  format: ImageFormat;
  width: number;
  height: number;
  repeat: number;
  flip: number;
  pltt0Transparent: boolean;
  refTexData: boolean;
  refTexId: number;
}

interface SPATexture {
  params: SPATexParams;
  texSize: number;
  plttOffset: number;
  plttSize: number;
  plttIdxOffset: number;
  plttIdxSize: number;
  blockSize: number;
}

interface SPAHeader {
  emitterCount: number;
  textureCount: number;
  emitterBlockLength: number;
  textureBlockLength: number;
  textureBlockOffset: number;
}

export class SPA {
  private view: DataView;
  private header!: SPAHeader;
  private textures: SPATexture[] = [];

  static readonly SPA_SIGNATURE = 0x53504120;
  static readonly SPA_VERSION = 0x315f3231;
  static readonly SPT_SIGNATURE = 0x53505420;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.parse();
  }

  private parse(): void {
    const signature = this.view.getUint32(0, true);
    if (signature !== SPA.SPA_SIGNATURE) {
      throw new Error(`Invalid SPA file: expected 'SPA ' signature, got 0x${signature.toString(16)}`);
    }

    const version = this.view.getUint32(4, true);
    if (version !== SPA.SPA_VERSION) {
      throw new Error(`Unsupported SPA version: expected 0x${SPA.SPA_VERSION.toString(16)}, got 0x${version.toString(16)}`);
    }

    this.header = {
      emitterCount: this.view.getUint16(8, true),
      textureCount: this.view.getUint16(10, true),
      emitterBlockLength: this.view.getUint32(16, true),
      textureBlockLength: this.view.getUint32(20, true),
      textureBlockOffset: this.view.getUint32(24, true),
    };

    let cur = this.header.textureBlockOffset;
    for (let i = 0; i < this.header.textureCount; i++) {
      const { texture, nextOffset } = this.parseTexture(cur);
      this.textures.push(texture);
      cur = nextOffset;
    }
  }

  private parseTexture(start: number): { texture: SPATexture; nextOffset: number } {
    const signature = this.view.getUint32(start, true);
    if (signature !== SPA.SPT_SIGNATURE) {
      throw new Error(`Invalid Texture section: expected 'SPT ' at offset 0x${start.toString(16)}, got 0x${signature.toString(16)}`);
    }

    const paramsRaw = this.view.getUint32(start + 4, true);
    const params: SPATexParams = {
      format: paramsRaw & 0xf,
      width: (paramsRaw >> 4) & 0xf,
      height: (paramsRaw >> 8) & 0xf,
      repeat: (paramsRaw >> 12) & 0x3,
      flip: (paramsRaw >> 14) & 0x3,
      pltt0Transparent: ((paramsRaw >> 16) & 0x1) === 1,
      refTexData: ((paramsRaw >> 17) & 0x1) === 1,
      refTexId: (paramsRaw >> 18) & 0xff,
    };

    const texSize = this.view.getUint32(start + 8, true);
    const plttOffset = this.view.getUint32(start + 12, true);
    const plttSize = this.view.getUint32(start + 16, true);
    const plttIdxOffset = this.view.getUint32(start + 20, true);
    const plttIdxSize = this.view.getUint32(start + 24, true);
    const blockSize = this.view.getUint32(start + 28, true);

    const texture: SPATexture = { params, texSize, plttOffset, plttSize, plttIdxOffset, plttIdxSize, blockSize };
    return { texture, nextOffset: start + blockSize };
  }

  private textureDimension(bits: number): number {
    return 8 << bits;
  }

  getHeader(): SPAHeader {
    return this.header;
  }

  getTextures(): SPATexture[] {
    return this.textures;
  }

  getInfo(): string {
    const lines: string[] = [];
    lines.push(`Emitters: ${this.header.emitterCount} (raw block only, ${this.header.emitterBlockLength} bytes, not decoded)`);
    lines.push(`Textures: ${this.header.textureCount}`);
    this.textures.forEach((t, i) => {
      const w = this.textureDimension(t.params.width);
      const h = this.textureDimension(t.params.height);
      lines.push(
        `  Texture ${i}: format=${ImageFormat[t.params.format]} size=${w}x${h} repeat=${t.params.repeat} flip=${t.params.flip}` +
          ` pltt0Transparent=${t.params.pltt0Transparent} refTexData=${t.params.refTexData} refTexId=${t.params.refTexId}\n` +
          `    texSize=${t.texSize} plttSize=${t.plttSize} plttIdxSize=${t.plttIdxSize} blockSize=${t.blockSize}`,
      );
    });
    return lines.join("\n");
  }
}
