// bmg.ts: BMG (Binary Message) Parser
// JSystem BMG format, little-endian variant. Header "MESG"/"bmg1", then a
// sequence of blocks (INF1/MID1/DAT1/STR1/FLW1/FLI1) each 32-byte aligned.
// INF1 entries hold an offset into DAT1 plus game-specific extra bytes (not
// interpreted here beyond raw hex). DAT1 strings are decoded per the file's
// declared character set, with inline 0x1A control tags stripped out and
// shown as bracketed placeholders rather than parsed into game-specific
// tag data. MID1 ID reconstruction is only implemented for format 0 (the
// common case); other formats show the raw 32-bit entry with a caveat.
// STR1/FLW1/FLI1 are recorded by name/size only, their structure isn't in
// the spec provided.

interface BMGBlock {
  type: string;
  offset: number;
  size: number;
}

interface BMGInfEntry {
  dat1Offset: number;
  extra: number[];
}

interface BMGMidEntry {
  id: number;
  raw: number;
}

export class BMG {
  private view: DataView;
  private data: Uint8Array;
  private charset = 0;
  private blocks: BMGBlock[] = [];
  private infEntries: BMGInfEntry[] = [];
  private infEntrySize = 0;
  private dat1Offset = 0;
  private dat1Size = 0;
  private midEntries: BMGMidEntry[] = [];
  private midFormat = 0;
  private strings: string[] = [];

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);
    this.parse();
  }

  private readAscii(offset: number, length: number): string {
    let str = "";
    for (let i = 0; i < length; i++) str += String.fromCharCode(this.data[offset + i]);
    return str;
  }

  private parse(): void {
    if (this.readAscii(0, 4) !== "MESG" || this.readAscii(4, 4) !== "bmg1") {
      throw new Error(`Invalid BMG file: expected 'MESG'/'bmg1' header`);
    }

    const fileSize = this.view.getUint32(8, true);
    const numBlocks = this.view.getUint32(12, true);
    this.charset = this.view.getUint8(16);

    let offset = 0x20;
    for (let i = 0; i < numBlocks && offset + 8 <= fileSize; i++) {
      const type = this.readAscii(offset, 4);
      const size = this.view.getUint32(offset + 4, true);
      this.blocks.push({ type, offset, size });

      if (type === "INF1") this.parseInf1(offset);
      else if (type === "DAT1") {
        this.dat1Offset = offset + 8;
        this.dat1Size = size - 8;
      } else if (type === "MID1") this.parseMid1(offset);

      offset += size;
    }

    if (this.dat1Offset > 0) this.decodeStrings();
  }

  private parseInf1(blockOffset: number): void {
    const numEntries = this.view.getUint16(blockOffset + 8, true);
    const entrySize = this.view.getUint16(blockOffset + 10, true);
    this.infEntrySize = entrySize;

    const entriesStart = blockOffset + 16;
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = entriesStart + i * entrySize;
      const dat1Offset = this.view.getUint32(entryOffset, true);
      const extra: number[] = [];
      for (let b = 4; b < entrySize; b++) extra.push(this.data[entryOffset + b]);
      this.infEntries.push({ dat1Offset, extra });
    }
  }

  private parseMid1(blockOffset: number): void {
    const numEntries = this.view.getUint16(blockOffset + 8, true);
    const format = this.view.getUint8(blockOffset + 11);
    this.midFormat = format;

    const entriesStart = blockOffset + 16;
    for (let i = 0; i < numEntries; i++) {
      const raw = this.view.getUint32(entriesStart + i * 4, true);
      const id = format === 0 ? raw : raw;
      this.midEntries.push({ id, raw });
    }
  }

  private decodeStrings(): void {
    const labels: Record<number, string> = { 1: "windows-1252", 2: "utf-16le", 3: "shift_jis", 4: "utf-8" };
    const label = labels[this.charset] ?? "utf-8";
    const decoder = new TextDecoder(label);
    const isWide = this.charset === 2;
    const unitSize = isWide ? 2 : 1;

    for (const entry of this.infEntries) {
      const start = this.dat1Offset + entry.dat1Offset;
      const bytes: number[] = [];
      let pos = start;

      while (pos < this.dat1Offset + this.dat1Size) {
        const unit = isWide ? this.view.getUint16(pos, true) : this.data[pos];
        if (unit === 0) break;

        if (unit === 0x1a) {
          const tagLen = isWide ? this.view.getUint16(pos, true) & 0xff : this.data[pos];
          const tagGroup = this.data[pos + (isWide ? 2 : 1)];
          const tagId = this.view.getUint16(pos + (isWide ? 2 : 1) + 1, true);
          bytes.push(..."[tag ".split("").map((c) => c.charCodeAt(0)));
          const label2 = `group=0x${tagGroup.toString(16)} id=0x${tagId.toString(16)}]`;
          for (const c of label2) bytes.push(c.charCodeAt(0));
          pos += Math.max(tagLen, 1) * unitSize;
          continue;
        }

        if (isWide) {
          bytes.push(unit & 0xff, unit >> 8);
        } else {
          bytes.push(unit);
        }
        pos += unitSize;
      }

      this.strings.push(decoder.decode(new Uint8Array(bytes)));
    }
  }

  getBlocks(): BMGBlock[] {
    return this.blocks;
  }

  getStrings(): string[] {
    return this.strings;
  }

  getMidEntries(): BMGMidEntry[] {
    return this.midEntries;
  }

  getInfo(): string {
    const lines: string[] = [];
    lines.push(`Charset: ${this.charset}`);
    lines.push(`Blocks: ${this.blocks.map((b) => `${b.type}(${b.size})`).join(", ")}`);
    lines.push(`Messages: ${this.infEntries.length} (entry size ${this.infEntrySize})`);

    if (this.midEntries.length > 0) {
      const fmtNote = this.midFormat === 0 ? "" : " (format>0, id reconstruction unverified)";
      lines.push(`MID1 entries: ${this.midEntries.length}, format ${this.midFormat}${fmtNote}`);
    }

    lines.push("");
    this.strings.forEach((s, i) => {
      const id = this.midEntries[i] ? ` id=0x${this.midEntries[i].id.toString(16)}` : "";
      const extra = this.infEntries[i]?.extra.length ? ` extra=[${this.infEntries[i].extra.map((b) => b.toString(16).padStart(2, "0")).join(" ")}]` : "";
      lines.push(`[${i}]${id}${extra}: ${s}`);
    });

    return lines.join("\n");
  }
}
