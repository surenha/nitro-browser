// Directory class: Represents NDS ROM file system structure parsed from FNT/FAT tables

interface FATEntry {
  start: number;
  end: number;
}

interface FileNode {
  name: string;
  size: number;
  fileId: number;
}

interface DirNode {
  name: string;
  files: FileNode[];
  subdirs: DirNode[];
}

export class Directory {
  private data: ArrayBuffer;
  private view: DataView;
  private fntOffset: number;
  private fntSize: number;
  private fatOffset: number;
  private fatSize: number;
  private fatEntries: FATEntry[] = [];

  constructor(romData: ArrayBuffer) {
    this.data = romData;
    this.view = new DataView(romData);

    this.fntOffset = this.view.getUint32(0x40, true);
    this.fntSize = this.view.getUint32(0x44, true);
    this.fatOffset = this.view.getUint32(0x48, true);
    this.fatSize = this.view.getUint32(0x4c, true);

    this.parseFAT();
  }

  private parseFAT(): void {
    for (let i = 0; i < this.fatSize; i += 8) {
      const start = this.view.getUint32(this.fatOffset + i, true);
      const end = this.view.getUint32(this.fatOffset + i + 4, true);
      this.fatEntries.push({ start, end });
    }
  }

  private readString(offset: number, length: number): string {
    const bytes = new Uint8Array(this.data, offset, length);
    return new TextDecoder().decode(bytes);
  }

  private parseSubtable(offset: number, firstFileId: number): { files: FileNode[]; subdirs: { name: string; dirId: number }[] } {
    const files: FileNode[] = [];
    const subdirs: { name: string; dirId: number }[] = [];
    let currentOffset = offset;
    let currentFileId = firstFileId;

    while (true) {
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
        const fat = this.fatEntries[currentFileId];
        const size = fat ? fat.end - fat.start : 0;
        files.push({ name, size, fileId: currentFileId });
        currentFileId++;
        currentOffset += 1 + nameLength;
      }
    }

    return { files, subdirs };
  }

  private parseDirectory(dirId: number): DirNode {
    const mainTableEntry = this.fntOffset + (dirId & 0xfff) * 8;
    const subtableOffset = this.view.getUint32(mainTableEntry, true) + this.fntOffset;
    const firstFileId = this.view.getUint16(mainTableEntry + 4, true);

    const { files, subdirs } = this.parseSubtable(subtableOffset, firstFileId);

    const dirNode: DirNode = {
      name: dirId === 0xf000 ? "root" : "",
      files,
      subdirs: [],
    };

    for (const subdir of subdirs) {
      const child = this.parseDirectory(subdir.dirId);
      child.name = subdir.name;
      dirNode.subdirs.push(child);
    }

    return dirNode;
  }

  public extractFile(fileName: string): Uint8Array | null {
    const findFile = (node: DirNode): FileNode | null => {
      for (const file of node.files) {
        if (file.name === fileName) return file;
      }
      for (const subdir of node.subdirs) {
        const found = findFile(subdir);
        if (found) return found;
      }
      return null;
    };

    const fileNode = findFile(this.getStructure());
    if (!fileNode) return null;

    const fat = this.fatEntries[fileNode.fileId];
    if (!fat) return null;

    return new Uint8Array(this.data, fat.start, fat.end - fat.start);
  }

  public getStructure(): DirNode {
    return this.parseDirectory(0xf000);
  }

  public print(): string {
    const root = this.getStructure();
    let output = "";

    const printNode = (node: DirNode, indent: string, isLast: boolean): void => {
      const prefix = isLast ? "└── " : "├── ";
      output += indent + prefix + node.name + "/\n";

      const newIndent = indent + (isLast ? "    " : "│   ");

      [...node.subdirs, ...node.files].forEach((item, i, arr) => {
        const last = i === arr.length - 1;
        if ("subdirs" in item) {
          printNode(item, newIndent, last);
        } else {
          const filePrefix = last ? "└── " : "├── ";
          output += newIndent + filePrefix + item.name + ` (${item.size} bytes)\n`;
        }
      });
    };

    printNode(root, "", true);
    return output;
  }
}
