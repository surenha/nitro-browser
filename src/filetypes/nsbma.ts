// nsbma.ts: NSBMA (Material Animation) Parser
// Parses BMA0 container -> MAT0 subfile -> a list of Animations ("M\0AM"
// stamped), each holding a dict of per-material Track entries. Each Track is
// 5 fixed 4-byte channels (0x14 bytes total): a raw u16 value, a u8 keyframe
// count, and a u8 flags byte. The raw value is an offset to keyframe data when
// the channel is animated, or an inline constant when flags mark it
// fixed/disabled. Keyframe entry layout itself is not documented, so keyframe
// data is not decoded yet, only counted.

interface NSBMAChannel {
  rawValue: number;
  numKeyframes: number;
  flags: number;
}

interface NSBMAMaterialTrack {
  name: string;
  channels: NSBMAChannel[];
}

interface NSBMAAnimation {
  name: string;
  numFrames: number;
  materials: NSBMAMaterialTrack[];
}

export class NSBMA {
  private view: DataView;
  private data: Uint8Array;
  private animations: NSBMAAnimation[] = [];

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

  private readNameList(nlStart: number, elementSize: number): { count: number; dataStart: number; namesStart: number } {
    const count = this.view.getUint8(nlStart + 1);
    const dataStart = nlStart + 16 + count * 4;
    const namesStart = dataStart + count * elementSize;
    return { count, dataStart, namesStart };
  }

  private parse(): void {
    const magic = this.readString(0, 4);
    if (magic !== "BMA0") {
      throw new Error(`Invalid NSBMA file: expected BMA0, got ${magic}`);
    }

    const headerSize = this.view.getUint16(0x0c, true);
    const numBlocks = this.view.getUint16(0x0e, true);

    for (let i = 0; i < numBlocks; i++) {
      const blockOffset = this.view.getUint32(headerSize + i * 4, true);
      if (blockOffset >= this.view.byteLength) continue;

      const subMagic = this.readString(blockOffset, 4);
      if (subMagic === "MAT0") this.parseMAT0(blockOffset);
    }
  }

  private parseMAT0(blockOffset: number): void {
    const { count, dataStart, namesStart } = this.readNameList(blockOffset + 8, 4);

    for (let i = 0; i < count; i++) {
      const entryOffset = dataStart + i * 4;
      const nameOffset = namesStart + i * 16;
      if (entryOffset + 4 > this.view.byteLength || nameOffset + 16 > this.view.byteLength) break;

      const animOffset = this.view.getUint32(entryOffset, true);
      const name = this.readString(nameOffset, 16);
      const animBase = blockOffset + animOffset;

      try {
        this.animations.push(this.parseAnimation(animBase, name));
      } catch (err) {
        this.animations.push({ name: `${name} (parse failed: ${err})`, numFrames: 0, materials: [] });
      }
    }
  }

  private parseAnimation(base: number, name: string): NSBMAAnimation {
    if (this.data[base] !== 0x4d || this.data[base + 2] !== 0x41 || this.data[base + 3] !== 0x4d) {
      throw new Error(`Invalid Animation section: expected "M\\0AM" stamp at 0x${base.toString(16)}`);
    }

    const numFrames = this.view.getUint16(base + 4, true);
    const { count, dataStart, namesStart } = this.readNameList(base + 8, 0x14);

    const materials: NSBMAMaterialTrack[] = [];
    for (let i = 0; i < count; i++) {
      const entryOffset = dataStart + i * 0x14;
      const nameOffset = namesStart + i * 16;
      if (entryOffset + 0x14 > this.view.byteLength || nameOffset + 16 > this.view.byteLength) break;

      const channels: NSBMAChannel[] = [];
      for (let c = 0; c < 5; c++) {
        const chBase = entryOffset + c * 4;
        channels.push({
          rawValue: this.view.getUint16(chBase, true),
          numKeyframes: this.view.getUint8(chBase + 2),
          flags: this.view.getUint8(chBase + 3),
        });
      }

      materials.push({ name: this.readString(nameOffset, 16), channels });
    }

    return { name, numFrames, materials };
  }

  getAnimations(): NSBMAAnimation[] {
    return this.animations;
  }

  getInfo(): string {
    return this.animations
      .map((anim) => {
        const matLines = anim.materials
          .map((m) => {
            const chLine = m.channels.map((c, i) => `ch${i}(kf:${c.numKeyframes},flags:0x${c.flags.toString(16)},val:0x${c.rawValue.toString(16)})`).join(" ");
            return `  Material "${m.name}": ${chLine}`;
          })
          .join("\n");
        return `Animation: "${anim.name}"\n` + `  Frames: ${anim.numFrames}\n` + `  Materials: ${anim.materials.length}\n` + matLines;
      })
      .join("\n\n");
  }
}
