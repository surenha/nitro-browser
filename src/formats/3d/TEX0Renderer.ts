import { TEX0 } from "./TEX0";
import { TextureRenderer } from "../../webgl/TextureRenderer";

export class TEX0Renderer {
  private renderer: TextureRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new TextureRenderer(canvas);
  }

  public renderTEX0(tex0: TEX0, textureIndex: number = 0) {
    const textureData = tex0.parseTexture(textureIndex);
    const textureInfo = tex0.textureInfo.entries[textureIndex];
    this.renderer.renderTexture(
      textureData,
      textureInfo.width,
      textureInfo.height
    );
  }

  // Add a direct method to render any texture data for testing
  public renderTextureData(
    textureData: Uint8Array,
    width: number,
    height: number
  ) {
    this.renderer.renderTexture(textureData, width, height);
  }

  public cleanup() {
    this.renderer.cleanup();
  }
}
