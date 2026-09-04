// nanr.ts: NANR (Nitro Animation Resource) Parser
// Parses cell-animation sequences that play back frames of an NCER over time.
// Format: GBATEK "DS Files - 2D Video" (RNAN header, KNBA/ABNK chunk).

interface NANRFrame {
  cellIndex: number;
  frameLengthUnits: number;
}

interface NANRAnimation {
  numFrames: number;
  frames: NANRFrame[];
}

interface NANRData {
  numAnimations: number;
  animations: NANRAnimation[];
}

export class NANR {
  private view: DataView;
  private data: Uint8Array;
  private animData: NANRData | null = null;

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
    if (magic !== "RNAN") {
      throw new Error(`Invalid NANR file: expected RNAN, got ${magic}`);
    }

    const numBlocks = this.view.getUint16(0x0e, true);
    let offset = 0x10;

    for (let i = 0; i < numBlocks; i++) {
      if (offset + 8 > this.view.byteLength) break;

      const blockSig = this.readString(offset, 4);
      const blockSize = this.view.getUint32(offset + 4, true);

      if (blockSig === "KNBA") {
        this.parseABNK(offset);
      }

      offset += blockSize;
    }
  }

  private parseABNK(offset: number): void {
    const dataOffset = offset + 8;

    const numAnimBlocks = this.view.getUint16(dataOffset, true);
    const numFrameBlocks = this.view.getUint16(dataOffset + 0x02, true);
    const animBlocksOffsetRel = this.view.getUint32(dataOffset + 0x04, true);
    const frameBlocksOffsetRel = this.view.getUint32(dataOffset + 0x08, true);
    const frameDataOffsetRel = this.view.getUint32(dataOffset + 0x0c, true);

    const animBlocksOffset = dataOffset + animBlocksOffsetRel;
    const frameBlocksBase = dataOffset + frameBlocksOffsetRel;
    const frameDataBase = dataOffset + frameDataOffsetRel;

    const animations: NANRAnimation[] = [];

    for (let i = 0; i < numAnimBlocks; i++) {
      const entryOffset = animBlocksOffset + i * 16;
      if (entryOffset + 16 > this.view.byteLength) break;

      const numFrames = this.view.getUint32(entryOffset, true);
      const firstFrameOffsetRel = this.view.getUint32(entryOffset + 0x0c, true);
      const firstFrameBlockOffset = frameBlocksBase + firstFrameOffsetRel;

      const frames: NANRFrame[] = [];

      for (let f = 0; f < numFrames; f++) {
        const frameBlockOffset = firstFrameBlockOffset + f * 8;
        if (frameBlockOffset + 8 > this.view.byteLength) break;

        const frameDataOffsetFromBase = this.view.getUint32(frameBlockOffset, true);
        const frameLengthUnits = this.view.getUint16(frameBlockOffset + 0x04, true);

        const frameDataOffset = frameDataBase + frameDataOffsetFromBase;
        let cellIndex = 0;
        if (frameDataOffset + 2 <= this.view.byteLength) {
          cellIndex = this.view.getUint16(frameDataOffset, true);
        }

        frames.push({ cellIndex, frameLengthUnits });
      }

      animations.push({ numFrames, frames });
    }

    this.animData = { numAnimations: numAnimBlocks, animations };
  }

  public getAnimationData(): NANRData | null {
    return this.animData;
  }

  public getInfo(): string {
    if (!this.animData) return "No animation data found";
    return `Animations: ${this.animData.numAnimations}`;
  }
}
