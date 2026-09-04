// kcl.ts: KCL (Nintendo Collision) Parser
// Parses MKDS/MKWii-style course collision data: position/normal vector arrays
// plus a prism (triangle) array referencing them by index, with per-triangle
// collision flags. Octree section is skipped (not needed for inspection).
// Format: Custom Mario Kart Wiiki "KCL" article / community KCL tooling.

interface KCLVec3 {
  x: number;
  y: number;
  z: number;
}

interface KCLPrism {
  height: number;
  positionIndex: number;
  faceNormalIndex: number;
  edgeNormalAIndex: number;
  edgeNormalBIndex: number;
  edgeNormalCIndex: number;
  collisionFlag: number;
}

export class KCL {
  private view: DataView;
  private positions: KCLVec3[] = [];
  private normals: KCLVec3[] = [];
  private prisms: KCLPrism[] = [];
  private thickness = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.parse();
  }

  // MKDS stores positions/normals as Nintendo fixed-point (12 fractional bits, i.e. value / 4096).
  private readFx32(offset: number): number {
    return this.view.getInt32(offset, true) / 4096;
  }

  private readFx16(offset: number): number {
    return this.view.getInt16(offset, true) / 4096;
  }

  private readVec3Fx32(offset: number): KCLVec3 {
    return {
      x: this.readFx32(offset),
      y: this.readFx32(offset + 4),
      z: this.readFx32(offset + 8),
    };
  }

  private readVec3Fx16(offset: number): KCLVec3 {
    return {
      x: this.readFx16(offset),
      y: this.readFx16(offset + 2),
      z: this.readFx16(offset + 4),
    };
  }

  private parse(): void {
    const positionOffset = this.view.getUint32(0x00, true);
    const normalOffset = this.view.getUint32(0x04, true);
    const prismOffset = this.view.getUint32(0x08, true) + 0x10;
    const octreeOffset = this.view.getUint32(0x0c, true);
    this.thickness = this.readFx32(0x10);

    const positionCount = (normalOffset - positionOffset) / 12;
    for (let i = 0; i < positionCount; i++) {
      this.positions.push(this.readVec3Fx32(positionOffset + i * 12));
    }

    const normalCount = (prismOffset - normalOffset) / 6;
    for (let i = 0; i < normalCount; i++) {
      this.normals.push(this.readVec3Fx16(normalOffset + i * 6));
    }

    const prismCount = (octreeOffset - prismOffset) / 0x10;
    for (let i = 0; i < prismCount; i++) {
      const base = prismOffset + i * 0x10;
      this.prisms.push({
        height: this.readFx32(base),
        positionIndex: this.view.getUint16(base + 4, true),
        faceNormalIndex: this.view.getUint16(base + 6, true),
        edgeNormalAIndex: this.view.getUint16(base + 8, true),
        edgeNormalBIndex: this.view.getUint16(base + 10, true),
        edgeNormalCIndex: this.view.getUint16(base + 12, true),
        collisionFlag: this.view.getUint16(base + 14, true),
      });
    }
  }

  getPrisms(): KCLPrism[] {
    return this.prisms;
  }

  getInfo(): string {
    const flagCounts = new Map<number, number>();
    for (const prism of this.prisms) {
      flagCounts.set(prism.collisionFlag, (flagCounts.get(prism.collisionFlag) ?? 0) + 1);
    }

    const sortedFlags = [...flagCounts.entries()].sort((a, b) => a[0] - b[0]);
    const flagLines = sortedFlags.map(([flag, count]) => {
      const type = flag & 0x1f;
      const variant = flag >> 5;
      return `  0x${flag.toString(16).padStart(4, "0")} (type ${type}, variant ${variant}): ${count}`;
    });

    return [`Positions: ${this.positions.length}`, `Normals: ${this.normals.length}`, `Triangles: ${this.prisms.length}`, `Thickness: ${this.thickness}`, `Collision flags:`, ...flagLines].join("\n");
  }
}
