// tbl.ts: .tbl file parsers (two known variants, distinguished by content)
// GRPCONF (e.g. grpconf.tbl): no magic, 16-byte records, confirmed against
// grpconf.tbl and 2grpconf.tbl - total size divides evenly into 16-byte
// records with sequential ids and round-number values (9999, 1500, 1200),
// consistent with per-group distance/timer thresholds.
// EMBLEM (e.g. emblem_s.tbl): no magic, 8-byte header {count, reserved,
// fieldA, fieldB} + 8-byte entries {constFlag, index, atlasX, atlasY} +
// trailing blank index-0 entry + 2 bytes zero padding. Confirmed exact
// against emblem_s.tbl (header count=50 matches 49 numbered entries + 1
// blank entry, 51*8+2=410 bytes matching the file size precisely).
// Since both share the .tbl extension, callers should try GRPCONF first and
// fall back to EMBLEM on failure.

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

interface EMBLEMHeader {
  count: number;
  reserved: number;
  fieldA: number;
  fieldB: number;
}

interface EMBLEMEntry {
  constFlag: number;
  index: number;
  atlasX: number;
  atlasY: number;
}

export class EMBLEM {
  private view: DataView;
  private header: EMBLEMHeader;
  private entries: EMBLEMEntry[] = [];

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.header = {
      count: this.view.getUint16(0, true),
      reserved: this.view.getUint16(2, true),
      fieldA: this.view.getUint16(4, true),
      fieldB: this.view.getUint16(6, true),
    };
    this.parse();
  }

  private parse(): void {
    let offset = 8;
    while (offset + 8 <= this.view.byteLength) {
      this.entries.push({
        constFlag: this.view.getUint16(offset, true),
        index: this.view.getUint16(offset + 2, true),
        atlasX: this.view.getUint16(offset + 4, true),
        atlasY: this.view.getUint16(offset + 6, true),
      });
      offset += 8;
    }
  }

  getHeader(): EMBLEMHeader {
    return this.header;
  }

  getEntries(): EMBLEMEntry[] {
    return this.entries;
  }

  getInfo(): string {
    const h = this.header;
    const lines: string[] = [`count=${h.count} reserved=${h.reserved} fieldA=${h.fieldA} fieldB=${h.fieldB}`];
    this.entries.forEach((e) => {
      lines.push(`index=${e.index} constFlag=${e.constFlag} atlasX=${e.atlasX} atlasY=${e.atlasY}`);
    });
    return lines.join("\n");
  }
}
