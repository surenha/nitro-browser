// webgl-viewer.ts: Standalone raw-WebGL2 3D model viewer. Decodes NDS TEX0
// texture formats (A3I5, 4/16/256-color paletted, 4x4 block-compressed, A5I3,
// direct RGB555) into RGBA, uploads decoded MDL0 shape meshes, and renders
// them with a hand-written GLSL shader plus a mouse-orbit camera. Opens as a
// modal overlay so it sits alongside the existing NSBMD info panel rather
// than replacing it.

import type { MDL0Model, TEX0Texture, TEX0Palette } from "../filetypes/nsbmd.js";
import { decodeShapeMesh, type DecodedMesh } from "../filetypes/g3d-geometry.js";

function decodeTexture(tex: TEX0Texture, palette: TEX0Palette | undefined): Uint8Array {
  const w = tex.realWidth;
  const h = tex.realHeight;
  const out = new Uint8Array(w * h * 4);
  const pal = palette ? palette.data : new Uint16Array([0x7c00]);

  function setPixel(x: number, y: number, r: number, g: number, b: number, a: number) {
    const i = (y * w + x) * 4;
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }

  function rgb555(word: number): [number, number, number] {
    const r = (word & 0x1f) * 8;
    const g = ((word >> 5) & 0x1f) * 8;
    const b = ((word >> 10) & 0x1f) * 8;
    return [r, g, b];
  }

  if (tex.format === 7) {
    const view = new DataView(tex.data.buffer, tex.data.byteOffset, tex.data.byteLength);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (idx * 2 + 2 > tex.data.length) continue;
        const word = view.getUint16(idx * 2, true);
        const [r, g, b] = rgb555(word);
        const a = word & 0x8000 ? 255 : 0;
        setPixel(x, y, r, g, b, a);
      }
    }
  } else if (tex.format === 4) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (idx >= tex.data.length) continue;
        const palIdx = tex.data[idx];
        const [r, g, b] = rgb555(pal[palIdx] || 0);
        setPixel(x, y, r, g, b, palIdx === 0 ? 0 : 255);
      }
    }
  } else if (tex.format === 3) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const byte = tex.data[idx >> 1];
        if (byte === undefined) continue;
        const palIdx = idx % 2 === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
        const [r, g, b] = rgb555(pal[palIdx] || 0);
        setPixel(x, y, r, g, b, palIdx === 0 ? 0 : 255);
      }
    }
  } else if (tex.format === 2) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const byte = tex.data[idx >> 2];
        if (byte === undefined) continue;
        const shift = (idx % 4) * 2;
        const palIdx = (byte >> shift) & 0x03;
        const [r, g, b] = rgb555(pal[palIdx] || 0);
        setPixel(x, y, r, g, b, palIdx === 0 ? 0 : 255);
      }
    }
  } else if (tex.format === 1) {
    const alphaTable = [0, 36, 73, 109, 146, 182, 219, 255];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const byte = tex.data[idx];
        if (byte === undefined) continue;
        const palIdx = byte & 0x1f;
        const alpha = alphaTable[(byte >> 5) & 0x07];
        const [r, g, b] = rgb555(pal[palIdx] || 0);
        setPixel(x, y, r, g, b, alpha);
      }
    }
  } else if (tex.format === 6) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const byte = tex.data[idx];
        if (byte === undefined) continue;
        const palIdx = byte & 0x07;
        const alpha = Math.round(((byte >> 3) & 0x1f) * (255 / 31));
        const [r, g, b] = rgb555(pal[palIdx] || 0);
        setPixel(x, y, r, g, b, alpha);
      }
    }
  } else if (tex.format === 5) {
    const view = new DataView(tex.data.buffer, tex.data.byteOffset, tex.data.byteLength);
    const blocksW = w / 4;
    const blocksH = h / 4;
    for (let by = 0; by < blocksH; by++) {
      for (let bx = 0; bx < blocksW; bx++) {
        const blockIdx = by * blocksW + bx;
        const blockOffset = blockIdx * 4;
        if (blockOffset + 4 > tex.data.length) continue;
        const block = view.getUint32(blockOffset, true);
        for (let py = 0; py < 4; py++) {
          for (let px = 0; px < 4; px++) {
            const texel = (block >> ((py * 4 + px) * 2)) & 0x03;
            const [r, g, b, a] = texel === 0 ? [128, 128, 128, 255] : texel === 3 ? [0, 0, 0, 0] : [80, 80, 80, 255];
            setPixel(bx * 4 + px, by * 4 + py, r, g, b, a);
          }
        }
      }
    }
  } else {
    out.fill(180);
  }

  return out;
}

const VERT_SRC = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in vec3 aColor;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
out vec3 vNormal;
out vec2 vUV;
out vec3 vColor;
void main() {
  vec4 worldPos = uModel * vec4(aPos, 1.0);
  gl_Position = uProj * uView * worldPos;
  vNormal = mat3(uModel) * aNormal;
  vUV = aUV;
  vColor = aColor;
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUV;
in vec3 vColor;
uniform sampler2D uTex;
uniform bool uHasTex;
uniform vec3 uLightDir;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, normalize(uLightDir)), 0.0);
  float light = 0.45 + 0.55 * diff;
  vec4 base = uHasTex ? texture(uTex, vUV) : vec4(vColor, 1.0);
  if (base.a < 0.05) discard;
  outColor = vec4(base.rgb * light, base.a);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function buildProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

function mat4Perspective(fovyRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovyRad / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function mat4LookAt(eye: [number, number, number], target: [number, number, number], up: [number, number, number]): Float32Array {
  const z = normalize(sub(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  const out = new Float32Array(16);
  out[0] = x[0];
  out[1] = y[0];
  out[2] = z[0];
  out[4] = x[1];
  out[5] = y[1];
  out[6] = z[1];
  out[8] = x[2];
  out[9] = y[2];
  out[10] = z[2];
  out[12] = -dot(x, eye);
  out[13] = -dot(y, eye);
  out[14] = -dot(z, eye);
  out[15] = 1;
  return out;
}

function sub(a: number[], b: number[]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize(v: number[]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

interface MeshBuffers {
  vao: WebGLVertexArrayObject;
  indexCount: number;
  texture: WebGLTexture | null;
}

export interface ModelViewerInput {
  model: MDL0Model;
  meshesByShapeName: Map<string, DecodedMesh>;
  textures: TEX0Texture[];
  palettes: TEX0Palette[];
}

export function openModelViewer(input: ModelViewerInput): void {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;";

  const panel = document.createElement("div");
  panel.style.cssText = "background:#1e1e1e;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;";

  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;color:#eee;font-family:system-ui,sans-serif;";
  header.innerHTML = `<strong>${input.model.name}</strong>`;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.style.cssText = "background:#333;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 10px;cursor:pointer;";
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(closeBtn);

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  canvas.style.cssText = "background:#111;border-radius:4px;cursor:grab;";

  panel.appendChild(header);
  panel.appendChild(canvas);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const glCtx = canvas.getContext("webgl2");
  if (!glCtx) {
    alert("WebGL2 is not available in this browser.");
    overlay.remove();
    return;
  }
  const gl: WebGL2RenderingContext = glCtx;

  const program = buildProgram(gl);
  const uModel = gl.getUniformLocation(program, "uModel")!;
  const uView = gl.getUniformLocation(program, "uView")!;
  const uProj = gl.getUniformLocation(program, "uProj")!;
  const uTex = gl.getUniformLocation(program, "uTex")!;
  const uHasTex = gl.getUniformLocation(program, "uHasTex")!;
  const uLightDir = gl.getUniformLocation(program, "uLightDir")!;

  const texByName = new Map(input.textures.map((t) => [t.name, t]));
  const palByName = new Map(input.palettes.map((p) => [p.name, p]));

  const meshes: MeshBuffers[] = [];
  let boundsMin = [Infinity, Infinity, Infinity];
  let boundsMax = [-Infinity, -Infinity, -Infinity];

  for (const shape of input.model.shapes) {
    const mesh = input.meshesByShapeName.get(shape.name);
    if (!mesh || mesh.indices.length === 0) continue;

    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        boundsMin[k] = Math.min(boundsMin[k], mesh.positions[i + k]);
        boundsMax[k] = Math.max(boundsMax[k], mesh.positions[i + k]);
      }
    }

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    function attrib(loc: number, data: Float32Array, size: number) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }

    attrib(0, mesh.positions, 3);
    attrib(1, mesh.normals, 3);
    attrib(2, mesh.uvs, 2);
    attrib(3, mesh.colors, 3);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    const material = input.model.materials.find((m) => true);
    let texture: WebGLTexture | null = null;
    const matchTex = input.model.materials.length > 0 ? texByName.get(input.model.materials[0].name) : undefined;
    const anyTex = matchTex || input.textures[0];
    if (anyTex) {
      const anyPal = palByName.get(anyTex.name) || input.palettes[0];
      const rgba = decodeTexture(anyTex, anyPal);
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, anyTex.realWidth, anyTex.realHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }
    void material;

    meshes.push({ vao, indexCount: mesh.indices.length, texture });
  }

  gl.bindVertexArray(null);

  console.log(`[webgl-viewer] ${input.model.name}: ${meshes.length} mesh(es), bounds`, boundsMin, boundsMax);

  if (meshes.length === 0 || !isFinite(boundsMin[0])) {
    alert(`No renderable geometry was decoded for "${input.model.name}" — its shape display lists may use an opcode this decoder doesn't handle yet.`);
  }

  const center: [number, number, number] = [(boundsMin[0] + boundsMax[0]) / 2, (boundsMin[1] + boundsMax[1]) / 2, (boundsMin[2] + boundsMax[2]) / 2];
  const radius = Math.max(1, Math.hypot(boundsMax[0] - boundsMin[0], boundsMax[1] - boundsMin[1], boundsMax[2] - boundsMin[2]) / 2);

  let yaw = 0.6;
  let pitch = 0.4;
  let dist = radius * 2.5;
  let dragging = false;
  let lastX = 0,
    lastY = 0;

  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = "grabbing";
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    canvas.style.cursor = "grab";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.01;
    pitch += (e.clientY - lastY) * 0.01;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    dist = Math.max(radius * 0.3, Math.min(radius * 10, dist + e.deltaY * 0.01 * radius));
  });

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.15, 0.15, 0.18, 1);

  function frame() {
    if (!overlay.isConnected) return;
    const eye: [number, number, number] = [center[0] + dist * Math.cos(pitch) * Math.sin(yaw), center[1] + dist * Math.sin(pitch), center[2] + dist * Math.cos(pitch) * Math.cos(yaw)];
    const view = mat4LookAt(eye, center, [0, 1, 0]);
    const proj = mat4Perspective((45 * Math.PI) / 180, canvas.width / canvas.height, 0.01, radius * 50);

    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    gl!.useProgram(program);
    gl!.uniformMatrix4fv(uModel, false, mat4Identity());
    gl!.uniformMatrix4fv(uView, false, view);
    gl!.uniformMatrix4fv(uProj, false, proj);
    gl!.uniform3f(uLightDir, 0.4, 0.8, 0.5);

    for (const m of meshes) {
      gl!.bindVertexArray(m.vao);
      if (m.texture) {
        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, m.texture);
        gl!.uniform1i(uTex, 0);
        gl!.uniform1i(uHasTex, 1);
      } else {
        gl!.uniform1i(uHasTex, 0);
      }
      gl!.drawElements(gl!.TRIANGLES, m.indexCount, gl!.UNSIGNED_INT, 0);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function mat4Identity(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function buildMeshesForModel(model: MDL0Model, data: Uint8Array, view: DataView): Map<string, DecodedMesh> {
  const out = new Map<string, DecodedMesh>();
  for (const shape of model.shapes) {
    out.set(shape.name, decodeShapeMesh(data, view, shape.displayListOffset, shape.displayListSize));
  }
  return out;
}
