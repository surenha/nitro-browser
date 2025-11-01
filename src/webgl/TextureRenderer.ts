export class TextureRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      throw new Error("WebGL2 not supported");
    }
    this.gl = gl;
    this.program = this.createProgram();
    this.setupBuffers();
  }

  private createProgram(): WebGLProgram {
    // Note: #version MUST be on the first line with no whitespace before it
    const vertexShader = this.compileShader(
      this.gl.VERTEX_SHADER,
      `#version 300 es
in vec2 aPosition;
out vec2 vTexCoord;
void main() {
    vTexCoord = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`
    );

    const fragmentShader = this.compileShader(
      this.gl.FRAGMENT_SHADER,
      `#version 300 es
precision mediump float;
in vec2 vTexCoord;
uniform sampler2D uTexture;
out vec4 fragColor;
void main() {
    fragColor = texture(uTexture, vTexCoord);
}`
    );

    const program = this.gl.createProgram();
    if (!program) throw new Error("Failed to create program");

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(
        "Program link error: " + this.gl.getProgramInfoLog(program)
      );
    }

    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    return program;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error("Failed to create shader");

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const shaderType = type === this.gl.VERTEX_SHADER ? "VERTEX" : "FRAGMENT";
      throw new Error(
        `${shaderType} Shader compile error: ${this.gl.getShaderInfoLog(
          shader
        )}\nSource:\n${source}`
      );
    }

    return shader;
  }

  private setupBuffers() {
    // Vertex data for a full-screen quad (two triangles)
    const vertices = new Float32Array([
      -1.0,
      -1.0, // bottom left
      1.0,
      -1.0, // bottom right
      -1.0,
      1.0, // top left
      -1.0,
      1.0, // top left
      1.0,
      -1.0, // bottom right
      1.0,
      1.0, // top right
    ]);

    // Create and bind VAO
    this.vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vao);

    // Create and bind VBO
    this.vbo = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

    // Set up vertex attributes
    const positionLocation = this.gl.getAttribLocation(
      this.program,
      "aPosition"
    );
    if (positionLocation === -1) {
      throw new Error("Could not find aPosition attribute");
    }

    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(
      positionLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    // Unbind
    this.gl.bindVertexArray(null);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  }

  public renderTexture(textureData: Uint8Array, width: number, height: number) {
    // Set viewport to match texture dimensions
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

    // Create or update texture
    if (!this.texture) {
      this.texture = this.gl.createTexture();
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      textureData
    );

    // Set texture parameters
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.LINEAR
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE
    );

    // Clear and render
    this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.useProgram(this.program);
    this.gl.bindVertexArray(this.vao);

    // Set texture uniform
    const textureLocation = this.gl.getUniformLocation(
      this.program,
      "uTexture"
    );
    this.gl.uniform1i(textureLocation, 0);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

    // Clean up
    this.gl.bindVertexArray(null);
  }

  public cleanup() {
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.vbo) this.gl.deleteBuffer(this.vbo);
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
