// nsbtp.ts: NSBTP (Pattern Animation) Parser
// Parses BTP0 container -> PAT0 subfile -> PatternAnimation list. Each animation
// has per-material Tracks of Keyframes that swap which texture/palette name is
// bound to that material at a given frame (flipbook-style texture animation).
// Format: apicula nsbmd_docs.txt ("Pattern Animations" section).

interface NSBTPKeyframe {
  frame: number;
  textureIndex: number;
  paletteIndex: number;
}

interface NSBTPTrack {
  materialName: string;
  keyframes: NSBTPKeyframe[];
}

interface NSBTPAnimation {
  name: string;
  numFrames: number;
  textureNames: string[];
  paletteNames: string[];
  tracks: NSBTPTrack[];
}

export class NSBTP {
  private view: DataView;
  private data: Uint8Array;
  private animations: NSBTPAnimation[] = [];

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);
    this.parse();
  }

  private readString(offset: number, length: number): string {
    let str = "";
    for (let i = 0; i < length; i++) {
      const charCode = this.data[offset + i];
      if (charCode === 0) break;
      str += String.fromCharCode(charCode);
    }
    return str.trim();
  }

  private parse(): void {
    const magic = this.readString(0, 4);
    if (magic !== "BTP0") {
      throw new Error(`Invalid NSBTP file: expected BTP0, got ${magic}`);
    }

    const headerSize = this.view.getUint16(0x0c, true);
    const numBlocks = this.view.getUint16(0x0e, true);

    for (let i = 0; i < numBlocks; i++) {
      const blockOffset = this.view.getUint32(headerSize + i * 4, true);
      if (blockOffset >= this.view.byteLength) continue;

      const subMagic = this.readString(blockOffset, 4);
      if (subMagic === "PAT0") this.parsePAT(blockOffset);
    }
  }

  // NameList(T): dummy(1)+count(1)+size(2), then an 8-byte UnknownHeader, then
  // count*4 bytes of per-entry unknowns, then element_size(2)+data_section_size(2),
  // then T[count] data, then Name[count] (16 bytes each). Returns entry offsets
  // (dataStart) and name-table offset (namesStart) so callers can index both.
  private readNameList(nlStart: number, elementSize: number): { count: number; dataStart: number; namesStart: number } {
    const count = this.view.getUint8(nlStart + 1);
    const dataStart = nlStart + 16 + count * 4;
    const namesStart = dataStart + count * elementSize;
    return { count, dataStart, namesStart };
  }

  private parsePAT(offset: number): void {
    // PAT { stamp[4], filesize:u32, pattern_animations: NameList(u32) }
    const { count, dataStart, namesStart } = this.readNameList(offset + 8, 4);

    for (let i = 0; i < count; i++) {
      const entryOffset = this.view.getUint32(dataStart + i * 4, true);
      const name = this.readString(namesStart + i * 16, 16);
      this.animations.push(this.parsePatternAnimation(offset + entryOffset, name));
    }
  }

  private parsePatternAnimation(offset: number, name: string): NSBTPAnimation {
    const numFrames = this.view.getUint16(offset + 4, true);
    const numTextureNames = this.view.getUint8(offset + 6);
    const numPaletteNames = this.view.getUint8(offset + 7);
    const textureNamesOff = this.view.getUint16(offset + 8, true);
    const paletteNamesOff = this.view.getUint16(offset + 10, true);

    const textureNames: string[] = [];
    for (let i = 0; i < numTextureNames; i++) {
      textureNames.push(this.readString(offset + textureNamesOff + i * 16, 16));
    }

    const paletteNames: string[] = [];
    for (let i = 0; i < numPaletteNames; i++) {
      paletteNames.push(this.readString(offset + paletteNamesOff + i * 16, 16));
    }

    // tracks: NameList(Track). Track = { num_keyframes: u32, unknown: u16, offset: u16 } (8 bytes).
    const { count: trackCount, dataStart: trackDataStart, namesStart: trackNamesStart } = this.readNameList(offset + 12, 8);

    const tracks: NSBTPTrack[] = [];
    for (let i = 0; i < trackCount; i++) {
      const trackEntry = trackDataStart + i * 8;
      const numKeyframes = this.view.getUint32(trackEntry, true);
      const keyframesOff = this.view.getUint16(trackEntry + 6, true);
      const materialName = this.readString(trackNamesStart + i * 16, 16);

      const keyframes: NSBTPKeyframe[] = [];
      for (let k = 0; k < numKeyframes; k++) {
        const kfOffset = offset + keyframesOff + k * 4;
        keyframes.push({
          frame: this.view.getUint16(kfOffset, true),
          textureIndex: this.view.getUint8(kfOffset + 2),
          paletteIndex: this.view.getUint8(kfOffset + 3),
        });
      }

      tracks.push({ materialName, keyframes });
    }

    return { name, numFrames, textureNames, paletteNames, tracks };
  }

  getAnimations(): NSBTPAnimation[] {
    return this.animations;
  }

  getInfo(): string {
    return this.animations
      .map((anim) => {
        const trackLines = anim.tracks.map((t) => `    Track "${t.materialName}": ${t.keyframes.length} keyframes`).join("\n");
        return `Animation: "${anim.name}"\n` + `  Frames: ${anim.numFrames}\n` + `  Textures: ${anim.textureNames.join(", ")}\n` + `  Palettes: ${anim.paletteNames.join(", ")}\n` + trackLines;
      })
      .join("\n\n");
  }
}
