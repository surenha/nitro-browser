import { BufferReader } from "./BufferReader";
import { CartridgeHeader } from "./CartridgeHeader";
import { NitroFAT } from "./NitroFAT";
import { NitroFNT } from "./NitroFNT";

export class NitroFS {
  static fromRom(rom: ArrayBuffer) {
    const nitroFS = new NitroFS();
    const reader = BufferReader.new(rom, true);

    const headerBuffer = reader.slice(0, 0x200);
    nitroFS.cartridgeHeader = new CartridgeHeader(headerBuffer);

    const fntBuffer = reader.slice(
      nitroFS.cartridgeHeader.fntOffset,
      nitroFS.cartridgeHeader.fntOffset + nitroFS.cartridgeHeader.fntLength
    );
    nitroFS.fnt = new NitroFNT(fntBuffer);

    const fatBuffer = reader.slice(
      nitroFS.cartridgeHeader.fatOffset,
      nitroFS.cartridgeHeader.fatOffset + nitroFS.cartridgeHeader.fatLength
    );
    const fat = new NitroFAT(fatBuffer);

    nitroFS.fileData = [];
    for (let i = 0; i < fat.entries.length; i++) {
      const entry = fat.entries[i];
      nitroFS.fileData[i] = reader
        .slice(entry.startAddress, entry.endAddress)
        .getBuffer();
    }

    return nitroFS;
  }

  cartridgeHeader!: CartridgeHeader;
  private fnt!: NitroFNT;
  private fileData!: ArrayBuffer[];

  readFile(path: string) {
    const directoryParts = path.split("/").filter((part) => part !== "");
    const fileName = directoryParts.pop()!;

    let currentDir = this.fnt.tree;
    for (const dirName of directoryParts) {
      const foundDir = currentDir.directories.find(
        (dir) => dir.name === dirName
      );
      if (!foundDir) {
        throw new Error(`Directory not found: ${dirName}`);
      }
      currentDir = foundDir;
    }

    const file = currentDir.files.find((file) => file.name === fileName);
    if (!file) {
      throw new Error(`File not found: ${fileName}`);
    }

    return this.fileData[file.id];
  }

  readDir(path: string) {
    let directoryParts = path.split("/").filter((part) => part !== "");

    let currentDir = this.fnt.tree;
    for (const dirName of directoryParts) {
      const foundDir = currentDir.directories.find(
        (dir) => dir.name === dirName
      );
      if (!foundDir) {
        throw new Error(`Directory not found: ${dirName}`);
      }
      currentDir = foundDir;
    }

    const files = currentDir.files.map((file) => file.name);
    const directories = currentDir.directories.map((dir) => dir.name);

    return { files, directories };
  }

  exists(path: string) {
    try {
      this.readFile(path);
      return true;
    } catch (e) {
      return false;
    }
  }

  getDirectoryTree() {
    return this.fnt.tree;
  }
}
