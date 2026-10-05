/**
 * Liquid aurora background. A tiny WebGL shader renders domain-warped noise at ~1/8 resolution;
 * each of the five colours gets a slowly drifting weight and a sharpened softmax lets only one or
 * two dominate at any moment. Pauses when hidden, caps at ~30 fps, and renders a single still frame
 * when reduced motion is requested. Falls back to a CSS gradient without WebGL.
 */
import { prefersReducedMotion } from '../core/dom.js';

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uT;
uniform vec3 uC[5];
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = vec2(uv.x * uRes.x / uRes.y, uv.y) * 1.6;
  float t = uT;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.9)), fbm(p + vec2(5.2, -t * 0.7)));
  vec2 r = vec2(fbm(p + 2.2 * q + vec2(1.7, 9.2) + t * 0.35), fbm(p + 2.2 * q + vec2(8.3, 2.8) - t * 0.3));
  float field = fbm(p + 2.6 * r);
  vec3 acc = vec3(0.0); float wsum = 0.0;
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    float local = fbm(p * 0.9 + r * 1.6 + vec2(fi * 3.7, fi * 1.9));
    float global = sin(t * 0.55 + fi * 1.2566) * 0.55;   // which colours lead right now
    float w = exp(4.2 * (local + global));
    acc += uC[i] * w; wsum += w;
  }
  vec3 col = acc / wsum;
  vec3 base = vec3(0.972, 0.978, 0.992);
  float strength = 0.55 + 0.3 * smoothstep(0.2, 0.85, field);
  col = mix(base, col, strength);
  col += (hash(gl_FragCoord.xy + t) - 0.5) * 0.012; // dither against banding
  gl_FragColor = vec4(col, 1.0);
}`;
const VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

function hexToVec(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function startAurora(canvas, colors) {
  const gl = canvas.getContext('webgl', { antialias: false, depth: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (!gl) {
    canvas.replaceWith(Object.assign(document.createElement('div'), { className: 'aurora-fallback' }));
    return () => {};
  }
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return () => {};
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uT = gl.getUniformLocation(prog, 'uT');
  gl.uniform3fv(gl.getUniformLocation(prog, 'uC'), new Float32Array(colors.slice(0, 5).flatMap(hexToVec)));

  const SCALE = 8;
  const resize = () => {
    const w = Math.max(32, Math.round(innerWidth / SCALE)), hgt = Math.max(32, Math.round(innerHeight / SCALE));
    if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt; gl.viewport(0, 0, w, hgt); }
    gl.uniform2f(uRes, w, hgt);
  };
  resize();
  addEventListener('resize', resize);

  const seed = (Date.now() / 1000) % 1000;
  let raf = 0, last = 0, running = true;
  const draw = (now) => {
    gl.uniform1f(uT, seed + now / 1000 * 0.045);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const loop = (now) => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    draw(now);
  };
  const still = prefersReducedMotion();
  if (still) draw(0); else raf = requestAnimationFrame(loop);
  const onVis = () => {
    if (still) return;
    running = !document.hidden;
    if (running) raf = requestAnimationFrame(loop); else cancelAnimationFrame(raf);
  };
  document.addEventListener('visibilitychange', onVis);
  return () => { running = false; cancelAnimationFrame(raf); removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis); };
}
