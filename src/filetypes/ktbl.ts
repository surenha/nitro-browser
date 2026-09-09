// ktbl.ts: NKKT (Kart Appearance Table) Parser
// Magic "NKKT" + u8 rows + u8 cols + rows*cols raw grid bytes (values 0-4,
// likely a per-character/kart-part appearance weight). Confirmed exactly
// against kart_appear.ktbl: rows=0x25=37, cols=0x0d=13, 37*13=481 data bytes,
// 4+1+1+481=487 total, matching the file size precisely.

export class NKKT {
  private view: DataView;
  private data: Uint8Array;
  private rows: number;
  private cols: number;
  private grid: number[][] = [];

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);

    const magic = String.fromCharCode(this.data[0], this.data[1], this.data[2], this.data[3]);
    if (magic !== "NKKT") {
      throw new Error(`Invalid NKKT file: expected 'NKKT', got '${magic}'`);
    }

    this.rows = this.view.getUint8(4);
    this.cols = this.view.getUint8(5);
    this.parse();
  }

  private parse(): void {
    let offset = 6;
    for (let r = 0; r < this.rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this.data[offset++]);
      }
      this.grid.push(row);
    }
  }

  getGrid(): number[][] {
    return this.grid;
  }

  getInfo(): string {
    const lines: string[] = [`Rows: ${this.rows}`, `Cols: ${this.cols}`];
    this.grid.forEach((row, i) => {
      lines.push(`Row ${i}: [${row.join(" ")}]`);
    });
    return lines.join("\n");
  }
}
