// prm.ts: PRM (Enemy/Object Parameter) Parser
// No magic/signature - raw little-endian u32 array, values encoded as
// fix32(19,12) (divide by 4096 for the real-world value), same scheme as
// NSBCA/NSBMA. Field meanings below are inferred from diffing 7 real .prm
// files (king_ice_donketu vs its boss_donketu variant was the key anchor,
// since it isolates exactly what changes between normal/boss behavior of the
// same creature) plus an all-zero common.prm as a sanity check on the
// encoding. Only the first 8 words (the "header") are labeled; everything
// after that is still an undecoded block of repeating sub-records and is
// dumped raw. Treat every label here as a hypothesis, not a confirmed spec.

interface PRMHeader {
  behaviorType: number;
  speedMultiplier: number;
  radiusA: number;
  radiusB: number;
  scaleMin: number;
  scaleMax: number;
  constOne: number;
  bounceCoeff: number;
}

export class PRM {
  private view: DataView;
  private header: PRMHeader;
  private raw: number[] = [];

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.header = this.parseHeader();
    this.parseRaw();
  }

  private fix12(rawValue: number): number {
    return rawValue / 4096;
  }

  private parseHeader(): PRMHeader {
    return {
      behaviorType: this.view.getUint32(0, true),
      speedMultiplier: this.fix12(this.view.getUint32(4, true)),
      radiusA: this.fix12(this.view.getUint32(8, true)),
      radiusB: this.fix12(this.view.getUint32(12, true)),
      scaleMin: this.fix12(this.view.getUint32(16, true)),
      scaleMax: this.fix12(this.view.getUint32(20, true)),
      constOne: this.fix12(this.view.getUint32(24, true)),
      bounceCoeff: this.fix12(this.view.getUint32(28, true)),
    };
  }

  private parseRaw(): void {
    for (let offset = 32; offset + 4 <= this.view.byteLength; offset += 4) {
      this.raw.push(this.view.getUint32(offset, true));
    }
  }

  getHeader(): PRMHeader {
    return this.header;
  }

  getRawWords(): number[] {
    return this.raw;
  }

  getInfo(): string {
    const h = this.header;
    const lines: string[] = [];
    lines.push(`behaviorType: ${h.behaviorType}`);
    lines.push(`speedMultiplier: ${h.speedMultiplier.toFixed(4)}`);
    lines.push(`radiusA/radiusB: ${h.radiusA.toFixed(4)} / ${h.radiusB.toFixed(4)}`);
    lines.push(`scaleMin/scaleMax: ${h.scaleMin.toFixed(4)} / ${h.scaleMax.toFixed(4)}`);
    lines.push(`constOne: ${h.constOne.toFixed(4)}`);
    lines.push(`bounceCoeff: ${h.bounceCoeff.toFixed(4)}`);
    lines.push(`--- undecoded data (${this.raw.length} words) ---`);

    for (let i = 0; i < this.raw.length; i += 4) {
      const chunk = this.raw.slice(i, i + 4);
      const hex = chunk.map((v) => "0x" + v.toString(16).padStart(8, "0")).join("  ");
      const fixed = chunk.map((v) => this.fix12(v).toFixed(3)).join("  ");
      lines.push(`[${(32 + i * 4).toString(16).padStart(4, "0")}] ${hex}   (fix12: ${fixed})`);
    }

    return lines.join("\n");
  }
}
