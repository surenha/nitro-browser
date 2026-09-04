// nsbmd.ts: NSBMD (Binary Model) & NSBTX (Binary Texture) Parser

export interface G3DHeader {
  magic: string; // "BMD0" or "BTX0"
  fileSize: number;
  numBlocks: number;
}

export interface G3DDictionaryEntry {
  name: string;
  dataOffset: number;
  extraParam1: number;
  extraParam2: number;
}

// --- MDL0 Structures ---
export interface SBCOpcode {
  opcode: number;
  mnemonic: string;
  operands: number[];
}

export interface MDL0Material {
  name: string;
  diffuseAmbient: number;
  specularEmissive: number;
  polyAttr: number;
  texImageParam: number;
  texPlttBase: number;
  origWidth: number;
  origHeight: number;
}

export interface MDL0Shape {
  name: string;
  flags: number;
  displayListOffset: number;
  displayListSize: number;
}

export interface MDL0Model {
  name: string;
  numNodes: number;
  numMaterials: number;
  numShapes: number;
  verticesCount: number;
  polygonsCount: number;
  sbcCommands: SBCOpcode[];
  materials: MDL0Material[];
  shapes: MDL0Shape[];
}

// --- TEX0 Structures ---
export interface TEX0Texture {
  name: string;
  texImageParam: number;
  srcWidth: number;
  srcHeight: number;
  realWidth: number;
  realHeight: number;
  format: number;
  data: Uint8Array;
}

export interface TEX0Palette {
  name: string;
  offset: number;
  isPalette4: boolean;
  data: Uint16Array;
}

export class NSBMD {
  private view: DataView;
  private data: Uint8Array;

  public header!: G3DHeader;
  public models: MDL0Model[] = [];
  public textures: TEX0Texture[] = [];
  public palettes: TEX0Palette[] = [];

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);
    this.parseFile();
  }

  private readString(offset: number, length: number): string {
    let str = "";
    for (let i = 0; i < length; i++) {
      const charCode = this.data[offset + i];
      if (charCode === 0) break;
      str += String.fromCharCode(charCode);
    }
    return str.trim();
  }

  private parseFile(): void {
    const magic = this.readString(0, 4);
    if (magic !== "BMD0" && magic !== "BTX0") {
      throw new Error(`Invalid G3D file: expected BMD0 or BTX0, got ${magic}`);
    }

    const fileSize = this.view.getUint32(0x08, true);
    const headerSize = this.view.getUint16(0x0c, true);
    const numBlocks = this.view.getUint16(0x0e, true);

    this.header = { magic, fileSize, numBlocks };

    for (let i = 0; i < numBlocks; i++) {
      const blockOffsetPointer = headerSize + i * 4;
      if (blockOffsetPointer + 4 > this.view.byteLength) break;

      const blockAbsoluteOffset = this.view.getUint32(blockOffsetPointer, true);
      if (blockAbsoluteOffset >= this.view.byteLength) continue;

      const blockSig = this.readString(blockAbsoluteOffset, 4);

      if (blockSig === "MDL0") {
        this.parseMDL0(blockAbsoluteOffset);
      } else if (blockSig === "TEX0") {
        this.parseTEX0(blockAbsoluteOffset);
      }
    }
  }

  /**
   * Safe linear dictionary table parser adjusted for explicit G3D specification offset matching
   */
  private parseDictionary(dictOffset: number): G3DDictionaryEntry[] {
    if (dictOffset + 8 > this.view.byteLength) return [];

    const numEntries = this.view.getUint8(dictOffset + 1);
    const offsetEntriesHeader = this.view.getUint16(dictOffset + 6, true);

    const entriesStartPos = dictOffset + offsetEntriesHeader;
    if (entriesStartPos + 4 > this.view.byteLength) return [];

    const unitSize = this.view.getUint16(entriesStartPos, true);
    const nameTableOffsetRelative = this.view.getUint16(entriesStartPos + 2, true);

    const namesBaseOffset = entriesStartPos + nameTableOffsetRelative;
    const itemsPayloadOffset = entriesStartPos + 4;

    const result: G3DDictionaryEntry[] = [];

    for (let i = 0; i < numEntries; i++) {
      const currentItemOffset = itemsPayloadOffset + i * unitSize;
      const currentNameOffset = namesBaseOffset + i * 16;

      if (currentNameOffset + 16 > this.view.byteLength) break;

      const name = this.readString(currentNameOffset, 16);

      // CRITICAL STRUC FIX: Get relative content references out from the correct byte alignment
      const targetDataOffset = this.view.getUint16(currentItemOffset, true);

      let extraParam1 = 0;
      let extraParam2 = 0;

      // Extract trailing operational fields using explicit limits
      if (unitSize >= 6 && currentItemOffset + 6 <= this.view.byteLength) {
        extraParam1 = this.view.getUint32(currentItemOffset + 2, true);
      }
      if (unitSize >= 8 && currentItemOffset + 8 <= this.view.byteLength) {
        extraParam2 = this.view.getUint16(currentItemOffset + 6, true);
      }

      result.push({ name, dataOffset: targetDataOffset, extraParam1, extraParam2 });
    }

    return result;
  }

  private parseMDL0(blockOffset: number): void {
    const modelSetDictOffset = blockOffset + 8;
    const modelEntries = this.parseDictionary(modelSetDictOffset);

    for (const entry of modelEntries) {
      // DYNAMIC CALC FIX: Relative structures inside dictionaries point out from the block offset start, not the structure data start
      const modelStructOffset = blockOffset + entry.dataOffset;
      if (modelStructOffset + 0x40 > this.view.byteLength) continue;

      const sbcOffsetRel = this.view.getUint32(modelStructOffset + 0x04, true);
      const matOffsetRel = this.view.getUint32(modelStructOffset + 0x08, true);
      const shpOffsetRel = this.view.getUint32(modelStructOffset + 0x0c, true);

      const numNodes = this.view.getUint8(modelStructOffset + 0x17);
      const numMaterials = this.view.getUint8(modelStructOffset + 0x18);
      const numShapes = this.view.getUint8(modelStructOffset + 0x19);

      const verticesCount = this.view.getUint16(modelStructOffset + 0x24, true);
      const polygonsCount = this.view.getUint16(modelStructOffset + 0x26, true);

      const sbcAbsoluteOffset = modelStructOffset + sbcOffsetRel;
      const sbcCommands = this.parseSBC(sbcAbsoluteOffset);

      const matAbsoluteOffset = modelStructOffset + matOffsetRel;
      const materials = this.parseMaterials(matAbsoluteOffset);

      const shpAbsoluteOffset = modelStructOffset + shpOffsetRel;
      const shapes = this.parseShapes(shpAbsoluteOffset);

      this.models.push({
        name: entry.name,
        numNodes,
        numMaterials,
        numShapes,
        verticesCount,
        polygonsCount,
        sbcCommands,
        materials,
        shapes,
      });
    }
  }

  private parseSBC(offset: number): SBCOpcode[] {
    const commands: SBCOpcode[] = [];
    let ptr = offset;

    const mnemonics: { [key: number]: string } = {
      0x00: "NOP",
      0x01: "RET",
      0x02: "NODE",
      0x03: "MTX",
      0x04: "MAT",
      0x05: "SHP",
      0x06: "NODEDESC",
      0x07: "BB",
      0x08: "BBY",
      0x09: "NODEMIX",
      0x0a: "CALL",
      0x0b: "POSSCALE",
      0x0c: "ENVMAP",
      0x0d: "PRJMAP",
    };

    while (ptr < this.view.byteLength) {
      const opcodeByte = this.view.getUint8(ptr++);
      const cmdNum = opcodeByte & 0x1f;
      const flags = (opcodeByte >> 5) & 0x07;
      const mnemonic = mnemonics[cmdNum] || `UNKNOWN_0x${cmdNum.toString(16)}`;

      const operands: number[] = [];

      if (cmdNum === 0x01) {
        // RET
        commands.push({ opcode: opcodeByte, mnemonic, operands });
        break;
      }

      // Dynamic operand sizing based on explicit opcode flags
      if (cmdNum === 0x02) {
        // NODE: 1-byte node index + 1-byte visibility flag
        operands.push(this.view.getUint8(ptr++));
        operands.push(this.view.getUint8(ptr++));
      } else if (cmdNum === 0x03 || cmdNum === 0x04 || cmdNum === 0x05) {
        // MTX, MAT, SHP: 1-byte resource index
        operands.push(this.view.getUint8(ptr++));
      } else if (cmdNum === 0x06) {
        // NODEDESC: Dynamic operand counts based on matrix setup flags
        operands.push(this.view.getUint8(ptr++)); // Source node index
        operands.push(this.view.getUint8(ptr++)); // Target node index
        if ((flags & 0x01) !== 0) {
          operands.push(this.view.getUint8(ptr++)); // Additional matrix index allocation byte
        }
      } else if (cmdNum === 0x09) {
        // NODEMIX: Variable array size
        const numBlendNodes = this.view.getUint8(ptr++);
        operands.push(numBlendNodes);
        for (let b = 0; b < numBlendNodes; b++) {
          operands.push(this.view.getUint8(ptr++)); // Matrix source mapping
          operands.push(this.view.getUint8(ptr++)); // Stack pointer binding
          operands.push(this.view.getUint8(ptr++)); // Weight bias scalar
        }
      }

      commands.push({ opcode: opcodeByte, mnemonic, operands });
    }

    return commands;
  }

  private parseMaterials(offset: number): MDL0Material[] {
    const dictOffset = offset + 4;
    const matEntries = this.parseDictionary(dictOffset);
    const result: MDL0Material[] = [];

    for (const entry of matEntries) {
      const matDataBlockOffset = dictOffset + entry.dataOffset;
      if (matDataBlockOffset + 0x28 > this.view.byteLength) continue;

      const diffuseAmbient = this.view.getUint32(matDataBlockOffset + 0x04, true);
      const specularEmissive = this.view.getUint32(matDataBlockOffset + 0x08, true);
      const polyAttr = this.view.getUint32(matDataBlockOffset + 0x0c, true);
      const texImageParam = this.view.getUint32(matDataBlockOffset + 0x14, true);
      const texPlttBase = this.view.getUint16(matDataBlockOffset + 0x1c, true);

      const origWidth = this.view.getUint16(matDataBlockOffset + 0x20, true);
      const origHeight = this.view.getUint16(matDataBlockOffset + 0x22, true);

      result.push({
        name: entry.name,
        diffuseAmbient,
        specularEmissive,
        polyAttr,
        texImageParam,
        texPlttBase,
        origWidth,
        origHeight,
      });
    }
    return result;
  }

  private parseShapes(offset: number): MDL0Shape[] {
    const dictOffset = offset;
    const shpEntries = this.parseDictionary(dictOffset);
    const result: MDL0Shape[] = [];

    for (const entry of shpEntries) {
      const shpDataBlockOffset = dictOffset + entry.dataOffset;
      if (shpDataBlockOffset + 0x10 > this.view.byteLength) continue;

      const flags = this.view.getUint32(shpDataBlockOffset + 0x04, true);
      const displayListOffset = this.view.getUint32(shpDataBlockOffset + 0x08, true);
      const displayListSize = this.view.getUint32(shpDataBlockOffset + 0x0c, true);

      result.push({
        name: entry.name,
        flags,
        displayListOffset: shpDataBlockOffset + displayListOffset,
        displayListSize,
      });
    }
    return result;
  }

  private parseTEX0(blockOffset: number): void {
    const texDictOffsetRel = this.view.getUint16(blockOffset + 0x06, true);
    const texDataOffsetAbsolute = blockOffset + this.view.getUint32(blockOffset + 0x0c, true);

    const plttDictOffsetRel = this.view.getUint16(blockOffset + 0x2c, true);
    const plttDataOffsetAbsolute = blockOffset + this.view.getUint32(blockOffset + 0x30, true);

    if (texDictOffsetRel !== 0) {
      const texDictAbsolutePos = blockOffset + texDictOffsetRel;
      const texEntries = this.parseDictionary(texDictAbsolutePos);

      for (const entry of texEntries) {
        const texImageParam = entry.extraParam1;
        const extraParamValue = entry.extraParam2;

        const srcWidth = extraParamValue & 0x07ff;
        const srcHeight = (extraParamValue >> 11) & 0x07ff;

        const realWidth = 8 << ((texImageParam >> 20) & 0x07);
        const realHeight = 8 << ((texImageParam >> 23) & 0x07);
        const format = (texImageParam >> 26) & 0x07;

        const sampleOffsetRelative = entry.dataOffset << 3;
        const textureSizeCalculation = (realWidth * realHeight * (format === 5 ? 2 : 4)) / 8;

        const dataStart = texDataOffsetAbsolute + sampleOffsetRelative;
        const textureBytesPayload = this.data.slice(dataStart, dataStart + textureSizeCalculation);

        this.textures.push({
          name: entry.name,
          texImageParam,
          srcWidth,
          srcHeight,
          realWidth,
          realHeight,
          format,
          data: textureBytesPayload,
        });
      }
    }

    if (plttDictOffsetRel !== 0) {
      const plttDictAbsolutePos = blockOffset + plttDictOffsetRel;
      const plttEntries = this.parseDictionary(plttDictAbsolutePos);

      for (const entry of plttEntries) {
        const offsetShifted = entry.dataOffset << 3;
        const isPalette4 = (entry.extraParam1 & 0x0001) !== 0;

        const dataStart = plttDataOffsetAbsolute + offsetShifted;
        const rawPaletteBytes = this.data.slice(dataStart, dataStart + 512);

        const paletteWordsArray = new Uint16Array(rawPaletteBytes.length / 2);
        const pView = new DataView(rawPaletteBytes.buffer, rawPaletteBytes.byteOffset, rawPaletteBytes.byteLength);
        for (let k = 0; k < paletteWordsArray.length; k++) {
          paletteWordsArray[k] = pView.getUint16(k * 2, true);
        }

        this.palettes.push({
          name: entry.name,
          offset: offsetShifted,
          isPalette4,
          data: paletteWordsArray,
        });
      }
    }
  }
}
