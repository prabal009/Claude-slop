import * as THREE from 'three';

export interface OperationsScene {
  setPointer(x: number, y: number): void;
  setProgress(progress: number): void;
  setAvailable(available: boolean): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

const vertexShader = `
  uniform float uTime;
  uniform float uAvailable;
  uniform vec2 uPointer;
  varying vec2 vUv;
  varying float vHeight;
  // Smooth three-dimensional value noise keeps the sheet organic, not a rigid flag.
  float hash(vec3 p) {
    p = fract(p * .3183099 + vec3(.13, .37, .71));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float organic3D(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
      mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
      mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vUv = uv;
    vec3 p = position;
    float edge = smoothstep(.0, 1.0, uv.x);
    float organic = organic3D(vec3(p.xy * 1.65, uTime * .18));
    p.z += (organic - .5) * (.28 + .15 * uAvailable);
    p.z += edge * edge * .34 + uPointer.x * p.x * .065;
    p.y += sin(uv.x * 3.14159) * uPointer.y * .06;
    vHeight = p.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const fragmentShader = `
  uniform float uAvailable;
  varying vec2 vUv;
  varying float vHeight;
  float dither(vec2 pixel) {
    vec2 p = mod(floor(pixel), 4.0);
    return (4.0 * (2.0 * mod(p.x, 2.0) + mod(p.y, 2.0))
      + 2.0 * floor(p.x / 2.0) + floor(p.y / 2.0) + .5) / 16.0;
  }
  void main() {
    vec3 paper = vec3(.96, .975, 1.0);
    vec3 ink = mix(vec3(.25,.24,.59), vec3(.04,.43,.46), .35 + .25 * uAvailable);
    float inside = step(.12, vUv.x) * step(vUv.x, .88);
    float line = step(.89, fract(vUv.y * 27.0));
    float body = step(.22, vUv.y) * step(vUv.y, .69);
    float rag = step(vUv.x, .74 + .1 * sin(floor(vUv.y * 27.0) * 2.7));
    float heading = step(.77,vUv.y) * step(vUv.y,.815) * step(vUv.x,.68);
    float rule = step(.73,vUv.y) * step(vUv.y,.735);
    float mark = inside * (line * body * rag * .4 + heading + rule * .6);
    float tone = floor((.15 + vHeight * .6) * 6.0 + dither(gl_FragCoord.xy / 1.25)) / 6.0;
    vec3 color = mix(paper, ink, clamp(tone,0.0,.5) * .55);
    color = mix(color, ink, clamp(mark,0.0,1.0));
    gl_FragColor = vec4(color,1.0);
  }
`;
const particleVertex = `
  uniform float uTime;
  uniform float uAvailable;
  attribute float aSeed;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * .23 + aSeed * 13.0) * .12 * uAvailable;
    p.x += cos(uTime * .18 + aSeed * 21.0) * .09 * uAvailable;
    vAlpha = .15 + .18 * aSeed;
    gl_PointSize = 1.5 + aSeed * 1.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
  }
`;
const particleFragment = `
  varying float vAlpha;
  void main() {
    if (distance(gl_PointCoord, vec2(.5)) > .45) discard;
    gl_FragColor = vec4(.57,.83,.83,vAlpha);
  }
`;

/** One sheet and 40 ink flecks; no hardware controls or operational timers. */
export function createOperationsScene(host: HTMLElement, onUnavailable: () => void): OperationsScene {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, .1, 30);
  camera.position.z = 6.6;
  const uniforms = { uTime: { value: 0 }, uAvailable: { value: 1 }, uPointer: { value: new THREE.Vector2() } };
  const geometry = new THREE.PlaneGeometry(2.25, 3.05, 36, 44);
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, side: THREE.DoubleSide });
  const sheet = new THREE.Mesh(geometry, material);
  sheet.rotation.set(-.12, -.23, -.20);
  scene.add(sheet);
  const positions = new Float32Array(40 * 3);
  const seeds = new Float32Array(40);
  for (let i = 0; i < 40; i++) {
    const seed = (i * .61803398875) % 1;
    positions[i * 3] = (seed - .5) * 4.4;
    positions[i * 3 + 1] = (((i * .381966) % 1) - .5) * 3.7;
    positions[i * 3 + 2] = -.3 - ((i * .17) % 1);
    seeds[i] = seed;
  }
  const particlesGeometry = new THREE.BufferGeometry();
  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particlesGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const particlesMaterial = new THREE.ShaderMaterial({ vertexShader: particleVertex, fragmentShader: particleFragment, uniforms, transparent: true, depthWrite: false });
  scene.add(new THREE.Points(particlesGeometry, particlesMaterial));
  let disposed = false;
  let paused = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let slowFrames = 0;
  let samples = 0;
  let totalFrameTime = 0;
  let previousFrame = 0;
  let shaderFailed = false;
  renderer.debug.onShaderError = () => { shaderFailed = true; };
  const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; previousFrame = 0; samples = 0; totalFrameTime = 0; slowFrames = 0; };
  const fail = () => { if (!disposed) { dispose(); onUnavailable(); } };
  const render = (now: number) => {
    frame = 0;
    if (disposed || paused || !visible || document.hidden) return;
    // Eligible desktops target 60fps; assess delivery separately from the ceiling.
    if (previousFrame) {
      totalFrameTime += now - previousFrame;
      samples++;
      if (samples >= 90) {
        slowFrames = totalFrameTime / samples > 50 ? slowFrames + 1 : 0;
        samples = 0;
        totalFrameTime = 0;
        if (slowFrames >= 2) { fail(); return; }
      }
    }
    previousFrame = now;
    if (!last || now - last >= 1000 / 60 - 1) {
      if (last) uniforms.uTime.value += Math.min((now - last) / 1000, .1);
      last = now;
      try {
        renderer.render(scene, camera);
        if (shaderFailed) { fail(); return; }
      } catch { fail(); return; }
    }
    frame = requestAnimationFrame(render);
  };
  const synchronize = () => {
    if (disposed) return;
    if (paused || !visible || document.hidden) stop();
    else if (!frame) frame = requestAnimationFrame(render);
  };
  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, Math.min(host.clientWidth, 720));
    const height = Math.max(1, Math.min(host.clientHeight, 320));
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    try {
      renderer.render(scene, camera);
      if (shaderFailed) fail();
    } catch { fail(); }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; synchronize(); });
  intersection.observe(host);
  const contextLost = (event: Event) => { event.preventDefault(); fail(); };
  canvas.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', synchronize);
  resize();
  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    observer.disconnect();
    intersection.disconnect();
    document.removeEventListener('visibilitychange', synchronize);
    canvas.removeEventListener('webglcontextlost', contextLost);
    geometry.dispose();
    material.dispose();
    particlesGeometry.dispose();
    particlesMaterial.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
  return {
    setPointer(x, y) { if (!disposed) uniforms.uPointer.value.set(x, y); },
    setProgress(progress) { if (!disposed) sheet.rotation.x = -.12 + Math.max(0, Math.min(1, progress)) * .16; },
    setAvailable(available) { uniforms.uAvailable.value = available ? 1 : 0; },
    setPaused(value) { paused = value; synchronize(); },
    dispose,
  };
}
