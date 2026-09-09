// g3d-geometry.ts: Decodes an NDS GX display list (the byte stream referenced by
// MDL0Shape.displayListOffset) into flat vertex/index buffers ready for WebGL.
// Executes the real GX opcode set (MTX_*, COLOR, NORMAL, TEXCOORD, VTX_*,
// BEGIN_VTXS/END_VTXS) rather than treating it as opaque data. Positions are
// s19.12 fixed point, normals s1.9, texcoords s11.4 per the NDS GX spec.
// Matrix ops (MTX_LOAD/MTX_MULT/MTX_SCALE/MTX_TRANS) baked directly into a
// shape's own display list are applied; bone/joint matrices sourced from the
// MDL0 NODE section are not decoded, so multi-bone skinned animation is out
// of scope here — static or single-pose meshes come out correctly positioned.

export interface DecodedMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

type Mat4 = Float32Array;

function mat4Identity(): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function mat4FromScale(sx: number, sy: number, sz: number): Mat4 {
  const m = mat4Identity();
  m[0] = sx;
  m[5] = sy;
  m[10] = sz;
  return m;
}

function mat4FromTranslation(tx: number, ty: number, tz: number): Mat4 {
  const m = mat4Identity();
  m[12] = tx;
  m[13] = ty;
  m[14] = tz;
  return m;
}

function mat4TransformPoint(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

function mat4TransformDir(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
}

const PARAM_COUNTS: { [opcode: number]: number } = {
  0x00: 0,
  0x10: 1,
  0x11: 0,
  0x12: 1,
  0x13: 1,
  0x14: 1,
  0x15: 0,
  0x16: 16,
  0x17: 12,
  0x18: 16,
  0x19: 12,
  0x1a: 9,
  0x1b: 3,
  0x1c: 3,
  0x20: 1,
  0x21: 1,
  0x22: 1,
  0x23: 2,
  0x24: 1,
  0x25: 1,
  0x26: 1,
  0x27: 1,
  0x28: 1,
  0x29: 1,
  0x2a: 1,
  0x2b: 1,
  0x30: 1,
  0x31: 1,
  0x32: 1,
  0x33: 1,
  0x34: 32,
  0x40: 1,
  0x41: 0,
  0x50: 1,
  0x60: 1,
};

function fx1912(raw: number): number {
  const signed = raw & 0x80000000 ? raw - 0x100000000 : raw;
  return signed / 4096;
}

function fx16_412(raw: number): number {
  const signed = raw & 0x8000 ? raw - 0x10000 : raw;
  return signed / 4096;
}

function fxVtx10(raw: number): number {
  const signed = raw & 0x200 ? raw - 0x400 : raw;
  return signed / 64;
}

function fxVtxDiff(raw: number): number {
  const signed = raw & 0x200 ? raw - 0x400 : raw;
  return signed / 4096;
}

function fx10_19(raw: number): number {
  const signed = raw & 0x200 ? raw - 0x400 : raw;
  return signed / 512;
}

function fxTex(raw: number): number {
  const signed = raw & 0x8000 ? raw - 0x10000 : raw;
  return signed / 16;
}

interface RawVertex {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  u: number;
  v: number;
  r: number;
  g: number;
  b: number;
}

export function decodeShapeMesh(data: Uint8Array, view: DataView, offset: number, size: number): DecodedMesh {
  const end = Math.min(offset + size, view.byteLength);
  let ptr = offset;

  let mtxStack: Mat4[] = new Array(32).fill(null).map(() => mat4Identity());
  let mtxSp = 0;
  let curMtx: Mat4 = mat4Identity();

  let curNormal: [number, number, number] = [0, 0, 1];
  let curUV: [number, number] = [0, 0];
  let curColor: [number, number, number] = [1, 1, 1];

  let lastVX = 0,
    lastVY = 0,
    lastVZ = 0;

  let primType = -1;
  let primVerts: RawVertex[] = [];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  function pushVertex(v: RawVertex) {
    const idx = positions.length / 3;
    positions.push(v.x, v.y, v.z);
    normals.push(v.nx, v.ny, v.nz);
    uvs.push(v.u, v.v);
    colors.push(v.r, v.g, v.b);
    return idx;
  }

  function flushPrimitive() {
    if (primVerts.length === 0) return;
    const base = positions.length / 3;
    const startIdx: number[] = [];
    for (const v of primVerts) startIdx.push(pushVertex(v));

    if (primType === 0) {
      for (let i = 0; i + 2 < startIdx.length; i += 3) {
        indices.push(startIdx[i], startIdx[i + 1], startIdx[i + 2]);
      }
    } else if (primType === 1) {
      for (let i = 0; i + 3 < startIdx.length; i += 4) {
        indices.push(startIdx[i], startIdx[i + 1], startIdx[i + 2]);
        indices.push(startIdx[i], startIdx[i + 2], startIdx[i + 3]);
      }
    } else if (primType === 2) {
      for (let i = 0; i + 2 < startIdx.length; i++) {
        if (i % 2 === 0) indices.push(startIdx[i], startIdx[i + 1], startIdx[i + 2]);
        else indices.push(startIdx[i + 1], startIdx[i], startIdx[i + 2]);
      }
    } else if (primType === 3) {
      for (let i = 0; i + 3 < startIdx.length; i += 2) {
        indices.push(startIdx[i], startIdx[i + 1], startIdx[i + 2]);
        indices.push(startIdx[i + 2], startIdx[i + 1], startIdx[i + 3]);
      }
    }

    void base;
    primVerts = [];
  }

  function addVertex(x: number, y: number, z: number) {
    lastVX = x;
    lastVY = y;
    lastVZ = z;
    const [tx, ty, tz] = mat4TransformPoint(curMtx, x, y, z);
    const [nx, ny, nz] = mat4TransformDir(curMtx, curNormal[0], curNormal[1], curNormal[2]);
    primVerts.push({ x: tx, y: ty, z: tz, nx, ny, nz, u: curUV[0], v: curUV[1], r: curColor[0], g: curColor[1], b: curColor[2] });
  }

  function execCommand(opcode: number, params: number[]) {
    switch (opcode) {
      case 0x11: {
        mtxStack[mtxSp] = curMtx;
        mtxSp = Math.min(mtxSp + 1, 31);
        break;
      }
      case 0x12: {
        const n = params[0] & 0x3f;
        const signedN = n & 0x20 ? n - 0x40 : n;
        mtxSp = Math.max(0, Math.min(31, mtxSp - signedN));
        curMtx = mtxStack[mtxSp];
        break;
      }
      case 0x13: {
        mtxStack[params[0] & 0x1f] = curMtx;
        break;
      }
      case 0x14: {
        curMtx = mtxStack[params[0] & 0x1f];
        break;
      }
      case 0x15: {
        curMtx = mat4Identity();
        break;
      }
      case 0x16: {
        const m = new Float32Array(16);
        for (let i = 0; i < 16; i++) m[i] = fx1912(params[i]);
        curMtx = m;
        break;
      }
      case 0x17: {
        const m = mat4Identity();
        for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] = fx1912(params[c * 3 + r]);
        curMtx = m;
        break;
      }
      case 0x18: {
        const m = new Float32Array(16);
        for (let i = 0; i < 16; i++) m[i] = fx1912(params[i]);
        curMtx = mat4Multiply(curMtx, m);
        break;
      }
      case 0x19: {
        const m = mat4Identity();
        for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] = fx1912(params[c * 3 + r]);
        curMtx = mat4Multiply(curMtx, m);
        break;
      }
      case 0x1a: {
        const m = mat4Identity();
        for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] = fx1912(params[c * 3 + r]);
        curMtx = mat4Multiply(curMtx, m);
        break;
      }
      case 0x1b: {
        curMtx = mat4Multiply(curMtx, mat4FromScale(fx1912(params[0]), fx1912(params[1]), fx1912(params[2])));
        break;
      }
      case 0x1c: {
        curMtx = mat4Multiply(curMtx, mat4FromTranslation(fx1912(params[0]), fx1912(params[1]), fx1912(params[2])));
        break;
      }
      case 0x20: {
        const c = params[0] & 0x7fff;
        curColor = [(c & 0x1f) / 31, ((c >> 5) & 0x1f) / 31, ((c >> 10) & 0x1f) / 31];
        break;
      }
      case 0x21: {
        const p = params[0];
        const nx = fx10_19(p & 0x3ff);
        const ny = fx10_19((p >> 10) & 0x3ff);
        const nz = fx10_19((p >> 20) & 0x3ff);
        curNormal = [nx, ny, nz];
        break;
      }
      case 0x22: {
        const p = params[0];
        curUV = [fxTex(p & 0xffff), fxTex((p >> 16) & 0xffff)];
        break;
      }
      case 0x23: {
        const x = fx16_412(params[0] & 0xffff);
        const y = fx16_412((params[0] >> 16) & 0xffff);
        const z = fx16_412(params[1] & 0xffff);
        addVertex(x, y, z);
        break;
      }
      case 0x24: {
        const p = params[0];
        addVertex(fxVtx10(p & 0x3ff), fxVtx10((p >> 10) & 0x3ff), fxVtx10((p >> 20) & 0x3ff));
        break;
      }
      case 0x25: {
        addVertex(fx16_412(params[0] & 0xffff), fx16_412((params[0] >> 16) & 0xffff), lastVZ);
        break;
      }
      case 0x26: {
        addVertex(fx16_412(params[0] & 0xffff), lastVY, fx16_412((params[0] >> 16) & 0xffff));
        break;
      }
      case 0x27: {
        addVertex(lastVX, fx16_412(params[0] & 0xffff), fx16_412((params[0] >> 16) & 0xffff));
        break;
      }
      case 0x28: {
        const p = params[0];
        addVertex(lastVX + fxVtxDiff(p & 0x3ff), lastVY + fxVtxDiff((p >> 10) & 0x3ff), lastVZ + fxVtxDiff((p >> 20) & 0x3ff));
        break;
      }
      case 0x40: {
        flushPrimitive();
        primType = params[0] & 0x03;
        break;
      }
      case 0x41: {
        flushPrimitive();
        primType = -1;
        break;
      }
      default:
        break;
    }
  }

  while (ptr + 4 <= end) {
    const groupWord = view.getUint32(ptr, true);
    ptr += 4;
    const cmds = [groupWord & 0xff, (groupWord >> 8) & 0xff, (groupWord >> 16) & 0xff, (groupWord >> 24) & 0xff];

    for (const opcode of cmds) {
      if (opcode === 0x00) continue;
      if (!(opcode in PARAM_COUNTS)) {
        ptr = end;
        break;
      }
      const paramCount = PARAM_COUNTS[opcode];
      const params: number[] = [];
      for (let i = 0; i < paramCount; i++) {
        if (ptr + 4 > end) break;
        params.push(view.getUint32(ptr, true));
        ptr += 4;
      }
      if (params.length < paramCount) {
        ptr = end;
        break;
      }
      execCommand(opcode, params);
    }
  }
  flushPrimitive();

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}
