import { NitroFS } from "./core/NitroFS";
import { TEX0Renderer } from "./formats/3d/TEX0Renderer";
import { FileBrowser } from "./ui/FileBrowser";

class NitroFSApp {
  private nitroFS: NitroFS | null = null;
  private textureRenderer: TEX0Renderer;
  private fileBrowser: FileBrowser | null = null;

  constructor() {
    const canvas = document.getElementById(
      "texture-canvas"
    ) as HTMLCanvasElement;

    canvas.width = 512;
    canvas.height = 512;

    this.textureRenderer = new TEX0Renderer(canvas);
    this.setupEventListeners();

    this.testWebGL();
  }

  private setupEventListeners() {
    const fileInput = document.getElementById("rom-file") as HTMLInputElement;
    fileInput.addEventListener("change", (e) => this.loadROM(e));
  }

  private async loadROM(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      this.nitroFS = NitroFS.fromRom(arrayBuffer);
      console.log("ROM loaded successfully!");
      console.log("Game:", this.nitroFS.cartridgeHeader.gameTitle);

      this.renderFileBrowser();
    } catch (error) {
      console.error("Error loading ROM:", error);
    }
  }

  private testWebGL() {
    const width = 256;
    const height = 256;
    const textureData = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;

        const r = (x / width) * 255;
        const g = (y / height) * 255;
        const b = ((x + y) / (width + height)) * 255;

        textureData[index] = r;
        textureData[index + 1] = g;
        textureData[index + 2] = b;
        textureData[index + 3] = 255;
      }
    }

    this.textureRenderer.renderTextureData(textureData, width, height);
    console.log("Test texture rendered successfully!");
  }

  private renderFileBrowser() {
    if (!this.nitroFS) return;

    const fileBrowserContainer = document.getElementById("file-browser")!;
    this.fileBrowser = new FileBrowser(this.nitroFS, fileBrowserContainer);
    console.log("File system ready for browsing");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new NitroFSApp();
  (window as any).nitroFSApp = app;
});
