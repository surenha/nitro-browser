// CARC/NARC parser: Extracts files from Nintendo DS archive containers with directory structure

interface CARCFile {
  name: string;
  data: Uint8Array;
  fileId: number;
}

interface CARCNode {
  name: string;
  files: CARCFile[];
  subdirs: CARCNode[];
}

export class CARC {
  private view: DataView;
  private data: Uint8Array;
  private fatEntries: { offset: number; size: number }[] = [];
  private fimgOffset: number = 0;
  private fntbOffset: number = 0;
  private fntbSize: number = 0;

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
    if (magic !== "NARC" && magic !== "CRAN") {
      throw new Error(`Invalid NARC file: expected NARC or CRAN, got ${magic}`);
    }

    let offset = 16;

    while (offset < this.data.length) {
      const sectionMagic = this.readString(offset, 4);
      const sectionSize = this.view.getUint32(offset + 4, true);

      if (sectionMagic === "BTAF" || sectionMagic === "FATB") {
        this.parseFATB(offset);
      } else if (sectionMagic === "BTNF" || sectionMagic === "FNTB") {
        this.fntbOffset = offset;
        this.fntbSize = sectionSize;
      } else if (sectionMagic === "GMIF" || sectionMagic === "FIMG") {
        this.fimgOffset = offset + 8;
      }

      offset += sectionSize;
    }
  }

  private parseFATB(offset: number): void {
    const fileCount = this.view.getUint16(offset + 8, true);
    let fatOffset = offset + 12;

    for (let i = 0; i < fileCount; i++) {
      const start = this.view.getUint32(fatOffset, true);
      const end = this.view.getUint32(fatOffset + 4, true);

      this.fatEntries.push({
        offset: start,
        size: end - start,
      });

      fatOffset += 8;
    }
  }

  private parseSubtable(offset: number, firstFileId: number): { files: { id: number; name: string }[]; subdirs: { name: string; dirId: number }[] } {
    const files: { id: number; name: string }[] = [];
    const subdirs: { name: string; dirId: number }[] = [];
    let currentOffset = offset;
    let currentFileId = firstFileId;

    while (currentOffset < this.fntbOffset + this.fntbSize) {
      const typeLength = this.view.getUint8(currentOffset);
      if (typeLength === 0) break;

      const isDir = (typeLength & 0x80) !== 0;
      const nameLength = typeLength & 0x7f;
      const name = this.readString(currentOffset + 1, nameLength);

      if (isDir) {
        const dirId = this.view.getUint16(currentOffset + 1 + nameLength, true);
        subdirs.push({ name, dirId });
        currentOffset += 1 + nameLength + 2;
      } else {
        files.push({ id: currentFileId, name });
        currentFileId++;
        currentOffset += 1 + nameLength;
      }
    }

    return { files, subdirs };
  }

  private parseDirectory(dirId: number): CARCNode {
    const mainTableEntry = this.fntbOffset + 8 + (dirId & 0xfff) * 8;
    const subtableOffset = this.view.getUint32(mainTableEntry, true) + this.fntbOffset + 8;
    const firstFileId = this.view.getUint16(mainTableEntry + 4, true);

    const { files: fileEntries, subdirs } = this.parseSubtable(subtableOffset, firstFileId);

    const dirNode: CARCNode = {
      name: dirId === 0xf000 ? "root" : "",
      files: fileEntries.map((entry) => {
        const fat = this.fatEntries[entry.id];
        const start = this.fimgOffset + fat.offset;
        return {
          name: entry.name,
          data: this.data.slice(start, start + fat.size),
          fileId: entry.id,
        };
      }),
      subdirs: [],
    };

    for (const subdir of subdirs) {
      const child = this.parseDirectory(subdir.dirId);
      child.name = subdir.name;
      dirNode.subdirs.push(child);
    }

    return dirNode;
  }

  public getStructure(): CARCNode {
    if (this.fntbSize === 0) {
      return {
        name: "root",
        files: this.fatEntries.map((fat, id) => {
          const start = this.fimgOffset + fat.offset;
          return {
            name: `file_${id}`,
            data: this.data.slice(start, start + fat.size),
            fileId: id,
          };
        }),
        subdirs: [],
      };
    }

    return this.parseDirectory(0xf000);
  }

  public extractFile(fileName: string): Uint8Array | null {
    const root = this.getStructure();

    const search = (node: CARCNode): Uint8Array | null => {
      for (const file of node.files) {
        if (file.name === fileName) return file.data;
      }
      for (const subdir of node.subdirs) {
        const found = search(subdir);
        if (found) return found;
      }
      return null;
    };

    return search(root);
  }

  public list(): string {
    const root = this.getStructure();
    let output = "";

    const printNode = (node: CARCNode, indent: string, isLast: boolean): void => {
      if (node.name !== "root") {
        const prefix = isLast ? "└── " : "├── ";
        output += indent + prefix + node.name + "/\n";
        indent += isLast ? "    " : "│   ";
      }

      [...node.subdirs, ...node.files].forEach((item, i, arr) => {
        const last = i === arr.length - 1;
        if ("subdirs" in item) {
          printNode(item, indent, last);
        } else {
          const filePrefix = last ? "└── " : "├── ";
          output += indent + filePrefix + item.name + ` (${item.data.length} bytes)\n`;
        }
      });
    };

    printNode(root, "", true);
    return output;
  }
}
