// mtbl.ts: NKMT (Mission Table) Parser
// Magic "NKMT" + u16 rows + u16 cols + rows*cols raw grid bytes. Confirmed
// exactly against missionTable.mtbl: rows=7, cols=9, 7*9=63 data bytes,
// 4+2+2+63=71 total, matching the file size precisely.

export class NKMT {
  private view: DataView;
  private data: Uint8Array;
  private rows: number;
  private cols: number;
  private grid: number[][] = [];

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);

    const magic = String.fromCharCode(this.data[0], this.data[1], this.data[2], this.data[3]);
    if (magic !== "NKMT") {
      throw new Error(`Invalid NKMT file: expected 'NKMT', got '${magic}'`);
    }

    this.rows = this.view.getUint16(4, true);
    this.cols = this.view.getUint16(6, true);
    this.parse();
  }

  private parse(): void {
    let offset = 8;
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
      lines.push(`Row ${i}: [${row.map((v) => v.toString(16).padStart(2, "0")).join(" ")}]`);
    });
    return lines.join("\n");
  }
}
