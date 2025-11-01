import { NitroFS } from "../core/NitroFS";
import { BufferReader } from "../core/BufferReader";
import { NSBTX, NSBTXTexture } from "../formats/3d/NSBTX";
import { TEX0 } from "../formats/3d/TEX0";

export class FileBrowser {
  private nitroFS: NitroFS;
  private container: HTMLElement;

  constructor(nitroFS: NitroFS, container: HTMLElement) {
    this.nitroFS = nitroFS;
    this.container = container;
    this.render();
  }

  private render() {
    this.container.innerHTML = `
        <div class="file-browser">
            <h3>File System Browser</h3>
            <div class="breadcrumb" id="breadcrumb"></div>
            <div class="file-list" id="file-list"></div>
            <div class="texture-controls" id="texture-controls" style="display: none;">
                <h4>Texture Viewer</h4>
                <div class="texture-info" id="texture-info"></div>
                <div class="texture-navigation">
                    <button id="prev-texture">← Previous</button>
                    <span id="texture-counter">1/1</span>
                    <button id="next-texture">Next →</button>
                </div>
            </div>
        </div>
    `;

    this.setupTextureControls();
    this.renderDirectory("/");
  }

  private setupTextureControls() {
    const prevBtn = document.getElementById("prev-texture");
    const nextBtn = document.getElementById("next-texture");
    const controls = document.getElementById("texture-controls");

    if (prevBtn && nextBtn) {
      prevBtn.onclick = () => this.navigateTexture(-1);
      nextBtn.onclick = () => this.navigateTexture(1);
    }
  }

  private currentTextures: NSBTXTexture[] = [];
  private currentTextureIndex = 0;

  private showTextureControls(textures: NSBTXTexture[]) {
    this.currentTextures = textures;
    this.currentTextureIndex = 0;

    const controls = document.getElementById("texture-controls");
    const counter = document.getElementById("texture-counter");

    if (controls) controls.style.display = "block";
    if (counter) counter.textContent = `1/${textures.length}`;
  }

  private navigateTexture(direction: number) {
    this.currentTextureIndex =
      (this.currentTextureIndex + direction + this.currentTextures.length) %
      this.currentTextures.length;

    const counter = document.getElementById("texture-counter");
    if (counter)
      counter.textContent = `${this.currentTextureIndex + 1}/${
        this.currentTextures.length
      }`;

    this.renderNSBTXTexture(
      this.currentTextures[this.currentTextureIndex],
      "Current Texture"
    );
  }

  private renderDirectory(path: string) {
    try {
      const contents = this.nitroFS.readDir(path);
      const fileList = document.getElementById("file-list")!;
      const breadcrumb = document.getElementById("breadcrumb")!;

      // Update breadcrumb
      breadcrumb.innerHTML = this.createBreadcrumb(path);

      // Render files and directories
      fileList.innerHTML = "";

      // Directories first
      contents.directories.forEach((dir) => {
        const dirElement = document.createElement("div");
        dirElement.className = "file-item directory";
        dirElement.innerHTML = `📁 ${dir}`;
        dirElement.onclick = () => this.renderDirectory(`${path}${dir}/`);
        fileList.appendChild(dirElement);
      });

      // Then files
      contents.files.forEach((file) => {
        const fileElement = document.createElement("div");
        fileElement.className = "file-item file";
        fileElement.innerHTML = `📄 ${file}`;
        fileElement.onclick = () => this.handleFileClick(`${path}${file}`);
        fileList.appendChild(fileElement);
      });
    } catch (error) {
      console.error("Error reading directory:", error);
    }
  }

  private createBreadcrumb(path: string): string {
    const parts = path.split("/").filter((part) => part !== "");
    let breadcrumb =
      '<span class="breadcrumb-item" onclick="fileBrowser.renderDirectory(\'/\')">Root</span>';

    let currentPath = "";
    parts.forEach((part) => {
      currentPath += part + "/";
      breadcrumb += ` > <span class="breadcrumb-item" onclick="fileBrowser.renderDirectory('${currentPath}')">${part}</span>`;
    });

    return breadcrumb;
  }

  private handleFileClick(filePath: string) {
    console.log("File clicked:", filePath);
    this.previewFile(filePath);
  }

  private previewFile(filePath: string) {
    try {
      const fileData = this.nitroFS.readFile(filePath);
      console.log(`File: ${filePath}, Size: ${fileData.byteLength} bytes`);

      if (
        filePath.endsWith(".btx0") ||
        filePath.endsWith(".tex0") ||
        filePath.endsWith(".nsbtx")
      ) {
        this.previewTexture(filePath, fileData);
      } else if (filePath.endsWith(".nsbmd")) {
        this.previewModel(filePath, fileData);
      } else if (filePath.endsWith(".nsbca")) {
        console.log("Animation file:", filePath);
      }
    } catch (error) {
      console.error("Error reading file:", error);
    }
  }

  private previewTexture(filePath: string, fileData: ArrayBuffer) {
    console.log("Texture file detected:", filePath);

    try {
      const bufferReader = new BufferReader(fileData);

      if (filePath.endsWith(".nsbtx")) {
        this.previewNSBTX(filePath, bufferReader);
      } else if (filePath.endsWith(".btx0") || filePath.endsWith(".tex0")) {
        this.previewTEX0(filePath, bufferReader);
      }
    } catch (error) {
      console.error("Error parsing texture file:", error);
    }
  }

  private previewNSBTX(filePath: string, bufferReader: BufferReader) {
    try {
      const nsbtx = new NSBTX(bufferReader);
      console.log(`NSBTX contains ${nsbtx.getTextureCount()} textures`);

      if (nsbtx.getTextureCount() > 0) {
        // Show all textures found
        const allTextures = nsbtx.getAllTextures();
        allTextures.forEach((texture, index) => {
          console.log(
            `Texture ${index}: ${texture.width}x${texture.height} format:${
              texture.format
            } at 0x${texture.offset.toString(16)}`
          );
        });

        // Try rendering all found textures to see which one looks right
        this.renderAllTextures(allTextures, filePath);
      } else {
        console.warn("No textures found in NSBTX file");
      }
    } catch (error) {
      console.error("Error parsing NSBTX:", error);
    }
  }

  private renderAllTextures(textures: NSBTXTexture[], filePath: string) {
    // Render each texture with a delay so we can see them
    textures.forEach((texture, index) => {
      setTimeout(() => {
        console.log(
          `\n--- Rendering Texture ${index + 1}/${textures.length} ---`
        );
        this.renderNSBTXTexture(texture, filePath);
      }, index * 2000); // 2 second delay between textures
    });

    // Also try different interpretations of the first texture
    if (textures.length > 0) {
      setTimeout(() => {
        console.log("\n--- Trying alternative interpretations ---");
        this.tryAllTextureSizes(textures[0], filePath);
      }, textures.length * 2000 + 1000);
    }
  }
  private tryRenderRawTexture(bufferReader: BufferReader, filePath: string) {
    console.log("Attempting to render entire file as texture...");

    // Try common texture sizes
    const commonSizes = [
      { width: 64, height: 64 },
      { width: 128, height: 128 },
      { width: 256, height: 256 },
      { width: 32, height: 32 },
    ];

    for (const size of commonSizes) {
      const expectedSize = size.width * size.height * 4; // RGBA
      if (bufferReader.length >= expectedSize) {
        console.log(`Trying size ${size.width}x${size.height}`);

        // Create RGBA data from raw bytes
        const rgbaData = new Uint8Array(expectedSize);
        for (let i = 0; i < expectedSize; i++) {
          if (i < bufferReader.length) {
            rgbaData[i] = bufferReader.readUint8(i);
          } else {
            rgbaData[i] = 255; // Fill with white
          }
        }

        const app = (window as any).nitroFSApp;
        if (app && app.textureRenderer) {
          app.textureRenderer.renderTextureData(
            rgbaData,
            size.width,
            size.height
          );
          console.log(`Rendered raw texture ${size.width}x${size.height}`);
          return;
        }
      }
    }

    console.error("Could not render any texture from NSBTX file");
  }

  private previewTEX0(filePath: string, bufferReader: BufferReader) {
    try {
      const tex0 = new TEX0(bufferReader);
      console.log(
        `TEX0 contains ${tex0.textureInfo.entries.length} textures:`,
        tex0.textureInfo.names
      );

      if (tex0.textureInfo.entries.length > 0) {
        this.renderTexture(tex0, 0, filePath);
      }
    } catch (error) {
      console.error("Error parsing TEX0:", error);
    }
  }

  private renderTexture(tex0: TEX0, textureIndex: number, filePath: string) {
    try {
      const textureData = tex0.parseTexture(textureIndex);
      const textureInfo = tex0.textureInfo.entries[textureIndex];

      console.log(
        `Rendering texture: ${tex0.textureInfo.names[textureIndex]} (${textureInfo.width}x${textureInfo.height})`
      );

      const app = (window as any).nitroFSApp;
      if (app && app.textureRenderer) {
        app.textureRenderer.renderTextureData(
          textureData,
          textureInfo.width,
          textureInfo.height
        );
      }
    } catch (error) {
      console.error("Error rendering texture:", error);
    }
  }

  private renderNSBTXTexture(texture: NSBTXTexture, filePath: string) {
    try {
      console.log(
        `Rendering NSBTX texture: ${texture.width}x${texture.height} format:${
          texture.format
        } at 0x${texture.offset.toString(16)}`
      );

      // Show raw data for debugging
      this.showRawTextureData(texture);

      // Convert texture data to RGBA
      const rgbaData = this.convertTextureToRGBA(texture);

      const app = (window as any).nitroFSApp;
      if (app && app.textureRenderer) {
        app.textureRenderer.renderTextureData(
          rgbaData,
          texture.width,
          texture.height
        );

        // Add debug info to the page
        this.showTextureInfo(texture, filePath);
      }
    } catch (error) {
      console.error("Error rendering NSBTX texture:", error);
    }
  }

  private showTextureInfo(texture: NSBTXTexture, filePath: string) {
    const infoDiv = document.createElement("div");
    infoDiv.className = "texture-info";

    // Show format name
    const formatNames = {
      1: "A3I5",
      2: "4-color Palette",
      3: "16-color Palette",
      4: "256-color Palette",
      5: "Compressed 4x4",
      6: "A5I3",
      7: "Direct Color (RGBA5551)",
    };

    const formatName =
      formatNames[texture.format as keyof typeof formatNames] ||
      `Unknown (${texture.format})`;

    infoDiv.innerHTML = `
        <h4>🎨 Texture Loaded!</h4>
        <p><strong>File:</strong> ${filePath.split("/").pop()}</p>
        <p><strong>Size:</strong> ${texture.width}×${texture.height}</p>
        <p><strong>Format:</strong> ${formatName}</p>
        <p><strong>Data Size:</strong> ${texture.data.length} bytes</p>
        <p><strong>Offset:</strong> 0x${texture.offset.toString(16)}</p>
        <p><strong>Status:</strong> <span style="color: #4af">✓ Rendering</span></p>
    `;

    // Remove existing info
    const existingInfo = document.querySelector(".texture-info");
    if (existingInfo) {
      existingInfo.remove();
    }

    document.querySelector(".file-browser")?.appendChild(infoDiv);
  }

  private convertTextureToRGBA(texture: NSBTXTexture): Uint8Array {
    const rgbaData = new Uint8Array(texture.width * texture.height * 4);

    // Simple conversion based on format
    switch (texture.format) {
      case 7: // Direct color RGBA5551
        return this.convertDirectColor(texture);
      case 4: // 256-color palette
        return this.convertPalette256(texture);
      default:
        // For unsupported formats, create diagnostic texture
        return this.createDiagnosticTexture(texture);
    }
  }

  private convertDirectColor(texture: NSBTXTexture): Uint8Array {
    const rgbaData = new Uint8Array(texture.width * texture.height * 4);
    const dataView = new DataView(texture.data.buffer);

    console.log(
      "Converting Direct Color texture, data length:",
      texture.data.length
    );

    for (let i = 0; i < texture.width * texture.height; i++) {
      if (i * 2 >= texture.data.length) {
        console.warn("Texture data too short for expected size");
        break;
      }

      const color = dataView.getUint16(i * 2, true); // Little endian

      // RGBA5551 format: RRRRRGGGGGBBBBBA
      // 5 bits for R, G, B (0-31), 1 bit for alpha (0-1)
      const r = (color >> 0) & 0x1f;
      const g = (color >> 5) & 0x1f;
      const b = (color >> 10) & 0x1f;
      const a = (color >> 15) & 0x01;

      // Convert 5-bit to 8-bit (multiply by 8.2258, but 8 is close enough)
      const r8 = (r * 255) / 31;
      const g8 = (g * 255) / 31;
      const b8 = (b * 255) / 31;
      const a8 = a * 255;

      const index = i * 4;
      rgbaData[index] = Math.min(255, Math.max(0, r8));
      rgbaData[index + 1] = Math.min(255, Math.max(0, g8));
      rgbaData[index + 2] = Math.min(255, Math.max(0, b8));
      rgbaData[index + 3] = a8;

      // Debug first few pixels
      if (i < 4) {
        console.log(
          `Pixel ${i}: color=0x${color.toString(
            16
          )}, rgb=(${r},${g},${b}), rgba8=(${rgbaData[index]},${
            rgbaData[index + 1]
          },${rgbaData[index + 2]},${rgbaData[index + 3]})`
        );
      }
    }

    return rgbaData;
  }

  private convertPalette256(texture: NSBTXTexture): Uint8Array {
    const rgbaData = new Uint8Array(texture.width * texture.height * 4);

    // Create a simple grayscale palette for testing
    for (let i = 0; i < texture.width * texture.height; i++) {
      const paletteIndex = texture.data[i];
      const intensity = paletteIndex;

      const index = i * 4;
      rgbaData[index] = intensity;
      rgbaData[index + 1] = intensity;
      rgbaData[index + 2] = intensity;
      rgbaData[index + 3] = 255;
    }

    return rgbaData;
  }

  private createDiagnosticTexture(texture: NSBTXTexture): Uint8Array {
    const rgbaData = new Uint8Array(texture.width * texture.height * 4);

    console.log(`Creating diagnostic texture for format ${texture.format}`);

    for (let y = 0; y < texture.height; y++) {
      for (let x = 0; x < texture.width; x++) {
        const index = (y * texture.width + x) * 4;

        // Create a pattern that shows the format and position
        const formatColor = this.getFormatColor(texture.format);
        const xColor = (x / texture.width) * 200;
        const yColor = (y / texture.height) * 200;

        // Checkerboard pattern to see the texture clearly
        const checker = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) * 128;

        rgbaData[index] = formatColor.r + xColor + checker;
        rgbaData[index + 1] = formatColor.g + yColor + checker;
        rgbaData[index + 2] = formatColor.b + checker;
        rgbaData[index + 3] = 255;
      }
    }

    return rgbaData;
  }

  private showRawTextureData(texture: NSBTXTexture) {
    // Show the actual texture data bytes
    const hexData = Array.from(
      texture.data.slice(0, Math.min(64, texture.data.length))
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");

    console.log(
      `Texture data (first ${Math.min(64, texture.data.length)} bytes):`,
      hexData
    );
    console.log(
      `Texture data offset in file: 0x${texture.offset.toString(16)}`
    );
    console.log(
      `Expected texture size: ${texture.width * texture.height} pixels`
    );
    console.log(`Actual data size: ${texture.data.length} bytes`);

    // For Direct Color format, show first pixels as 16-bit values
    if (texture.format === 7) {
      const dataView = new DataView(texture.data.buffer);
      const firstPixels = [];
      const pixelCount = Math.min(8, texture.data.length / 2);

      for (let i = 0; i < pixelCount; i++) {
        firstPixels.push(
          "0x" +
            dataView
              .getUint16(i * 2, true)
              .toString(16)
              .padStart(4, "0")
        );
      }
      console.log("First pixels (16-bit):", firstPixels.join(" "));

      // Also show as binary to understand the RGBA5551 format
      if (pixelCount > 0) {
        const firstPixel = dataView.getUint16(0, true);
        console.log(
          `First pixel binary: ${firstPixel.toString(2).padStart(16, "0")}`
        );
        console.log(
          `First pixel breakdown: R=${firstPixel & 0x1f}, G=${
            (firstPixel >> 5) & 0x1f
          }, B=${(firstPixel >> 10) & 0x1f}, A=${(firstPixel >> 15) & 0x1}`
        );
      }
    }
  }

  private getFormatColor(format: number): { r: number; g: number; b: number } {
    // Different colors for different texture formats
    const formatColors = {
      1: { r: 255, g: 0, b: 0 }, // A3I5 - Red
      2: { r: 0, g: 255, b: 0 }, // 4-color - Green
      3: { r: 0, g: 0, b: 255 }, // 16-color - Blue
      4: { r: 255, g: 255, b: 0 }, // 256-color - Yellow
      5: { r: 255, g: 0, b: 255 }, // Compressed - Magenta
      6: { r: 0, g: 255, b: 255 }, // A5I3 - Cyan
      7: { r: 255, g: 128, b: 0 }, // Direct Color - Orange
    };

    return (
      formatColors[format as keyof typeof formatColors] || {
        r: 128,
        g: 128,
        b: 128,
      }
    );
  }

  private previewModel(filePath: string, fileData: ArrayBuffer) {
    console.log("3D Model file detected:", filePath);
    // You can add NSBMD model parsing here later
  }

  private tryAllTextureSizes(texture: NSBTXTexture, filePath: string) {
    // If the current texture doesn't look right, try different interpretations
    console.log("Trying different texture size interpretations...");

    const sizesToTry = [
      { width: 16, height: 16 },
      { width: 32, height: 32 },
      { width: 64, height: 64 },
      { width: 128, height: 128 },
      { width: 256, height: 256 },
    ];

    for (const size of sizesToTry) {
      const expectedSize = this.calculateTextureSize(
        size.width,
        size.height,
        texture.format
      );
      if (texture.data.length >= expectedSize) {
        console.log(`Trying ${size.width}x${size.height} interpretation...`);

        // Create a new texture with the different size
        const resizedTexture: NSBTXTexture = {
          ...texture,
          width: size.width,
          height: size.height,
          data: texture.data.slice(0, expectedSize),
          name: `${texture.name}_${size.width}x${size.height}`,
        };

        this.renderNSBTXTexture(resizedTexture, filePath);
        return; // Stop after first successful render
      }
    }

    console.log("No suitable texture size found");
  }

  private calculateTextureSize(
    width: number,
    height: number,
    format: number
  ): number {
    switch (format) {
      case 1:
      case 4:
      case 6:
        return width * height;
      case 2:
        return (width * height) / 4;
      case 3:
      case 5:
        return (width * height) / 2;
      case 7:
        return width * height * 2;
      default:
        return 0;
    }
  }
}

// Make FileBrowser globally accessible
(window as any).FileBrowser = FileBrowser;
