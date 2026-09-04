// sdat.ts: SDAT (Nitro Sound Data Archive) Parser
// Parses the SDAT container into named sound entries (SSEQ, SSAR, SBNK, SWAR, STRM).
// Format: GBATEK "DS Sound Files - SDAT" (SYMB/INFO/FAT/FILE blocks).
// Does not decode the individual SSEQ/SBNK/SWAR/STRM payloads yet, only extracts their raw bytes.

type SDATRecordType = "SSEQ" | "SSAR" | "SBNK" | "SWAR" | "STRM";

interface SDATEntry {
  name: string;
  type: SDATRecordType;
  fileId: number;
  offset: number;
  size: number;
}

const RECORD_TYPES: SDATRecordType[] = ["SSEQ", "SSAR", "SBNK", "SWAR", "STRM"];

export class SDAT {
  private view: DataView;
  private data: Uint8Array;
  private symbOffset = 0;
  private infoOffset = 0;
  private fatOffset = 0;
  private fileOffset = 0;
  private fatEntries: { offset: number; size: number }[] = [];
  private entries: SDATEntry[] = [];

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);
    this.parse();
  }

  private readString(offset: number, length: number): string {
    return String.fromCharCode(...this.data.slice(offset, offset + length));
  }

  private readCString(offset: number): string {
    let end = offset;
    while (end < this.data.length && this.data[end] !== 0) end++;
    return this.readString(offset, end - offset);
  }

  private parse(): void {
    const magic = this.readString(0, 4);
    if (magic !== "SDAT") {
      throw new Error(`Invalid SDAT file: expected SDAT, got ${magic}`);
    }

    this.symbOffset = this.view.getUint32(0x10, true);
    const symbSize = this.view.getUint32(0x14, true);
    this.infoOffset = this.view.getUint32(0x18, true);
    this.fatOffset = this.view.getUint32(0x20, true);
    this.fileOffset = this.view.getUint32(0x28, true);

    this.parseFAT();

    const symbNames: Partial<Record<SDATRecordType, (string | null)[]>> = {};
    if (symbSize > 0 && this.symbOffset > 0) {
      symbNames.SSEQ = this.parseSymbolRecord(this.symbOffset, 0x08);
      symbNames.SSAR = this.parseSymbolRecord(this.symbOffset, 0x0c);
      symbNames.SBNK = this.parseSymbolRecord(this.symbOffset, 0x10);
      symbNames.SWAR = this.parseSymbolRecord(this.symbOffset, 0x14);
      symbNames.STRM = this.parseSymbolRecord(this.symbOffset, 0x24);
    }

    const infoFileIds: Partial<Record<SDATRecordType, number[]>> = {};
    infoFileIds.SSEQ = this.parseInfoRecord(this.infoOffset, 0x08);
    infoFileIds.SSAR = this.parseInfoRecord(this.infoOffset, 0x0c);
    infoFileIds.SBNK = this.parseInfoRecord(this.infoOffset, 0x10);
    infoFileIds.SWAR = this.parseInfoRecord(this.infoOffset, 0x14);
    infoFileIds.STRM = this.parseInfoRecord(this.infoOffset, 0x24);

    for (const type of RECORD_TYPES) {
      const fileIds = infoFileIds[type] || [];
      const names = symbNames[type] || [];

      for (let i = 0; i < fileIds.length; i++) {
        const fileId = fileIds[i];
        if (fileId === undefined || fileId === 0xffff) continue;

        const fat = this.fatEntries[fileId];
        if (!fat) continue;

        const name = names[i] || `${type}_${i}`;
        this.entries.push({ name, type, fileId, offset: fat.offset, size: fat.size });
      }
    }
  }

  private parseFAT(): void {
    const countOffset = this.fatOffset + 8;
    const count = this.view.getUint32(countOffset, true);
    let recOffset = countOffset + 4;

    for (let i = 0; i < count; i++) {
      const offset = this.view.getUint32(recOffset, true);
      const size = this.view.getUint32(recOffset + 4, true);
      this.fatEntries.push({ offset, size });
      recOffset += 16;
    }
  }

  // Reads a SYMB list: u32 count, then count x u32 name offsets (relative to SYMB+0).
  private parseSymbolRecord(symbBase: number, headerFieldOffset: number): (string | null)[] {
    const listOffsetRel = this.view.getUint32(symbBase + headerFieldOffset, true);
    if (listOffsetRel === 0) return [];

    const listOffset = symbBase + listOffsetRel;
    const count = this.view.getUint32(listOffset, true);
    const names: (string | null)[] = [];

    for (let i = 0; i < count; i++) {
      const nameOffsetRel = this.view.getUint32(listOffset + 4 + i * 4, true);
      if (nameOffsetRel === 0xffffffff) {
        names.push(null);
      } else {
        names.push(this.readCString(symbBase + nameOffsetRel));
      }
    }

    return names;
  }

  // Reads an INFO record list: u32 count, then count x u32 entry offsets (relative to INFO+0).
  // Every entry struct begins with a u16 fileId, which is all we currently need.
  private parseInfoRecord(infoBase: number, headerFieldOffset: number): number[] {
    const listOffsetRel = this.view.getUint32(infoBase + headerFieldOffset, true);
    if (listOffsetRel === 0) return [];

    const listOffset = infoBase + listOffsetRel;
    const count = this.view.getUint32(listOffset, true);
    const fileIds: number[] = [];

    for (let i = 0; i < count; i++) {
      const entryOffsetRel = this.view.getUint32(listOffset + 4 + i * 4, true);
      if (entryOffsetRel === 0) {
        fileIds.push(0xffff);
        continue;
      }
      const entryOffset = infoBase + entryOffsetRel;
      fileIds.push(this.view.getUint16(entryOffset, true));
    }

    return fileIds;
  }

  public getEntries(): SDATEntry[] {
    return this.entries;
  }

  public extractFile(fileName: string): Uint8Array | null {
    const entry = this.entries.find((e) => e.name === fileName);
    if (!entry) return null;
    return this.data.slice(entry.offset, entry.offset + entry.size);
  }

  public list(): string {
    const byType: Record<string, SDATEntry[]> = {};
    for (const entry of this.entries) {
      if (!byType[entry.type]) byType[entry.type] = [];
      byType[entry.type].push(entry);
    }

    let output = "";
    const types = Object.keys(byType);

    types.forEach((type, ti) => {
      const isLastType = ti === types.length - 1;
      output += (isLastType ? "└── " : "├── ") + type + "/\n";
      const indent = isLastType ? "    " : "│   ";

      byType[type].forEach((entry, ei, arr) => {
        const isLastEntry = ei === arr.length - 1;
        const prefix = isLastEntry ? "└── " : "├── ";
        output += indent + prefix + entry.name + `.${entry.type} (${entry.size} bytes)\n`;
      });
    });

    return output;
  }

  public getInfo(): string {
    const counts = RECORD_TYPES.map((type) => `${type}: ${this.entries.filter((e) => e.type === type).length}`);
    return counts.join("\n");
  }
}
