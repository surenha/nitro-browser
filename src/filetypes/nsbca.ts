// nsbca.ts: NSBCA (Joint/Skeletal Animation) Parser
// Parses BCA0 container -> JNT0 subfile -> a list of Animations, each holding
// per-object (joint) translation/rotation/scale curves. Curves are either a
// constant value or a sampled array; rotation samples reference a shared pivot
// or basis table rather than storing raw matrices inline.
// Format: reverse-engineered from apicula's src/nitro/animation.rs + rotation.rs
// (scurest/apicula), which is a working reference implementation.

interface NSBCACurve {
  kind: "none" | "constant" | "samples";
  value?: number;
  startFrame?: number;
  endFrame?: number;
  sampleCount?: number;
}

interface NSBCAObjectCurves {
  animated: boolean;
  translation: [NSBCACurve, NSBCACurve, NSBCACurve];
  rotation: NSBCACurve;
  scale: [NSBCACurve, NSBCACurve, NSBCACurve];
  firstFrameTranslation?: [number, number, number];
  firstFrameScale?: [number, number, number];
}

interface NSBCAAnimation {
  name: string;
  numFrames: number;
  objects: NSBCAObjectCurves[];
}

export class NSBCA {
  private view: DataView;
  private data: Uint8Array;
  private animations: NSBCAAnimation[] = [];
  private currentAnimBase = 0;

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

  private bits(x: number, lo: number, hi: number): number {
    return (x >> lo) & ((1 << (hi - lo)) - 1);
  }

  private fix32(x: number, intBits: number, fracBits: number): number {
    const totalBits = 1 + intBits + fracBits;
    const masked = x & (totalBits >= 32 ? 0xffffffff : (1 << totalBits) - 1);
    const signMask = 1 << (intBits + fracBits);
    const signed = masked & signMask ? masked | ~(signMask - 1) : masked;
    return signed / 2 ** fracBits;
  }

  private fix16(x: number, intBits: number, fracBits: number): number {
    return this.fix32(x, intBits, fracBits);
  }

  // NameList(T): dummy(1)+count(1)+size(2), 8-byte UnknownHeader, count*4 bytes
  // of unknowns, element_size(2)+data_section_size(2), then T[count] data,
  // then Name[count] (16 bytes each).
  private readNameList(nlStart: number, elementSize: number): { count: number; dataStart: number; namesStart: number } {
    const count = this.view.getUint8(nlStart + 1);
    const dataStart = nlStart + 16 + count * 4;
    const namesStart = dataStart + count * elementSize;
    return { count, dataStart, namesStart };
  }

  private parse(): void {
    const magic = this.readString(0, 4);
    if (magic !== "BCA0") {
      throw new Error(`Invalid NSBCA file: expected BCA0, got ${magic}`);
    }

    const headerSize = this.view.getUint16(0x0c, true);
    const numBlocks = this.view.getUint16(0x0e, true);

    for (let i = 0; i < numBlocks; i++) {
      const blockOffset = this.view.getUint32(headerSize + i * 4, true);
      if (blockOffset >= this.view.byteLength) continue;

      const subMagic = this.readString(blockOffset, 4);
      if (subMagic === "JNT0") this.parseJNT0(blockOffset);
    }
  }

  private parseJNT0(blockOffset: number): void {
    const { count, dataStart, namesStart } = this.readNameList(blockOffset + 8, 4);

    for (let i = 0; i < count; i++) {
      const animOffset = this.view.getUint32(dataStart + i * 4, true);
      const name = this.readString(namesStart + i * 16, 16);
      this.animations.push(this.parseAnimation(blockOffset + animOffset, name));
    }
  }

  private fetchRotationMatrix(x: number, pivotData: number, basisData: number): void {
    // Only used to validate the reference exists; full 3x3 reconstruction is
    // skipped for this text-only info view (see getInfo).
    const mode = this.bits(x, 15, 16);
    const idx = this.bits(x, 0, 15);
    if (mode === 1) {
      pivotData + idx * 6; // pivot table entry (selNeg:u16, a:u16, b:u16)
    } else {
      basisData + idx * 10; // basis table entry (5x u16)
    }
  }

  private parseAnimation(base: number, name: string): NSBCAAnimation {
    const stamp = this.readString(base, 4);
    if (stamp !== "J\0AC" && stamp.charAt(0) !== "J") {
      throw new Error(`Invalid Animation section: expected 'J\\0AC' stamp, got "${stamp}"`);
    }

    this.currentAnimBase = base;

    const numFrames = this.view.getUint16(base + 4, true);
    const numObjects = this.view.getUint16(base + 6, true);
    const pivotDataOff = this.view.getUint32(base + 0x0c, true);
    const basisDataOff = this.view.getUint32(base + 0x10, true);
    const pivotData = base + pivotDataOff;
    const basisData = base + basisDataOff;

    const objects: NSBCAObjectCurves[] = [];
    for (let i = 0; i < numObjects; i++) {
      const curvesOff = this.view.getUint16(base + 0x14 + i * 2, true);
      objects.push(this.parseObjectCurves(base + curvesOff, pivotData, basisData));
    }

    return { name, numFrames, objects };
  }

  private parseObjectCurves(start: number, pivotData: number, basisData: number): NSBCAObjectCurves {
    let cur = start;
    const flags = this.view.getUint16(cur, true);
    cur += 4; // flags(2) + dummy(1) + index(1)

    const animated = this.bits(flags, 0, 1) === 0;
    const transAnimated = this.bits(flags, 1, 3) === 0;
    const transConst: boolean[] = [this.bits(flags, 3, 4) !== 0, this.bits(flags, 4, 5) !== 0, this.bits(flags, 5, 6) !== 0];
    const rotAnimated = this.bits(flags, 6, 8) === 0;
    const rotConst = this.bits(flags, 8, 9) !== 0;
    const scaleAnimated = this.bits(flags, 9, 11) === 0;
    const scaleConst: boolean[] = [this.bits(flags, 11, 12) !== 0, this.bits(flags, 12, 13) !== 0, this.bits(flags, 13, 14) !== 0];

    const none: NSBCACurve = { kind: "none" };
    const result: NSBCAObjectCurves = {
      animated,
      translation: [none, none, none],
      rotation: none,
      scale: [none, none, none],
    };

    if (!animated) return result;

    const firstFrameTranslation: [number, number, number] = [0, 0, 0];
    const firstFrameScale: [number, number, number] = [1, 1, 1];

    if (transAnimated) {
      for (let i = 0; i < 3; i++) {
        if (transConst[i]) {
          const v = this.fix32(this.view.getUint32(cur, true), 19, 12);
          cur += 4;
          result.translation[i] = { kind: "constant", value: v };
          firstFrameTranslation[i] = v;
        } else {
          const info = this.view.getUint32(cur, true);
          cur += 4;
          const off = this.view.getUint32(cur, true);
          cur += 4;
          const startFrame = this.bits(info, 0, 16);
          const endFrame = this.bits(info, 16, 28);
          const rate = this.bits(info, 30, 32);
          const dataWidth = this.bits(info, 28, 30);
          const numSamples = (endFrame - startFrame) >> rate;
          let firstVal = 0;
          if (numSamples > 0) {
            firstVal = dataWidth === 0 ? this.fix32(this.view.getUint32(this.animBaseFor(off), true), 19, 12) : this.fix16(this.view.getUint16(this.animBaseFor(off), true), 3, 12);
          }
          result.translation[i] = { kind: "samples", startFrame, endFrame, sampleCount: numSamples };
          firstFrameTranslation[i] = firstVal;
        }
      }
    }

    if (rotAnimated) {
      if (rotConst) {
        const v = this.view.getUint16(cur, true);
        cur += 4; // value(2) + padding(2)
        this.fetchRotationMatrix(v, pivotData, basisData);
        result.rotation = { kind: "constant" };
      } else {
        const info = this.view.getUint32(cur, true);
        cur += 4;
        const off = this.view.getUint32(cur, true);
        cur += 4;
        const startFrame = this.bits(info, 0, 16);
        const endFrame = this.bits(info, 16, 28);
        const rate = this.bits(info, 30, 32);
        const numSamples = (endFrame - startFrame) >> rate;
        result.rotation = { kind: "samples", startFrame, endFrame, sampleCount: numSamples };
      }
    }

    if (scaleAnimated) {
      for (let i = 0; i < 3; i++) {
        if (scaleConst[i]) {
          const v = this.fix32(this.view.getUint32(cur, true), 19, 12);
          cur += 8; // value(4) + second unused value(4)
          result.scale[i] = { kind: "constant", value: v };
          firstFrameScale[i] = v;
        } else {
          const info = this.view.getUint32(cur, true);
          cur += 4;
          const off = this.view.getUint32(cur, true);
          cur += 4;
          const startFrame = this.bits(info, 0, 16);
          const endFrame = this.bits(info, 16, 28);
          const rate = this.bits(info, 30, 32);
          const dataWidth = this.bits(info, 28, 30);
          const numSamples = (endFrame - startFrame) >> rate;
          let firstVal = 1;
          if (numSamples > 0) {
            firstVal = dataWidth === 0 ? this.fix32(this.view.getUint32(this.animBaseFor(off), true), 19, 12) : this.fix16(this.view.getUint16(this.animBaseFor(off), true), 3, 12);
          }
          result.scale[i] = { kind: "samples", startFrame, endFrame, sampleCount: numSamples };
          firstFrameScale[i] = firstVal;
        }
      }
    }

    result.firstFrameTranslation = firstFrameTranslation;
    result.firstFrameScale = firstFrameScale;

    return result;
  }

  private animBaseFor(off: number): number {
    return this.currentAnimBase + off;
  }

  getAnimations(): NSBCAAnimation[] {
    return this.animations;
  }

  getInfo(): string {
    return this.animations
      .map((anim) => {
        const objLines = anim.objects
          .map((o, i) => {
            if (!o.animated) return `  Object ${i}: not animated`;
            const t = o.firstFrameTranslation!;
            const s = o.firstFrameScale!;
            const curveDesc = (c: NSBCACurve) => (c.kind === "samples" ? `curve(${c.sampleCount} samples)` : c.kind);
            return (
              `  Object ${i}: translate(${curveDesc(o.translation[0])}) rotate(${curveDesc(o.rotation)}) scale(${curveDesc(o.scale[0])})\n` +
              `    frame0 translate: [${t.map((v) => v.toFixed(3)).join(", ")}]  scale: [${s.map((v) => v.toFixed(3)).join(", ")}]`
            );
          })
          .join("\n");
        return `Animation: "${anim.name}"\n` + `  Frames: ${anim.numFrames}\n` + `  Objects: ${anim.objects.length}\n` + objLines;
      })
      .join("\n\n");
  }
}
