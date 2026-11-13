import * as THREE from 'three';

export interface PaperScene {
  setProgress: (progress: number) => void;
  setPointer: (x: number, y: number) => void;
  setPaused: (paused: boolean) => void;
  dispose: () => void;
}

const vertexShader = `
  uniform float uTime;
  uniform float uProgress;
  uniform float uLayer;
  uniform vec2 uPointer;
  varying vec2 vUv;
  varying float vFold;
  void main() {
    vUv = uv;
    vec3 p = position;
    float edge = pow(uv.x, 2.0);
    float wave = sin(p.y * 1.8 + uTime * .48 + uLayer * .7);
    float breath = sin(p.x * 2.2 + p.y * 1.2 + uTime * .32);
    float bend = edge * (.20 + uProgress * .36);
    p.z += wave * (.10 + .07 * uProgress) + breath * .065;
    p.z += bend + uPointer.x * p.x * .09;
    p.y += sin(uv.x * 3.14159) * .10 * uProgress;
    p.x += sin(uv.y * 3.14159) * uPointer.y * .04;
    vFold = wave * .11 + bend;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = `
  uniform float uProgress;
  uniform float uLayer;
  varying vec2 vUv;
  varying float vFold;
  float bayer(vec2 pixel) {
    vec2 p = mod(floor(pixel), 4.0);
    float a = 2.0 * mod(p.x, 2.0) + mod(p.y, 2.0);
    float b = 2.0 * floor(p.x / 2.0) + floor(p.y / 2.0);
    return (4.0 * a + b + .5) / 16.0;
  }
  void main() {
    vec3 paper = vec3(.985, .987, 1.0);
    vec3 indigo = vec3(.318, .271, .804);
    vec3 teal = vec3(.031, .494, .522);
    vec3 ink = mix(indigo, teal, smoothstep(.28, .92, uProgress));
    float inside = step(.105, vUv.x) * step(vUv.x, .895);
    float line = step(.87, fract(vUv.y * 24.0));
    float body = step(.18, vUv.y) * step(vUv.y, .69);
    float shortened = step(vUv.x, .75 + .09 * sin(floor(vUv.y * 24.0) * 2.0));
    float title = step(.76, vUv.y) * step(vUv.y, .81) * step(vUv.x, .70);
    float rule = step(.724, vUv.y) * step(vUv.y, .728);
    float mark = (line * body * shortened * .26 + title * .93 + rule * .38) * inside;
    float shade = clamp(.08 + vFold * .30 + uLayer * .025, .02, .32);
    float tone = floor(shade * 7.0 + bayer(gl_FragCoord.xy / 1.35)) / 7.0;
    vec3 color = mix(paper, ink, tone * .48);
    color = mix(color, ink, clamp(mark, 0.0, 1.0));
    float stamp = step(.76, vUv.x) * step(vUv.x, .89) * step(.095, vUv.y) * step(vUv.y, .135);
    color = mix(color, ink, stamp * .72);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const particleVertex = `
  uniform float uTime;
  uniform float uProgress;
  uniform float uPixelRatio;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * .22 + aPhase) * .19;
    p.x += sin(uTime * .15 + aPhase * 2.0) * .09 + uProgress * sin(aPhase) * .12;
    vec4 projected = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * projected;
    gl_PointSize = (1.4 + fract(aPhase) * 1.3) * uPixelRatio;
    vAlpha = .18 + .20 * fract(aPhase * 1.7);
  }
`;

const particleFragment = `
  uniform float uProgress;
  varying float vAlpha;
  void main() {
    vec3 ink = mix(vec3(.318, .271, .804), vec3(.031, .494, .522), uProgress);
    gl_FragColor = vec4(ink, vAlpha);
  }
`;

/** Decorative only: no operational data or input is coupled to the renderer. */
export function createPaperScene(host: HTMLElement, onUnavailable: () => void): PaperScene {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.style.display = 'block';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 30);
  camera.position.set(0, 0, 8.6);
  const pages = new THREE.Group();
  scene.add(pages);
  const pointer = new THREE.Vector2();
  const targetPointer = new THREE.Vector2();
  const progress = { value: 0 };
  const clock = { value: 0 };
  const geometry = new THREE.PlaneGeometry(2.65, 3.65, 36, 52);
  const materials: THREE.ShaderMaterial[] = [];
  for (let layer = 0; layer < 4; layer += 1) {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: clock,
        uProgress: progress,
        uLayer: { value: layer },
        uPointer: { value: pointer },
      },
    });
    materials.push(material);
    const page = new THREE.Mesh(geometry, material);
    page.position.set((layer - 1.5) * .13, (layer - 1.5) * .115, -layer * .16);
    page.rotation.z = -.12 + layer * .065;
    pages.add(page);
  }

  const count = 180;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  // A deterministic low-discrepancy field, not new random positions on every frame.
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = ((index * .61803398875) % 1 - .5) * 7;
    positions[index * 3 + 1] = ((index * .754877666) % 1 - .5) * 6.2;
    positions[index * 3 + 2] = -1.4 - ((index * .569840296) % 1) * 1.6;
    phases[index] = index * 2.399963;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const particleMaterial = new THREE.ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: clock, uProgress: progress, uPixelRatio: { value: renderer.getPixelRatio() } },
  });
  scene.add(new THREE.Points(particleGeometry, particleMaterial));

  let disposed = false;
  let paused = false;
  let inView = true;
  let frame = 0;
  let previous = 0;
  let targetProgress = 0;
  let slowFrames = 0;
  let observedFrames = 0;
  let shaderFailed = false;
  renderer.debug.onShaderError = () => { shaderFailed = true; };

  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = width / height;
    camera.position.z = camera.aspect < .85 ? 10.2 : 8.6;
    camera.updateProjectionMatrix();
  };

  const animate = (now: number) => {
    frame = 0;
    if (disposed || paused || document.hidden || !inView) return;
    const delta = previous ? Math.min((now - previous) / 1000, .1) : 0;
    previous = now;
    clock.value += delta;
    const blend = 1 - Math.exp(-delta * 5.5);
    progress.value += (targetProgress - progress.value) * blend;
    pointer.lerp(targetPointer, blend);
    pages.rotation.set(-.12 + pointer.y * .075, -.27 + progress.value * .32 + pointer.x * .10, -.11 + progress.value * .17);
    pages.position.y = Math.sin(progress.value * Math.PI) * .18;
    try {
      renderer.render(scene, camera);
    } catch {
      onUnavailable();
      return;
    }
    if (shaderFailed) {
      onUnavailable();
      return;
    }
    // Sustained sub-25fps performance demotes the visual rather than degrading the portal.
    if (delta > 0) {
      observedFrames += 1;
      if (delta > .04) slowFrames += 1;
      if (observedFrames === 120) {
        if (slowFrames > 80) {
          onUnavailable();
          return;
        }
        observedFrames = 0;
        slowFrames = 0;
      }
    }
    frame = requestAnimationFrame(animate);
  };

  const synchronize = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    if (!disposed && !paused && !document.hidden && inView) frame = requestAnimationFrame(animate);
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    onUnavailable();
  };
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  const visibility = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
    inView = entry?.isIntersecting ?? true;
    synchronize();
  }, { rootMargin: '80px' }) : null;
  visibility?.observe(host);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', synchronize);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  resize();
  synchronize();

  return {
    setProgress(value) { targetProgress = THREE.MathUtils.clamp(value, 0, 1); },
    setPointer(x, y) { targetPointer.set(x, y); },
    setPaused(value) { paused = value; synchronize(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      visibility?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', synchronize);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      geometry.dispose();
      materials.forEach((material) => material.dispose());
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      scene.clear();
    },
  };
}
