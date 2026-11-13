import { useEffect, useRef } from "react";

const VERTEX_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SOURCE = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_pointer;

float bayer4(vec2 p) {
  vec2 c = floor(mod(p, 4.0));
  int x = int(c.x);
  int y = int(c.y);
  int idx = x + y * 4;
  if (idx == 0) return 0.0 / 16.0;
  if (idx == 1) return 8.0 / 16.0;
  if (idx == 2) return 2.0 / 16.0;
  if (idx == 3) return 10.0 / 16.0;
  if (idx == 4) return 12.0 / 16.0;
  if (idx == 5) return 4.0 / 16.0;
  if (idx == 6) return 14.0 / 16.0;
  if (idx == 7) return 6.0 / 16.0;
  if (idx == 8) return 3.0 / 16.0;
  if (idx == 9) return 11.0 / 16.0;
  if (idx == 10) return 1.0 / 16.0;
  if (idx == 11) return 9.0 / 16.0;
  if (idx == 12) return 15.0 / 16.0;
  if (idx == 13) return 7.0 / 16.0;
  if (idx == 14) return 13.0 / 16.0;
  return 5.0 / 16.0;
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  vec2 ptr = vec2((u_pointer.x - 0.5) * aspect, (1.0 - u_pointer.y) - 0.5);

  float t = u_time * 0.35;
  float w1 = sin(p.x * 2.6 + t + cos(p.y * 2.1 - t * 0.7));
  float w2 = cos(p.y * 3.1 - t * 0.8 + sin(p.x * 1.9 + t * 0.5));
  float wave = 0.5 + 0.5 * sin(w1 * 1.2 + w2 * 1.1);

  float dist = length(p - ptr * 0.65);
  float glow = exp(-dist * 2.15);

  vec3 deep = vec3(0.082, 0.086, 0.255);
  vec3 indigo = vec3(0.247, 0.204, 0.635);
  vec3 violet = vec3(0.388, 0.298, 0.835);
  vec3 cyan = vec3(0.161, 0.659, 0.796);

  vec3 col = mix(deep, indigo, smoothstep(0.1, 0.9, uv.x * 0.7 + wave * 0.45));
  col = mix(col, violet, smoothstep(0.25, 0.95, wave * 0.72 + (1.0 - uv.y) * 0.25));
  col += cyan * glow * 0.26;
  col += violet * glow * 0.14;

  // Subtle star/particle flecks
  vec2 grid = floor(uv * vec2(36.0 * aspect, 36.0));
  vec2 local = fract(uv * vec2(36.0 * aspect, 36.0)) - 0.5;
  float h = hash21(grid);
  if (h > 0.94) {
    float twinkle = 0.5 + 0.5 * sin(u_time * 1.6 + h * 40.0);
    float dotMask = smoothstep(0.18, 0.02, length(local));
    col += vec3(0.75, 0.86, 1.0) * dotMask * twinkle * 0.35;
  }

  // Subtle 4x4 ordered dithering texture
  float dither = (bayer4(gl_FragCoord.xy) - 0.5) * 0.028;
  col = clamp(col + dither, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function HeroShader({
  paused,
  pointer,
}: {
  paused: boolean;
  pointer: { x: number; y: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef(pointer);
  pointerRef.current = pointer;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        powerPreference: "low-power",
      });
    } catch {
      gl = null;
    }
    if (!gl) return;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const positionLoc = gl.getAttribLocation(program, "a_position");
    const timeLoc = gl.getUniformLocation(program, "u_time");
    const resolutionLoc = gl.getUniformLocation(program, "u_resolution");
    const pointerLoc = gl.getUniformLocation(program, "u_pointer");

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl!.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);

    let raf = 0;
    const start = performance.now();
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (now: number) => {
      if (!gl) return;
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(timeLoc, paused || reduced ? 1.2 : (now - start) / 1000);
      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
      gl.uniform2f(pointerLoc, pointerRef.current.x, pointerRef.current.y);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!paused && !reduced) {
        raf = requestAnimationFrame(draw);
      }
    };

    draw(start);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      gl?.deleteBuffer(buffer);
      gl?.deleteShader(vs);
      gl?.deleteShader(fs);
      gl?.deleteProgram(program);
    };
  }, [paused]);

  return (
    <canvas
      ref={canvasRef}
      className="pq-hero-canvas"
      aria-hidden="true"
    />
  );
}

export function HeroSheets({
  paused,
  pointer,
}: {
  paused: boolean;
  pointer: { x: number; y: number };
}) {
  const rx = paused ? 0 : (0.5 - pointer.y) * 10;
  const ry = paused ? 0 : (pointer.x - 0.5) * 14;
  return (
    <div
      className="pq-hero-sheets"
      aria-hidden="true"
      style={
        {
          "--pq-rx": `${rx.toFixed(2)}deg`,
          "--pq-ry": `${ry.toFixed(2)}deg`,
        } as React.CSSProperties
      }
    >
      <div className="pq-sheet pq-sheet-back">
        <span className="pq-sheet-ring" />
        <span className="pq-sheet-lines" />
      </div>
      <div className="pq-sheet pq-sheet-mid">
        <span className="pq-sheet-ring" />
        <span className="pq-sheet-lines" />
      </div>
      <div className="pq-sheet pq-sheet-front">
        <span className="pq-sheet-ring" />
        <span className="pq-sheet-lines" />
      </div>
    </div>
  );
}
