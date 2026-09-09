// grpconf.ts: GRPCONF Table Parser (.tbl, e.g. grpconf.tbl)
// No magic signature. Confirmed against two real files (grpconf.tbl and
// 2grpconf.tbl) where total size divides evenly into 16-byte records with
// sequential ids and round-number values (9999, 1500, 1200), consistent with
// per-group distance/timer thresholds. Other .tbl files (e.g. emblem_s.tbl)
// don't divide evenly into 16 bytes, so this parser refuses rather than
// guessing a wrong layout.

interface GRPCONFEntry {
  id: number;
  flag: number;
  valA: number;
  valB: number;
  reserved: number[];
}

export class GRPCONF {
  private view: DataView;
  private entries: GRPCONFEntry[] = [];

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    if (buffer.byteLength % 16 !== 0) {
      throw new Error(`File size ${buffer.byteLength} is not a multiple of 16 — not a recognized GRPCONF-style .tbl layout`);
    }
    this.parse();
  }

  private parse(): void {
    const count = this.view.byteLength / 16;
    for (let i = 0; i < count; i++) {
      const base = i * 16;
      this.entries.push({
        id: this.view.getUint16(base, true),
        flag: this.view.getUint16(base + 2, true),
        valA: this.view.getUint16(base + 4, true),
        valB: this.view.getUint16(base + 6, true),
        reserved: [this.view.getUint16(base + 8, true), this.view.getUint16(base + 10, true), this.view.getUint16(base + 12, true), this.view.getUint16(base + 14, true)],
      });
    }
  }

  getEntries(): GRPCONFEntry[] {
    return this.entries;
  }

  getInfo(): string {
    return this.entries
      .map((e) => {
        const reservedHex = e.reserved.map((v) => v.toString(16).padStart(4, "0")).join(" ");
        return `id=${e.id} flag=${e.flag} valA=${e.valA} valB=${e.valB} reserved=[${reservedHex}]`;
      })
      .join("\n");
  }
}
