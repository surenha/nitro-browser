import { Directory } from "./utils/directory.js";
import { CARC } from "./filetypes/carc.js";
import { NCLR } from "./filetypes/nclr.js";
import { NCGR } from "./filetypes/ncgr.js";
import { NSCR } from "./filetypes/nscr.js";
import { NSBMD } from "./filetypes/nsbmd.js"; // Integrated 3D model/texture component
import { NCER } from "./filetypes/ncer.js";
import { NANR } from "./filetypes/nanr.js";
import { SDAT } from "./filetypes/sdat.js";
import { NFTR } from "./filetypes/nftr.js";
import { KCL } from "./filetypes/kcl.js";
import { NSBTP } from "./filetypes/nsbtp.js";

const input = document.getElementById("romFile") as HTMLInputElement;
const btn = document.getElementById("uploadBtn")!;
const fileName = document.getElementById("fileName")!;

let currentBuffer: ArrayBuffer | null = null;
let currentDirectory: Directory | null = null;

// Persistent cache representing the active 2D workspace scene state
let activePalette: NCLR | null = null;

// ADDED: Track the currently active opened archive file to parse nested records
let activeArchive: { name: string; instance: CARC | SDAT } | null = null;

// Tracks the running interval for NANR playback so it can be cleared on view change
let activeAnimationInterval: number | null = null;

btn.addEventListener("click", () => input.click());

input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) return;

  fileName.textContent = file.name;

  currentBuffer = await file.arrayBuffer();
  currentDirectory = new Directory(currentBuffer);
  activeArchive = null; // Clear archive state on new ROM load

  renderLayout();
});

function renderLayout() {
  if (!currentDirectory) return;

  document.querySelectorAll(".tree-container").forEach((el) => el.remove());

  const container = document.createElement("div");
  container.className = "tree-container";
  container.style.cssText = "display: flex; gap: 20px; margin-top: 20px;";

  const leftPanel = document.createElement("div");
  leftPanel.style.cssText = "flex: 1; min-width: 0;";

  const leftTree = document.createElement("pre");
  leftTree.style.cssText = "padding: 15px; background: #f5f5f5; border-radius: 4px; overflow-x: auto; cursor: pointer;";
  leftTree.innerHTML = formatTreeWithLinks(currentDirectory.print());
  leftPanel.appendChild(leftTree);

  const rightPanel = document.createElement("div");
  rightPanel.id = "rightPanel";
  rightPanel.style.cssText = "flex: 1; min-width: 0; position: sticky; top: 20px; align-self: flex-start; max-height: calc(100vh - 40px); overflow-y: auto;";

  container.appendChild(leftPanel);
  container.appendChild(rightPanel);
  document.body.appendChild(container);

  leftTree.addEventListener("click", handleFileClick);

  // ADDED: Listens for clicks on dynamic hyperlink bindings generated in the CARC target panel
  rightPanel.addEventListener("click", handleFileClick);
}

function formatTreeWithLinks(treeText: string): string {
  return treeText
    .split("\n")
    .map((line) => {
      if (line.includes(".carc")) {
        const name = line.match(/[^\s]+\.carc/)?.[0];
        if (name) return line.replace(name, `<span class="file-link carc-link" style="color: #0066cc; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
      }
      if (line.includes(".NCLR")) {
        const name = line.match(/[^\s]+\.NCLR/)?.[0];
        if (name) return line.replace(name, `<span class="file-link nclr-link" style="color: #0066cc; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
      }
      if (line.match(/\.(NCGR|NCBR)/i)) {
        const name = line.match(/[^\s]+\.(?:NCGR|NCBR)/i)?.[0];
        if (name) return line.replace(name, `<span class="file-link ncgr-link" style="color: #e65c00; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
      }
      if (line.includes(".NSCR")) {
        const name = line.match(/[^\s]+\.NSCR/)?.[0];
        if (name) return line.replace(name, `<span class="file-link nscr-link" style="color: #9900cc; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
      }
      // Anchor tags linking NSBMD and NSBTX binary mesh types
      if (line.match(/\.(NSBMD|NSBTX)/i)) {
        const name = line.match(/[^\s]+\.(?:NSBMD|NSBTX)/i)?.[0];
        if (name) return line.replace(name, `<span class="file-link nsbmd-link" style="color: #00994d; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
      }
      if (line.match(/\.NCER/i)) {
        const name = line.match(/[^\s]+\.NCER/i)?.[0];
        if (name) return line.replace(name, `<span class="file-link ncer-link" style="color: #cc0066; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
      }
      if (line.match(/\.NANR/i)) {
        const name = line.match(/[^\s]+\.NANR/i)?.[0];
        if (name) return line.replace(name, `<span class="file-link nanr-link" style="color: #cc6600; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
      }
      if (line.match(/\.sdat/i)) {
        const name = line.match(/[^\s]+\.sdat/i)?.[0];
        if (name) return line.replace(name, `<span class="file-link sdat-link" style="color: #009999; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
      }
      if (line.match(/\.(NFTR|ZFTR)/i)) {
        const name = line.match(/[^\s]+\.(?:NFTR|ZFTR)/i)?.[0];
        if (name) return line.replace(name, `<span class="file-link nftr-link" style="color: #666699; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
      }
      if (line.match(/\.KCL/i)) {
        const name = line.match(/[^\s]+\.KCL/i)?.[0];
        if (name) return line.replace(name, `<span class="file-link kcl-link" style="color: #336699; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
      }
      if (line.match(/\.NSBTP/i)) {
        const name = line.match(/[^\s]+\.NSBTP/i)?.[0];
        if (name) return line.replace(name, `<span class="file-link nsbtp-link" style="color: #cc9900; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
      }
      return line;
    })
    .join("\n");
}

function handleFileClick(e: Event) {
  const target = e.target as HTMLElement;
  if (!target.classList.contains("file-link")) return;

  const name = target.dataset.file;
  if (!name || !currentBuffer || !currentDirectory) return;

  if (target.classList.contains("carc-link")) {
    openCARCFile(name);
  } else if (target.classList.contains("nclr-link")) {
    openNCLRFile(name);
  } else if (target.classList.contains("ncgr-link")) {
    openNCGRFile(name);
  } else if (target.classList.contains("nscr-link")) {
    openNSCRFile(name);
  } else if (target.classList.contains("nsbmd-link")) {
    openNSBMDFile(name); // Handler trigger
  } else if (target.classList.contains("ncer-link")) {
    openNCERFile(name);
  } else if (target.classList.contains("nanr-link")) {
    openNANRFile(name);
  } else if (target.classList.contains("sdat-link")) {
    openSDATFile(name);
  } else if (target.classList.contains("nftr-link")) {
    openNFTRFile(name);
  } else if (target.classList.contains("sdat-entry-link")) {
    downloadSDATEntry(name);
  } else if (target.classList.contains("kcl-link")) {
    openKCLFile(name);
  } else if (target.classList.contains("nsbtp-link")) {
    openNSBTPFile(name);
  }
}

// MODIFIED: Abstracts lookups to check inside an active .carc archive block context before falling back to global filesystem directory
function getFileData(fileName: string): Uint8Array | null {
  if (activeArchive && typeof (activeArchive.instance as any).extractFile === "function") {
    const data = (activeArchive.instance as any).extractFile(fileName);
    if (data) return data;
  }
  return currentDirectory ? currentDirectory.extractFile(fileName) : null;
}

function openCARCFile(fileName: string) {
  if (!currentBuffer || !currentDirectory) return;

  const fileData = currentDirectory.extractFile(fileName);
  if (!fileData) return;

  try {
    let finalData = fileData;
    const magic = String.fromCharCode(...fileData.slice(0, 4));

    if (magic === "Yaz0") {
      throw new Error("Yaz0 decompression not implemented yet.");
    } else if (fileData[0] === 0x10) {
      const view = new DataView(fileData.buffer, fileData.byteOffset, fileData.byteLength);
      const decompSize = view.getUint8(1) | (view.getUint8(2) << 8) | (view.getUint8(3) << 16);
      finalData = decompressLZ77(fileData, decompSize);
    } else if (magic !== "NARC" && magic !== "CRAN") {
      throw new Error(`Unexpected header "${magic}". Check FNT/FAT offsets.`);
    }

    const carc = new CARC(finalData.buffer.slice(finalData.byteOffset, finalData.byteOffset + finalData.byteLength) as ArrayBuffer);

    // UPDATED: Bind this CARC instance to active tracking context
    activeArchive = { name: fileName, instance: carc };

    const panel = document.getElementById("rightPanel")!;
    panel.innerHTML = "";

    const header = document.createElement("h3");
    header.textContent = fileName;
    header.style.cssText = "margin: 0 0 10px 0; font-size: 16px;";

    const tree = document.createElement("pre");
    tree.style.cssText = "padding: 15px; background: #f5f5f5; border-radius: 4px; overflow-x: auto; cursor: pointer;";

    // UPDATED: Convert text lists to interactable elements using formatTreeWithLinks
    tree.innerHTML = formatTreeWithLinks(carc.list());

    panel.appendChild(header);
    panel.appendChild(tree);
  } catch (err) {
    alert(`Error: ${err}`);
  }
}

function openSDATFile(fileName: string) {
  if (!currentBuffer || !currentDirectory) return;

  const fileData = currentDirectory.extractFile(fileName);
  if (!fileData) return;

  try {
    const sdat = new SDAT(fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer);

    // UPDATED: Bind this SDAT instance to active tracking context, same as CARC archives
    activeArchive = { name: fileName, instance: sdat };

    const panel = document.getElementById("rightPanel")!;
    panel.innerHTML = "";

    const header = document.createElement("h3");
    header.textContent = fileName;
    header.style.cssText = "margin: 0 0 10px 0; font-size: 16px;";

    const info = document.createElement("pre");
    info.style.cssText = "padding: 10px; background: #f5f5f5; border-radius: 4px; margin-bottom: 10px;";
    info.textContent = sdat.getInfo();

    const tree = document.createElement("pre");
    tree.style.cssText = "padding: 15px; background: #f5f5f5; border-radius: 4px; overflow-x: auto; cursor: pointer;";
    tree.innerHTML = formatSDATTreeWithLinks(sdat.list());

    panel.appendChild(header);
    panel.appendChild(info);
    panel.appendChild(tree);
  } catch (err) {
    alert(`Error: ${err}`);
  }
}

function formatSDATTreeWithLinks(treeText: string): string {
  return treeText
    .split("\n")
    .map((line) => {
      const match = line.match(/[A-Za-z0-9_]+\.(SSEQ|SSAR|SBNK|SWAR|STRM)/);
      if (!match) return line;
      const name = match[0];
      return line.replace(name, `<span class="file-link sdat-entry-link" style="color: #cc6600; text-decoration: underline; cursor: pointer;" data-file="${name}">${name}</span>`);
    })
    .join("\n");
}

function downloadSDATEntry(entryLabel: string) {
  if (!activeArchive || !(activeArchive.instance instanceof SDAT)) return;

  // Strip the trailing ".SSEQ"/".SBNK"/etc back off since SDAT entry names don't include it.
  const name = entryLabel.substring(0, entryLabel.lastIndexOf("."));
  const data = activeArchive.instance.extractFile(name);
  if (!data) return;

  const blob = new Blob([data as any], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = entryLabel;
  a.click();
  URL.revokeObjectURL(url);
}

function openKCLFile(fileName: string) {
  const fileData = getFileData(fileName);
  if (!fileData) return;

  try {
    const kcl = new KCL(fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer);

    const panel = document.getElementById("rightPanel")!;
    panel.innerHTML = "";

    const header = document.createElement("h3");
    header.textContent = fileName;
    header.style.cssText = "margin: 0 0 10px 0; font-size: 16px;";

    const info = document.createElement("pre");
    info.style.cssText = "padding: 15px; background: #f5f5f5; border-radius: 4px;";
    info.textContent = kcl.getInfo();

    panel.appendChild(header);
    panel.appendChild(info);
  } catch (err) {
    alert(`Error decoding KCL file: ${err}`);
  }
}

function openNSBTPFile(fileName: string) {
  const fileData = getFileData(fileName);
  if (!fileData) return;

  try {
    const nsbtp = new NSBTP(fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer);

    const panel = document.getElementById("rightPanel")!;
    panel.innerHTML = "";

    const header = document.createElement("h3");
    header.textContent = fileName;
    header.style.cssText = "margin: 0 0 10px 0; font-size: 16px;";

    const info = document.createElement("pre");
    info.style.cssText = "padding: 15px; background: #f5f5f5; border-radius: 4px; white-space: pre-wrap;";
    info.textContent = nsbtp.getInfo();

    panel.appendChild(header);
    panel.appendChild(info);
  } catch (err) {
    alert(`Error decoding NSBTP file: ${err}`);
  }
}

function openNFTRFile(fileName: string) {
  const fileData = getFileData(fileName);
  if (!fileData) return;

  try {
    let workingData: Uint8Array = fileData;

    if (fileName.toLowerCase().endsWith(".zftr")) {
      // ZFTR: 4-byte LZ header, then LZ-compressed RTFN data.
      const decompSize = fileData[0] | (fileData[1] << 8) | (fileData[2] << 16) | (fileData[3] << 24);
      workingData = decompressLZ77(fileData.slice(4), decompSize);
    }

    const nftr = new NFTR(workingData.buffer.slice(workingData.byteOffset, workingData.byteOffset + workingData.byteLength) as ArrayBuffer);
    renderFontWorkspace(fileName, nftr);
  } catch (err) {
    alert(`Error decoding NFTR file: ${err}`);
  }
}

function renderFontWorkspace(fileName: string, nftr: NFTR) {
  const panel = document.getElementById("rightPanel")!;
  panel.innerHTML = "";

  const header = document.createElement("h3");
  header.textContent = fileName;
  header.style.cssText = "margin: 0 0 10px 0; font-size: 16px;";
  panel.appendChild(header);

  const info = document.createElement("pre");
  info.style.cssText = "padding: 10px; background: #f5f5f5; border-radius: 4px; margin-bottom: 15px;";
  info.textContent = nftr.getInfo();
  panel.appendChild(info);

  const glyphCount = nftr.getGlyphCount();
  const grid = document.createElement("div");
  grid.style.cssText = "padding: 15px; background: #f5f5f5; border-radius: 4px; display: flex; flex-wrap: wrap; gap: 4px; max-height: 500px; overflow-y: auto;";

  const scale = 3;

  for (let i = 0; i < glyphCount; i++) {
    const glyph = nftr.renderGlyphRGBA(i);
    if (!glyph) continue;

    const canvas = document.createElement("canvas");
    canvas.width = glyph.width;
    canvas.height = glyph.height;
    canvas.style.cssText = `width: ${glyph.width * scale}px; height: ${glyph.height * scale}px; image-rendering: pixelated; border: 1px solid #ddd; background: #222;`;
    canvas.title = `Glyph ${i}`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      // @ts-ignore
      ctx.putImageData(new ImageData(glyph.rgba, glyph.width, glyph.height), 0, 0);
    }

    grid.appendChild(canvas);
  }

  panel.appendChild(grid);

  // Text preview box: types a string, looks up each character's glyph via the code map, and renders it.
  const previewLabel = document.createElement("div");
  previewLabel.textContent = "Preview text:";
  previewLabel.style.cssText = "margin-top: 15px; font-size: 13px; color: #555;";
  panel.appendChild(previewLabel);

  const input = document.createElement("input");
  input.type = "text";
  input.value = "Hello";
  input.style.cssText = "margin-top: 5px; padding: 6px; width: 100%; box-sizing: border-box;";
  panel.appendChild(input);

  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = 400;
  previewCanvas.height = 40;
  previewCanvas.style.cssText = "margin-top: 10px; image-rendering: pixelated; border: 1px dashed #ccc; background: #222; width: 400px; height: 40px;";
  panel.appendChild(previewCanvas);

  function drawPreview() {
    const ctx = previewCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    let cursorX = 4;
    for (const ch of input.value) {
      const codePoint = ch.codePointAt(0);
      if (codePoint === undefined) continue;

      const glyphIndex = nftr.getGlyphIndexForCodePoint(codePoint);
      if (glyphIndex === null) {
        cursorX += 8;
        continue;
      }

      const glyph = nftr.renderGlyphRGBA(glyphIndex);
      if (!glyph) continue;

      const temp = document.createElement("canvas");
      temp.width = glyph.width;
      temp.height = glyph.height;
      const tctx = temp.getContext("2d");
      if (tctx) {
        // @ts-ignore
        tctx.putImageData(new ImageData(glyph.rgba, glyph.width, glyph.height), 0, 0);
        ctx.drawImage(temp, cursorX, 4);
      }

      cursorX += glyph.width;
    }
  }

  input.addEventListener("input", drawPreview);
  drawPreview();
}

function openNCLRFile(fileName: string) {
  const fileData = getFileData(fileName);
  if (!fileData) return;

  try {
    const nclr = new NCLR(fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer);
    activePalette = nclr;

    const panel = document.getElementById("rightPanel")!;
    panel.innerHTML = "";

    const header = document.createElement("h3");
    header.textContent = fileName;
    header.style.cssText = "margin: 0 0 10px 0; font-size: 16px;";

    const info = document.createElement("pre");
    info.textContent = nclr.getInfo();
    info.style.cssText = "padding: 10px; background: #f5f5f5; border-radius: 4px; margin-bottom: 10px;";

    const paletteContainer = document.createElement("div");
    paletteContainer.innerHTML = nclr.renderHTML();
    paletteContainer.style.cssText = "padding: 15px; background: #f5f5f5; border-radius: 4px;";

    panel.appendChild(header);
    panel.appendChild(info);
    panel.appendChild(paletteContainer);
  } catch (err) {
    alert(`Error: ${err}`);
  }
}

function findCompanionFile(baseName: string, extensions: string[]): { data: Uint8Array; foundName: string } | null {
  // Try to find file in active archive context first
  if (activeArchive) {
    let cleanTargetBase = baseName;
    if (cleanTargetBase.includes(".")) {
      cleanTargetBase = cleanTargetBase.substring(0, cleanTargetBase.lastIndexOf("."));
    }
    const arc = activeArchive.instance as any;

    if (typeof arc.extractFile === "function") {
      for (const ext of extensions) {
        const exactName = `${cleanTargetBase}${ext}`;
        const data = arc.extractFile(exactName);
        if (data) return { data, foundName: exactName };
      }

      if (typeof arc.list === "function") {
        const archiveFiles: string[] = arc
          .list()
          .split("\n")
          .map((l: string) => {
            const match = l.match(/[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+/);
            return match ? match[0] : "";
          })
          .filter((l: string) => l.length > 0);

        const parts = cleanTargetBase.split("_");

        for (let len = parts.length - 1; len >= 1; len--) {
          const activePrefix = parts.slice(0, len).join("_").toLowerCase();

          for (const entry of archiveFiles) {
            let currentFileBase = entry;
            if (currentFileBase.includes(".")) {
              currentFileBase = currentFileBase.substring(0, currentFileBase.lastIndexOf("."));
            }
            const lowerCandidateBase = currentFileBase.toLowerCase();

            if (lowerCandidateBase.startsWith(activePrefix)) {
              for (const ext of extensions) {
                if (entry.toLowerCase().endsWith(ext.toLowerCase())) {
                  const data = arc.extractFile(entry);
                  if (data) return { data, foundName: entry };
                }
              }
            }
          }
        }
      }
    }
  }

  if (!currentDirectory) return null;

  let cleanTargetBase = baseName;
  if (cleanTargetBase.includes(".")) {
    cleanTargetBase = cleanTargetBase.substring(0, cleanTargetBase.lastIndexOf("."));
  }

  for (const ext of extensions) {
    const exactName = `${cleanTargetBase}${ext}`;
    const data = currentDirectory.extractFile(exactName);
    if (data) return { data, foundName: exactName };
  }

  let allFiles: string[] = [];
  const dir = currentDirectory as any;

  if (Array.isArray(dir.fileNames)) allFiles = dir.fileNames;
  else if (Array.isArray(dir.files)) allFiles = dir.files;
  else if (dir.entries && typeof dir.entries === "object") allFiles = Object.keys(dir.entries);
  else {
    allFiles = dir
      .print()
      .split("\n")
      .map((l: string) => {
        const match = l.match(/[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+/);
        return match ? match[0] : "";
      })
      .filter((l: string) => l.length > 0);
  }

  if (allFiles.length === 0) return null;

  const parts = cleanTargetBase.split("_");

  for (let len = parts.length - 1; len >= 1; len--) {
    const activePrefix = parts.slice(0, len).join("_").toLowerCase();

    for (const entry of allFiles) {
      let currentFileBase = entry;
      if (currentFileBase.includes(".")) {
        currentFileBase = currentFileBase.substring(0, currentFileBase.lastIndexOf("."));
      }

      const lowerCandidateBase = currentFileBase.toLowerCase();

      if (lowerCandidateBase.startsWith(activePrefix)) {
        for (const ext of extensions) {
          if (entry.toLowerCase().endsWith(ext.toLowerCase())) {
            const data = currentDirectory.extractFile(entry);
            if (data) {
              return { data, foundName: entry };
            }
          }
        }
      }
    }
  }

  return null;
}

function openNCGRFile(fileName: string) {
  const fileData = getFileData(fileName);
  if (!fileData) return;

  try {
    const ncgr = new NCGR(fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer);
    const baseName = fileName.substring(0, fileName.lastIndexOf("."));

    const paletteMatch = findCompanionFile(baseName, [".NCLR", ".nclr"]);
    if (paletteMatch) {
      activePalette = new NCLR(paletteMatch.data.buffer.slice(paletteMatch.data.byteOffset, paletteMatch.data.byteOffset + paletteMatch.data.byteLength) as ArrayBuffer);
    }

    const layoutMatch = findCompanionFile(baseName, [".NSCR", ".nscr"]);
    let activeNscr: NSCR | null = null;
    if (layoutMatch) {
      activeNscr = new NSCR(layoutMatch.data.buffer.slice(layoutMatch.data.byteOffset, layoutMatch.data.byteOffset + layoutMatch.data.byteLength) as ArrayBuffer);
    }

    renderWorkspaceCanvas(fileName, ncgr, activeNscr);
  } catch (err) {
    alert(`Error decoding NCGR file: ${err}`);
  }
}

function openNSCRFile(fileName: string) {
  const fileData = getFileData(fileName);
  if (!fileData) return;

  try {
    const nscr = new NSCR(fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer);
    const baseName = fileName.substring(0, fileName.lastIndexOf("."));

    const paletteMatch = findCompanionFile(baseName, [".NCLR", ".nclr"]);
    if (paletteMatch) {
      activePalette = new NCLR(paletteMatch.data.buffer.slice(paletteMatch.data.byteOffset, paletteMatch.data.byteOffset + paletteMatch.data.byteLength) as ArrayBuffer);
    }

    const graphicsMatch = findCompanionFile(baseName, [".NCGR", ".ncgr", ".NCBR", ".ncbr"]);
    if (!graphicsMatch) {
      throw new Error(`Could not find any companion asset tile graphics inside directory matching prefix elements of "${baseName}".`);
    }

    const ncgrInstance = new NCGR(graphicsMatch.data.buffer.slice(graphicsMatch.data.byteOffset, graphicsMatch.data.byteOffset + graphicsMatch.data.byteLength) as ArrayBuffer);

    renderWorkspaceCanvas(fileName, ncgrInstance, nscr);
  } catch (err) {
    alert(`Error decoding NSCR map layer file: ${err}`);
  }
}

function openNCERFile(fileName: string) {
  const fileData = getFileData(fileName);
  if (!fileData) return;

  try {
    const ncer = new NCER(fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer);
    const baseName = fileName.substring(0, fileName.lastIndexOf("."));

    const graphicsMatch = findCompanionFile(baseName, [".NCGR", ".ncgr", ".NCBR", ".ncbr"]);
    if (!graphicsMatch) {
      throw new Error(`Could not find any companion .NCGR tile graphics for "${baseName}".`);
    }
    const ncgr = new NCGR(graphicsMatch.data.buffer.slice(graphicsMatch.data.byteOffset, graphicsMatch.data.byteOffset + graphicsMatch.data.byteLength) as ArrayBuffer);

    const paletteMatch = findCompanionFile(baseName, [".NCLR", ".nclr"]);
    if (paletteMatch) {
      activePalette = new NCLR(paletteMatch.data.buffer.slice(paletteMatch.data.byteOffset, paletteMatch.data.byteOffset + paletteMatch.data.byteLength) as ArrayBuffer);
    }

    renderCellWorkspace(fileName, ncer, ncgr);
  } catch (err) {
    alert(`Error decoding NCER file: ${err}`);
  }
}

function renderCellWorkspace(fileName: string, ncer: NCER, ncgr: NCGR) {
  const cellData = ncer.getCellData();
  const gfx = ncgr.getGraphicsData();
  if (!cellData || !gfx) return;

  const panel = document.getElementById("rightPanel")!;
  panel.innerHTML = "";

  const header = document.createElement("h3");
  header.textContent = fileName;
  header.style.cssText = "margin: 0 0 10px 0; font-size: 16px;";
  panel.appendChild(header);

  if (!activePalette || !activePalette.getPalette()) {
    const warning = document.createElement("div");
    warning.style.cssText = "padding: 10px; background: #fff3cd; border: 1px solid #ffeeba; color: #856404; border-radius: 4px; margin-bottom: 10px; font-size: 14px;";
    warning.textContent = "⚠️ Warning: No matching companion .NCLR color sheet detected for this asset cluster. Falling back to default black.";
    panel.appendChild(warning);
  }

  const info = document.createElement("pre");
  info.style.cssText = "padding: 10px; background: #f5f5f5; border-radius: 4px; margin-bottom: 15px;";
  info.textContent = ncer.getInfo();
  panel.appendChild(info);

  const paletteObj = activePalette?.getPalette();
  const colors = paletteObj ? paletteObj.colors : new Array(256).fill({ r: 0, g: 0, b: 0 });
  const tileSheetWidthTiles = gfx.widthChars !== 0xffff ? gfx.widthChars : 32;

  const grid = document.createElement("div");
  grid.style.cssText = "padding: 15px; background: #f5f5f5; border-radius: 4px; display: flex; flex-wrap: wrap; gap: 10px;";

  const canvasSize = 64;

  for (let i = 0; i < cellData.numCells; i++) {
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    canvas.style.cssText = "image-rendering: pixelated; border: 1px dashed #ccc; background: repeating-conic-gradient(#fff 0% 25%, #eee 0% 50%) 50% / 16px 16px;";

    const rgba = ncer.renderCellRGBA(i, gfx.pixelData, gfx.colorFormat, tileSheetWidthTiles, gfx.mappingMode, colors, canvasSize, canvasSize);
    if (rgba) {
      const ctx = canvas.getContext("2d");
      // @ts-ignore
      if (ctx) ctx.putImageData(new ImageData(rgba, canvasSize, canvasSize), 0, 0);
    }

    grid.appendChild(canvas);
  }

  panel.appendChild(grid);
}

function openNANRFile(fileName: string) {
  const fileData = getFileData(fileName);
  if (!fileData) return;

  try {
    const nanr = new NANR(fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer);
    const baseName = fileName.substring(0, fileName.lastIndexOf("."));

    const cellMatch = findCompanionFile(baseName, [".NCER", ".ncer"]);
    if (!cellMatch) {
      throw new Error(`Could not find any companion .NCER cell data for "${baseName}".`);
    }
    const ncer = new NCER(cellMatch.data.buffer.slice(cellMatch.data.byteOffset, cellMatch.data.byteOffset + cellMatch.data.byteLength) as ArrayBuffer);

    const graphicsMatch = findCompanionFile(baseName, [".NCGR", ".ncgr", ".NCBR", ".ncbr"]);
    if (!graphicsMatch) {
      throw new Error(`Could not find any companion .NCGR tile graphics for "${baseName}".`);
    }
    const ncgr = new NCGR(graphicsMatch.data.buffer.slice(graphicsMatch.data.byteOffset, graphicsMatch.data.byteOffset + graphicsMatch.data.byteLength) as ArrayBuffer);

    const paletteMatch = findCompanionFile(baseName, [".NCLR", ".nclr"]);
    if (paletteMatch) {
      activePalette = new NCLR(paletteMatch.data.buffer.slice(paletteMatch.data.byteOffset, paletteMatch.data.byteOffset + paletteMatch.data.byteLength) as ArrayBuffer);
    }

    renderAnimationWorkspace(fileName, nanr, ncer, ncgr);
  } catch (err) {
    alert(`Error decoding NANR file: ${err}`);
  }
}

function renderAnimationWorkspace(fileName: string, nanr: NANR, ncer: NCER, ncgr: NCGR) {
  if (activeAnimationInterval !== null) {
    clearInterval(activeAnimationInterval);
    activeAnimationInterval = null;
  }

  const animData = nanr.getAnimationData();
  const gfx = ncgr.getGraphicsData();
  if (!animData || !gfx) return;

  const panel = document.getElementById("rightPanel")!;
  panel.innerHTML = "";

  const header = document.createElement("h3");
  header.textContent = fileName;
  header.style.cssText = "margin: 0 0 10px 0; font-size: 16px;";
  panel.appendChild(header);

  if (!activePalette || !activePalette.getPalette()) {
    const warning = document.createElement("div");
    warning.style.cssText = "padding: 10px; background: #fff3cd; border: 1px solid #ffeeba; color: #856404; border-radius: 4px; margin-bottom: 10px; font-size: 14px;";
    warning.textContent = "⚠️ Warning: No matching companion .NCLR color sheet detected for this asset cluster. Falling back to default black.";
    panel.appendChild(warning);
  }

  const info = document.createElement("pre");
  info.style.cssText = "padding: 10px; background: #f5f5f5; border-radius: 4px; margin-bottom: 15px;";
  info.textContent = nanr.getInfo();
  panel.appendChild(info);

  if (animData.numAnimations === 0) {
    panel.appendChild(document.createTextNode("No animations found."));
    return;
  }

  const container = document.createElement("div");
  container.style.cssText = "padding: 15px; background: #f5f5f5; border-radius: 4px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start;";

  const select = document.createElement("select");
  animData.animations.forEach((anim, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Animation ${i} (${anim.numFrames} frames)`;
    select.appendChild(opt);
  });
  container.appendChild(select);

  const canvasSize = 96;
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  canvas.style.cssText = "image-rendering: pixelated; border: 1px dashed #ccc; background: repeating-conic-gradient(#fff 0% 25%, #eee 0% 50%) 50% / 16px 16px;";
  container.appendChild(canvas);

  panel.appendChild(container);

  const paletteObj = activePalette?.getPalette();
  const colors = paletteObj ? paletteObj.colors : new Array(256).fill({ r: 0, g: 0, b: 0 });
  const tileSheetWidthTiles = gfx.widthChars !== 0xffff ? gfx.widthChars : 32;
  const ctx = canvas.getContext("2d");

  let currentFrameIndex = 0;

  function drawCurrentFrame(animIndex: number) {
    const anim = animData!.animations[animIndex];
    if (!anim || anim.frames.length === 0 || !ctx) return;

    const frame = anim.frames[currentFrameIndex % anim.frames.length];
    const rgba = ncer.renderCellRGBA(frame.cellIndex, gfx!.pixelData, gfx!.colorFormat, tileSheetWidthTiles, gfx!.mappingMode, colors, canvasSize, canvasSize);
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    if (rgba) {
      // @ts-ignore
      ctx.putImageData(new ImageData(rgba, canvasSize, canvasSize), 0, 0);
    }

    currentFrameIndex++;
  }

  function startPlayback(animIndex: number) {
    if (activeAnimationInterval !== null) {
      clearInterval(activeAnimationInterval);
    }
    currentFrameIndex = 0;

    const anim = animData!.animations[animIndex];
    const firstFrameUnits = anim && anim.frames.length > 0 ? anim.frames[0].frameLengthUnits : 4;
    // Frame length is in 60Hz units; convert to milliseconds for the browser timer.
    const intervalMs = Math.max(16, (firstFrameUnits || 4) * (1000 / 60));

    drawCurrentFrame(animIndex);
    activeAnimationInterval = window.setInterval(() => drawCurrentFrame(animIndex), intervalMs);
  }

  select.addEventListener("change", () => startPlayback(Number(select.value)));
  startPlayback(0);
}

function renderWorkspaceCanvas(fileName: string, ncgr: NCGR, nscr: NSCR | null) {
  const gfx = ncgr.getGraphicsData();
  if (!gfx) return;

  const panel = document.getElementById("rightPanel")!;
  panel.innerHTML = "";

  const header = document.createElement("h3");
  header.textContent = fileName;
  header.style.cssText = "margin: 0 0 10px 0; font-size: 16px;";
  panel.appendChild(header);

  if (!activePalette || !activePalette.getPalette()) {
    const warning = document.createElement("div");
    warning.style.cssText = "padding: 10px; background: #fff3cd; border: 1px solid #ffeeba; color: #856404; border-radius: 4px; margin-bottom: 10px; font-size: 14px;";
    warning.textContent = "⚠️ Warning: No matching companion .NCLR color sheet detected for this asset cluster. Falling back to default black.";
    panel.appendChild(warning);
  }

  const info = document.createElement("pre");
  info.style.cssText = "padding: 10px; background: #f5f5f5; border-radius: 4px; margin-bottom: 15px;";
  info.textContent = `Format: ${gfx.colorFormat}\nMapping: ${gfx.mappingMode}\nScreen Map (.NSCR) Linked: ${nscr !== null}`;
  panel.appendChild(info);

  const canvasContainer = document.createElement("div");
  canvasContainer.style.cssText = "padding: 15px; background: #f5f5f5; border-radius: 4px; display: flex; flex-direction: column; gap: 15px; align-items: flex-start;";

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "image-rendering: pixelated; border: 1px dashed #ccc; max-width: 100%; background: repeating-conic-gradient(#fff 0% 25%, #eee 0% 50%) 50% / 16px 16px;";
  canvasContainer.appendChild(canvas);
  panel.appendChild(canvasContainer);

  drawGfxFinal(ncgr, canvas, nscr);
}

function drawGfxFinal(ncgr: NCGR, canvas: HTMLCanvasElement, nscr: NSCR | null) {
  const gfx = ncgr.getGraphicsData();
  if (!gfx) return;

  const paletteObj = activePalette?.getPalette();
  const colors = paletteObj ? paletteObj.colors : new Array(256).fill({ r: 0, g: 0, b: 0 });

  let finalWidth = 0;
  let finalHeight = 0;

  const nscrLayout = nscr ? nscr.getLayout() : null;

  if (nscrLayout) {
    finalWidth = nscrLayout.widthPixels;
    finalHeight = nscrLayout.heightPixels;
  } else {
    finalWidth = gfx.widthChars !== 0xffff ? gfx.widthChars * 8 : 256;
    finalHeight = gfx.heightChars !== 0xffff ? gfx.heightChars * 8 : Math.ceil(gfx.pixelData.length / finalWidth);
  }

  if (finalWidth <= 0) finalWidth = 256;
  if (finalHeight <= 0) finalHeight = 256;

  canvas.width = finalWidth;
  canvas.height = finalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const oldWidthChars = gfx.widthChars;
  const oldHeightChars = gfx.heightChars;

  gfx.widthChars = finalWidth / 8;
  gfx.heightChars = finalHeight / 8;

  const rgbaBytes = ncgr.getRGBA(colors, 0, nscrLayout);

  gfx.widthChars = oldWidthChars;
  gfx.heightChars = oldHeightChars;

  if (!rgbaBytes) return;

  // @ts-ignore
  const imgData = new ImageData(rgbaBytes, finalWidth, finalHeight);
  ctx.putImageData(imgData, 0, 0);
}

// --- NEW NSBMD / NSBTX VIEWPORT ENGINE ---
function openNSBMDFile(fileName: string) {
  const fileData = getFileData(fileName);
  if (!fileData) return;

  try {
    const bmd = new NSBMD(fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength) as ArrayBuffer);

    const panel = document.getElementById("rightPanel")!;
    panel.innerHTML = "";

    const header = document.createElement("h3");
    header.textContent = fileName;
    header.style.cssText = "margin: 0 0 10px 0; font-size: 16px;";
    panel.appendChild(header);

    const viewport = document.createElement("div");
    viewport.style.cssText = "padding: 15px; background: #f5f5f5; border-radius: 4px; display: flex; flex-direction: column; gap: 15px;";

    // 1. Display General G3D block header info
    const summary = document.createElement("pre");
    summary.style.cssText = "margin: 0; background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #ddd;";
    summary.textContent = `File Format: ${bmd.header.magic}\nTotal Size: ${bmd.header.fileSize} bytes\nBlocks Parsed: ${bmd.header.numBlocks}`;
    viewport.appendChild(summary);

    // 2. Models info listing (MDL0 structural properties)
    if (bmd.models.length > 0) {
      const mdlSection = document.createElement("div");
      mdlSection.innerHTML = `<h4 style="margin: 5px 0; color: #00994d;">📦 3D Models (${bmd.models.length})</h4>`;

      bmd.models.forEach((model) => {
        const text = document.createElement("pre");
        text.style.cssText = "background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #ddd; font-size: 13px; max-height: 200px; overflow-y: auto;";

        let sbcSummary = model.sbcCommands
          .slice(0, 8)
          .map((c) => `  ${c.mnemonic}(${c.operands.join(",")})`)
          .join("\n");
        if (model.sbcCommands.length > 8) sbcSummary += "\n  ... (truncated)";

        text.textContent =
          `Model Name: "${model.name}"\n` +
          `├─ Materials Count: ${model.numMaterials}\n` +
          `├─ Shapes Count: ${model.numShapes}\n` +
          `├─ Vertices: ${model.verticesCount} | Polygons: ${model.polygonsCount}\n` +
          `└─ Active SBC Script opcodes:\n${sbcSummary}`;
        mdlSection.appendChild(text);
      });
      viewport.appendChild(mdlSection);
    }

    // 3. Textures info listing (TEX0 graphics properties)
    if (bmd.textures.length > 0) {
      const texSection = document.createElement("div");
      texSection.innerHTML = `<h4 style="margin: 5px 0; color: #e65c00;">🖼️ Embedded Textures (${bmd.textures.length})</h4>`;

      const list = document.createElement("pre");
      list.style.cssText = "background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #ddd; font-size: 13px; max-height: 150px; overflow-y: auto;";
      list.textContent = bmd.textures
        .map((t) => `Texture: "${t.name}"\n ├─ Size: ${t.srcWidth}x${t.srcHeight} (VRAM: ${t.realWidth}x${t.realHeight})\n └─ Format index: ${t.format} (${t.data.length} bytes payload)`)
        .join("\n\n");

      texSection.appendChild(list);
      viewport.appendChild(texSection);
    }

    // 4. Color Palettes listing
    if (bmd.palettes.length > 0) {
      const plttSection = document.createElement("div");
      plttSection.innerHTML = `<h4 style="margin: 5px 0; color: #9900cc;">🎨 VRAM Color Palettes (${bmd.palettes.length})</h4>`;

      const list = document.createElement("pre");
      list.style.cssText = "background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #ddd; font-size: 13px; max-height: 120px; overflow-y: auto;";
      list.textContent = bmd.palettes.map((p) => `Palette: "${p.name}"\n ├─ 4bpp Mode restricted: ${p.isPalette4}\n └─ Length: ${p.data.length} BGR555 words`).join("\n");

      plttSection.appendChild(list);
      viewport.appendChild(plttSection);
    }

    panel.appendChild(viewport);
  } catch (err) {
    alert(`Error decoding G3D file container structure: ${err}`);
  }
}

function decompressLZ77(src: Uint8Array, destSize: number): Uint8Array {
  if (src[0] !== 0x10) {
    throw new Error(`Unsupported compression type: 0x${src[0].toString(16)}`);
  }

  const dest = new Uint8Array(destSize);
  let srcPtr = 4;
  let destPtr = 0;

  while (destPtr < destSize && srcPtr < src.length) {
    const flag = src[srcPtr++];

    for (let i = 0; i < 8 && destPtr < destSize; i++) {
      if ((flag << i) & 0x80) {
        const b1 = src[srcPtr++];
        const b2 = src[srcPtr++];

        const length = (b1 >> 4) + 3;
        const disp = (((b1 & 0x0f) << 8) | b2) + 1;

        let copyPtr = destPtr - disp;
        for (let j = 0; j < length && destPtr < destSize; j++) {
          dest[destPtr++] = dest[copyPtr++];
        }
      } else {
        dest[destPtr++] = src[srcPtr++];
      }
    }
  }
  return dest;
}
