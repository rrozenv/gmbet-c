import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Euler,
  Group,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  BlendFunction,
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";

const DEG = Math.PI / 180;
const FOV = 30;

export function latLon(lat, lon, r = 1) {
  const phi = (lon + 180) * DEG;
  const c = Math.cos(lat * DEG);
  return new Vector3(-Math.cos(phi) * c, Math.sin(lat * DEG), Math.sin(phi) * c).multiplyScalar(r);
}

export const CITIES = {
  nyc: { lat: 40.71, lon: -74.0 },
  seoul: { lat: 37.57, lon: 126.98 },
  london: { lat: 51.51, lon: -0.13 },
  lagos: { lat: 6.52, lon: 3.38 },
  saopaulo: { lat: -23.55, lon: -46.63 },
  lisbon: { lat: 38.72, lon: -9.14 },
  mumbai: { lat: 19.08, lon: 72.88 },
  berlin: { lat: 52.52, lon: 13.4 },
  la: { lat: 34.05, lon: -118.24 },
  tokyo: { lat: 35.68, lon: 139.69 },
  sydney: { lat: -33.87, lon: 151.21 },
  singapore: { lat: 1.35, lon: 103.82 },
  mexico: { lat: 19.43, lon: -99.13 },
  madrid: { lat: 40.42, lon: -3.7 },
  istanbul: { lat: 41.01, lon: 28.98 },
  toronto: { lat: 43.65, lon: -79.38 },
  chicago: { lat: 41.88, lon: -87.63 },
};

// The sun at 07:00 UTC on Oct 3: 3 a.m. in New York, 4 p.m. in Seoul.
const SUN = latLon(-4.0, 77.5).normalize();

const ARC_LIFT = 0.11;
const SQ = 0.057888;

const earthVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vObjN;
varying vec3 vN;
varying vec3 vView;
void main() {
  vUv = uv;
  vObjN = normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const earthFrag = /* glsl */ `
uniform sampler2D uDay;
uniform sampler2D uLights;
uniform sampler2D uClouds;
uniform sampler2D uWater;
uniform vec3 uSun;
uniform vec3 uSunW;
uniform float uReady;
uniform float uLightsGain;
varying vec2 vUv;
varying vec3 vObjN;
varying vec3 vN;
varying vec3 vView;
void main() {
  vec3 dayTex = texture2D(uDay, vUv).rgb;
  float lights = texture2D(uLights, vUv).r;
  float cloud = texture2D(uClouds, vUv).r;
  float water = texture2D(uWater, vUv).r;

  vec3 n = normalize(vObjN);
  float sd = dot(n, uSun);
  float dayAmt = smoothstep(-0.12, 0.30, sd);
  float night = 1.0 - smoothstep(-0.10, 0.08, sd);

  float luma = dot(dayTex, vec3(0.2126, 0.7152, 0.0722));
  vec3 dayCol = mix(vec3(luma), dayTex, 0.5) * vec3(0.9, 0.97, 1.08);
  dayCol = dayCol / (1.0 + dayCol * 2.2) * 0.42;
  dayCol = mix(dayCol, vec3(0.16, 0.18, 0.21), cloud * 0.45);
  vec3 nightCol = dayTex * 0.012 + vec3(0.0006, 0.0010, 0.0022);
  nightCol += vec3(0.0022, 0.0030, 0.0050) * cloud;
  vec3 col = mix(nightCol, dayCol * (0.15 + 0.85 * clamp(sd + 0.15, 0.0, 1.0)), dayAmt);

  float li = smoothstep(0.10, 0.95, lights) * uReady * (1.0 - cloud * 0.55);
  vec3 warm = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.80, 0.52), smoothstep(0.4, 1.0, lights));
  col += warm * li * uLightsGain * night;

  vec3 N = normalize(vN);
  vec3 V = normalize(vView);
  vec3 R = reflect(-uSunW, N);
  float spec = pow(max(dot(R, V), 0.0), 60.0) * water * (1.0 - cloud) * dayAmt;
  col += vec3(1.0, 0.9, 0.75) * spec * 0.9;

  float term = exp(-pow((sd - 0.02) / 0.08, 2.0));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  col += vec3(0.10, 0.28, 0.85) * fres * (0.10 + 0.9 * dayAmt);
  col += vec3(0.9, 0.35, 0.12) * fres * term * 0.12;

  gl_FragColor = vec4(col * uReady + (1.0 - uReady) * vec3(0.002, 0.003, 0.006), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const atmoVert = /* glsl */ `
varying vec3 vObjN;
varying vec3 vN;
varying vec3 vView;
void main() {
  vObjN = normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const atmoFrag = /* glsl */ `
uniform vec3 uSun;
uniform float uStrength;
varying vec3 vObjN;
varying vec3 vN;
varying vec3 vView;
void main() {
  float d = dot(normalize(vN), normalize(vView));
  float rim = pow(smoothstep(0.0, 0.42, -d), 3.0);
  float sd = dot(normalize(vObjN), uSun);
  float lit = smoothstep(-0.35, 0.45, sd);
  vec3 c = mix(vec3(0.02, 0.05, 0.16), vec3(0.18, 0.42, 1.0), lit);
  c += vec3(1.0, 0.45, 0.15) * exp(-pow(sd / 0.14, 2.0)) * 0.35;
  gl_FragColor = vec4(c * rim * uStrength, 1.0);
  #include <colorspace_fragment>
}`;

const arcVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const arcFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uDraw;
uniform float uHead;
uniform float uOpacity;
uniform float uGlow;
varying vec2 vUv;
void main() {
  float t = vUv.x;
  if (t > uDraw) discard;
  float d = t - uHead;
  float pulse = exp(-d * d / 0.003);
  float tip = exp(-pow((t - uDraw) / 0.02, 2.0)) * step(uDraw, 0.999);
  float edge = smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.96, t);
  vec3 c = uColor * (0.5 + 0.9 * uGlow + 3.5 * pulse + 3.0 * tip) * edge;
  gl_FragColor = vec4(c * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

const dotFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uPhase;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float core = smoothstep(0.14, 0.0, r);
  float halo = smoothstep(0.5, 0.0, r) * 0.25;
  float ringR = 0.2 + 0.75 * uPhase;
  float ring = smoothstep(0.03, 0.0, abs(r - ringR)) * (1.0 - uPhase) * 0.8;
  gl_FragColor = vec4(uColor * (core * 4.0 + halo + ring * 1.5) * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

const starVert = /* glsl */ `
attribute float aSize;
attribute float aLum;
varying float vLum;
uniform float uDpr;
void main() {
  vLum = aLum;
  gl_PointSize = aSize * uDpr;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const starFrag = /* glsl */ `
varying float vLum;
uniform float uOpacity;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, r);
  gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * vLum * a * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

function arcPoints(a, b, lift) {
  const va = latLon(a.lat, a.lon).normalize();
  const vb = latLon(b.lat, b.lon).normalize();
  const angle = va.angleTo(vb);
  const axis = new Vector3().crossVectors(va, vb).normalize();
  const q = new Quaternion();
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    const t = i / 96;
    q.setFromAxisAngle(axis, angle * t);
    pts.push(va.clone().applyQuaternion(q).multiplyScalar(1.003 + lift * angle * Math.sin(Math.PI * t)));
  }
  return { curve: new CatmullRomCurve3(pts), apex: 1.003 + lift * angle };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function glowTexture(rgb) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${rgb},1)`);
  grd.addColorStop(0.35, `rgba(${rgb},0.55)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function createScene({ canvas, stage, base, reducedMotion, S: sharedState, anchors, still, poster, onFirstFrame, onBoardReady }) {
  const mobileGPU = window.matchMedia("(max-width: 819px), (pointer: coarse)").matches;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    stencil: false,
    depth: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x020306, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new Scene();
  scene.background = new Color(0x020306);
  const camera = new PerspectiveCamera(FOV, 1, 0.01, 60);

  const earth = new Group();
  scene.add(earth);

  const loader = new TextureLoader();
  let texLoaded = 0;
  const tex = (name, srgb) => {
    const t = loader.load(base + "tex/" + name, () => {
      texLoaded += 1;
      if (texLoaded === 4) earthMat.uniforms.uReady.value = 1;
    });
    t.anisotropy = 8;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    if (srgb) t.colorSpace = SRGBColorSpace;
    return t;
  };

  const earthMat = new ShaderMaterial({
    vertexShader: earthVert,
    fragmentShader: earthFrag,
    uniforms: {
      uDay: { value: null },
      uLights: { value: null },
      uClouds: { value: null },
      uWater: { value: null },
      uSun: { value: SUN },
      uSunW: { value: SUN.clone() },
      uReady: { value: 0 },
      uLightsGain: { value: 3.2 },
    },
  });
  const res = mobileGPU ? "2k" : "4k";
  earthMat.uniforms.uDay.value = tex(`day-${res}.webp`, true);
  earthMat.uniforms.uLights.value = tex(`lights-${res}.webp`);
  earthMat.uniforms.uClouds.value = tex("clouds-2k.webp");
  earthMat.uniforms.uWater.value = tex("water-2k.webp");
  earth.add(new Mesh(new SphereGeometry(1, 160, 120), earthMat));

  const atmo = new Mesh(
    new SphereGeometry(1.035, 128, 96),
    new ShaderMaterial({
      vertexShader: atmoVert,
      fragmentShader: atmoFrag,
      uniforms: { uSun: { value: SUN }, uStrength: { value: 1.4 } },
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  earth.add(atmo);

  const gold = new Vector3(1.0, 0.62, 0.26);
  const pale = new Vector3(0.45, 0.55, 0.9);
  const makeArc = (a, b, color, radius, lift) => {
    const { curve } = arcPoints(a, b, lift);
    const mat = new ShaderMaterial({
      vertexShader: arcVert,
      fragmentShader: arcFrag,
      uniforms: {
        uColor: { value: color.clone() },
        uDraw: { value: 0 },
        uHead: { value: -1 },
        uOpacity: { value: 1 },
        uGlow: { value: 0 },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new Mesh(new TubeGeometry(curve, 240, radius, 8, false), mat);
    earth.add(mesh);
    return mesh;
  };
  const dotGeo = new PlaneGeometry(1, 1);
  const makeDot = (c, color, size) => {
    const mat = new ShaderMaterial({
      vertexShader: arcVert,
      fragmentShader: dotFrag,
      uniforms: { uColor: { value: color.clone() }, uPhase: { value: 0 }, uOpacity: { value: 1 } },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const m = new Mesh(dotGeo, mat);
    const p = latLon(c.lat, c.lon, 1.002);
    m.position.copy(p);
    m.lookAt(p.clone().multiplyScalar(2));
    m.scale.setScalar(size);
    earth.add(m);
    return m;
  };

  const main = makeArc(CITIES.nyc, CITIES.seoul, gold, 0.0032, ARC_LIFT);
  const dots = [makeDot(CITIES.nyc, gold, 0.1), makeDot(CITIES.seoul, gold, 0.1)];
  const previews = [
    ["london", "lagos"],
    ["saopaulo", "lisbon"],
    ["mumbai", "berlin"],
    ["la", "tokyo"],
    ["sydney", "singapore"],
    ["mexico", "madrid"],
    ["istanbul", "london"],
    ["toronto", "berlin"],
    ["chicago", "london"],
  ].map(([a, b], i) => ({
    arc: makeArc(CITIES[a], CITIES[b], pale, 0.0018, 0.1),
    dots: [makeDot(CITIES[a], pale, 0.05), makeDot(CITIES[b], pale, 0.05)],
    offset: i * 1.9,
  }));

  let starMat;
  {
    const N = 1400;
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const lum = new Float32Array(N);
    let s = 11;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.set([r * Math.cos(th) * 30, u * 30, r * Math.sin(th) * 30], i * 3);
      size[i] = 0.7 + Math.pow(rnd(), 7) * 2.4;
      lum[i] = 0.15 + Math.pow(rnd(), 3) * 0.9;
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("aSize", new BufferAttribute(size, 1));
    g.setAttribute("aLum", new BufferAttribute(lum, 1));
    starMat = new ShaderMaterial({
      vertexShader: starVert,
      fragmentShader: starFrag,
      uniforms: { uDpr: { value: 1 }, uOpacity: { value: 0.8 } },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new Points(g, starMat));
  }

  /* The board hangs just above the apex of the New York to Seoul arc: one board between them. */
  const mid = latLon(CITIES.nyc.lat, CITIES.nyc.lon).add(latLon(CITIES.seoul.lat, CITIES.seoul.lon)).normalize();
  const { apex } = arcPoints(CITIES.nyc, CITIES.seoul, ARC_LIFT);
  const BOARD_WORLD = 0.17;
  const boardScale = BOARD_WORLD / 0.5532;
  const boardRoot = new Group();
  {
    const up = mid.clone();
    const north = new Vector3(0, 1, 0);
    const east = new Vector3().crossVectors(north, up).normalize();
    const fwd = new Vector3().crossVectors(east, up).normalize().negate();
    const yaw = new Quaternion().setFromAxisAngle(up, 0.0);
    fwd.applyQuaternion(yaw);
    const right = new Vector3().crossVectors(up, fwd).normalize();
    const m = new Matrix4().makeBasis(right.negate(), up, fwd);
    boardRoot.quaternion.setFromRotationMatrix(m);
    boardRoot.position.copy(mid).multiplyScalar(apex + 0.012);
    boardRoot.scale.setScalar(boardScale);
  }
  boardRoot.visible = false;
  earth.add(boardRoot);

  const key = new DirectionalLight(0xffd9ad, 1.9);
  key.position.set(-0.35, 0.9, -0.45);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(mobileGPU ? 1024 : 2048, mobileGPU ? 1024 : 2048);
  key.shadow.camera.left = -0.12;
  key.shadow.camera.right = 0.12;
  key.shadow.camera.top = 0.12;
  key.shadow.camera.bottom = -0.12;
  key.shadow.camera.near = 0.001;
  key.shadow.camera.far = 0.5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.002;
  key.shadow.radius = 4;
  boardRoot.add(key, key.target);
  const rim = new DirectionalLight(0x8fb4ff, 1.1);
  rim.position.set(0.4, 0.35, 0.9);
  boardRoot.add(rim);

  const checkLight = new PointLight(0xff3b30, 0, 0.25, 2);
  boardRoot.add(checkLight);

  const sqGeo = new PlaneGeometry(SQ, SQ);
  sqGeo.rotateX(-Math.PI / 2);
  const hlMat = new MeshBasicMaterial({ color: new Color(1.0, 0.66, 0.28), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const hlFrom = new Mesh(sqGeo, hlMat);
  const hlTo = new Mesh(sqGeo, hlMat);
  const glowGeo = new PlaneGeometry(SQ * 2.2, SQ * 2.2);
  glowGeo.rotateX(-Math.PI / 2);
  const checkMat = new MeshBasicMaterial({ map: glowTexture("255,64,48"), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const checkGlow = new Mesh(glowGeo, checkMat);
  boardRoot.add(hlFrom, hlTo, checkGlow);

  // Files a to h run along -x so a1 sits at White's lower left when viewed from White's side (-z).
  const sqPos = (file, rank, y = 0.0174) => new Vector3((3.5 - file) * SQ, y, (rank - 4.5) * SQ);
  const F = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };
  const at = (s) => sqPos(F[s[0]], Number(s[1]));
  hlFrom.position.copy(at("d1")).setY(0.0177);
  hlTo.position.copy(at("d8")).setY(0.0177);
  checkGlow.position.copy(at("g8")).setY(0.0178);
  checkLight.position.copy(at("g8")).setY(0.06);

  const pieces = { queen: null, kingPivot: null, kingTarget: at("g8") };
  const queenFrom = at("d1");
  const queenTo = at("d8");

  let envReady = false;
  let boardReady = false;
  let boardRequested = false;
  let gltfRoot = null;
  let warming = false;
  // Compile the board's shaders off the main thread and upload its textures in idle time, before it can appear.
  const warm = async () => {
    if (warming || !envReady || !gltfRoot) return;
    warming = true;
    boardRoot.visible = true;
    const compiling = renderer.compileAsync(scene, camera).catch(() => {});
    boardRoot.visible = false;
    await compiling;
    const maps = new Set();
    gltfRoot.traverse((o) => {
      if (!o.isMesh) return;
      ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"].forEach((k) => o.material[k] && maps.add(o.material[k]));
    });
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 16));
    for (const m of maps) {
      await new Promise((r) => idle(r, { timeout: 200 }));
      renderer.initTexture(m);
    }
    // One offscreen render compiles the shadow and depth programs while nothing is moving.
    await new Promise((r) => idle(r, { timeout: 300 }));
    const rt = new WebGLRenderTarget(64, 64);
    boardRoot.visible = true;
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    boardRoot.visible = false;
    rt.dispose();
    if (tier >= 2) {
      // Depth of field switches on mid-scroll; compile its passes now.
      dofPass.enabled = true;
      composer.render(0);
      dofPass.enabled = false;
    }
    shadowKey = "";
    boardReady = true;
    onBoardReady && onBoardReady();
  };
  const loadBoard = () => {
    if (boardRequested) return;
    boardRequested = true;
    const pmrem = new PMREMGenerator(renderer);
    new HDRLoader().load(base + "hdr/studio.hdr", (hdr) => {
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      scene.environment = env;
      scene.environmentIntensity = 0.32;
      envReady = true;
      warm();
    });

    const gltf = new GLTFLoader();
    gltf.setMeshoptDecoder(MeshoptDecoder);
    gltf.load(base + "models/chess.glb", (g) => {
      const root = g.scene;
      // Final position before the mate: White Kg1 Qd1 Bb2, pawns a3 f2 g2 h2. Black Kg8 Bb7 Rc2, pawns a7 b6 f7 g7 h7.
      const want = {
        piece_king_white: "g1",
        piece_queen_white: "d1",
        piece_bishop_white_01: "b2",
        piece_pawn_white_01: "a3",
        piece_pawn_white_02: "f2",
        piece_pawn_white_03: "g2",
        piece_pawn_white_04: "h2",
        piece_king_black: "g8",
        piece_bishop_black_01: "b7",
        piece_rook_black_01: "c2",
        piece_pawn_black_01: "a7",
        piece_pawn_black_02: "b6",
        piece_pawn_black_03: "f7",
        piece_pawn_black_04: "g7",
        piece_pawn_black_05: "h7",
      };
      const nodes = [...root.children];
      const captured = { white: [], black: [] };
      for (const n of nodes) {
        n.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = n.name !== "board";
            o.receiveShadow = true;
            const mat = o.material;
            if (mat.metalnessMap && !mat.aoMap) {
              mat.aoMap = mat.metalnessMap;
              mat.aoMapIntensity = 1;
            }
            mat.envMapIntensity = n.name === "board" ? 0.9 : 1.2;
            if (n.name === "board") mat.color.setScalar(0.62);
            mat.needsUpdate = true;
          }
        });
        if (n.name === "board") {
          n.rotation.y = 0;
          continue;
        }
        // Model squares: x = (f - 3.5) * SQ, z = (r - 4.5) * SQ. Move each piece by the offset to its new square.
        const of = Math.round(n.position.x / SQ + 3.5);
        const or = Math.round(n.position.z / SQ + 4.5);
        const orig = new Vector3((of - 3.5) * SQ, 0, (or - 4.5) * SQ);
        const target = want[n.name];
        if (target) {
          const t = at(target);
          n.position.x += t.x - orig.x;
          n.position.z += t.z - orig.z;
        } else {
          (n.name.includes("white") ? captured.white : captured.black).push({ n, orig });
        }
      }
      [...captured.white, ...captured.black].forEach(({ n }) => (n.visible = false));

      const queen = root.getObjectByName("piece_queen_white");
      const king = root.getObjectByName("piece_king_black");
      pieces.queen = queen;
      pieces.queenBase = queen.position.clone();
      // Tip the king over the edge of its base, toward h8.
      const pivot = new Group();
      const kp = king.position.clone();
      const baseR = 0.0125;
      pivot.position.set(kp.x - baseR, 0.0174, kp.z);
      root.add(pivot);
      king.position.sub(pivot.position);
      pivot.add(king);
      pieces.kingPivot = pivot;

      boardRoot.add(root);
      gltfRoot = root;
      warm();
    });
  };
  if (still) loadBoard();

  /* Orientations */
  const focusQ = (() => {
    const north = new Vector3(0, 1, 0);
    const east = new Vector3().crossVectors(north, mid).normalize();
    const up = new Vector3().crossVectors(mid, east);
    const m = new Matrix4().makeBasis(east, up, mid).invert();
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.55);
    return tilt.multiply(new Quaternion().setFromRotationMatrix(m));
  })();

  const spinFor = (v) => Math.atan2(-v.x, v.z);
  const state = {
    spin: spinFor(latLon(0, -100)),
    tilt: 0.72,
    vSpin: 0,
    vTilt: 0,
    dragging: false,
    w: 1,
    h: 1,
    dpr: 1,
    mobile: false,
    visible: true,
  };
  const S = sharedState || { cam: 0, lock: 0, move: 0, check: 0, tip: 0, win: 0 };

  /* Drag to turn the globe. Vertical swipes on touch screens still scroll. */
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let pid = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || S.cam > 0.2 || e.target.closest("a,button,input,label,textarea")) return;
    pid = e.pointerId;
    state.dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    stage.classList.add("dragging");
  });
  window.addEventListener("pointermove", (e) => {
    if (!state.dragging || e.pointerId !== pid) return;
    const now = performance.now();
    const dt = Math.max(8, now - lastT);
    const k = 3.2 / Math.max(320, Math.min(state.w, state.h));
    const dx = (e.clientX - lastX) * k;
    const dy = e.pointerType === "touch" ? 0 : (e.clientY - lastY) * k;
    state.spin += dx;
    state.tilt = Math.min(1.15, Math.max(-0.4, state.tilt + dy));
    state.vSpin = (dx / dt) * 1000;
    state.vTilt = (dy / dt) * 1000;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
  });
  const endDrag = (e) => {
    if (e.pointerId !== pid) return;
    state.dragging = false;
    pid = null;
    stage.classList.remove("dragging");
  };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  /* Post-processing: depth of field, bloom, filmic tone mapping, vignette, grain. */
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: mobileGPU ? 0 : 4 });
  composer.addPass(new RenderPass(scene, camera));
  const dof = new DepthOfFieldEffect(camera, { focusDistance: 1, focusRange: 0.1, bokehScale: 0, resolutionScale: 0.5 });
  const dofTarget = new Vector3();
  dof.target = dofTarget;
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.86, luminanceSmoothing: 0.2, intensity: 1.0, radius: 0.75 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.72 });
  const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  grain.blendMode.opacity.value = 0.09;
  const dofPass = new EffectPass(camera, dof);
  composer.addPass(dofPass);
  composer.addPass(new EffectPass(camera, bloom, tone, vignette, grain));

  const resize = () => {
    const r = stage.getBoundingClientRect();
    state.w = Math.max(1, Math.round(r.width));
    state.h = Math.max(1, Math.round(r.height));
    state.mobile = state.w < 820;
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(state.dpr);
    renderer.setSize(state.w, state.h, false);
    composer.setSize(state.w, state.h, false);
    starMat.uniforms.uDpr.value = state.dpr;
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  const labels = [];
  const addLabel = (el, city) => labels.push({ el, pos: latLon(city.lat, city.lon, 1.006), left: null });

  const userQ = new Quaternion();
  const q = new Quaternion();
  const e3 = new Euler();
  const tmp = new Vector3();
  const nrm = new Vector3();
  const camDir = new Vector3();
  const B = new Vector3();
  const boardUp = new Vector3();
  const camFinal = new Vector3();
  const lookFinal = new Vector3();
  const dir0 = new Vector3();
  const dir1 = new Vector3();
  const dirT = new Vector3();
  const look = new Vector3();
  const up = new Vector3();
  const focusMat = new Matrix4();
  const driftQ = new Quaternion();
  const boardMat = new Matrix4();

  // Final framing in board space: seated behind White, high enough to see the whole board.
  const CAM_DIR_DESK = new Vector3(0, 0.7, -1).normalize();
  const CAM_DIR_PHONE = new Vector3(0, 1.25, -1).normalize();
  const CAM_BOARD = new Vector3();
  const LOOK_BOARD = new Vector3(0, 0.0, 0.015);

  let first = true;
  let last = performance.now();
  let clock = 0;

  // Quality tiers: 2 = depth of field, bloom, grain. 1 = bloom and grain. 0 = no post-processing, pixel ratio 1.
  // Slow frames step the tier down; it never steps back up, so quality cannot oscillate.
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  let tier = weak ? 0 : mobileGPU ? 1 : 2;
  let frameAvg = 1 / 60;
  let sampled = 0;
  const applyTier = () => {
    dofPass.enabled = tier >= 2;
    if (tier === 0) {
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      state.dpr = 1;
      renderer.setPixelRatio(1);
      renderer.setSize(state.w, state.h, false);
    }
    stage.dataset.tier = String(tier);
  };
  let shadowKey = "";

  let compiled = false;
  renderer
    .compileAsync(scene, camera)
    .catch(() => {})
    .then(() => (compiled = true));

  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!compiled || !state.visible || document.hidden) return;
    clock += dt;
    if (dt > 0) {
      frameAvg += (dt - frameAvg) * 0.05;
      sampled += 1;
    }
    if (sampled > 90 && frameAvg > 1 / 48 && tier > 0) {
      tier -= 1;
      sampled = 0;
      frameAvg = 1 / 60;
      applyTier();
    }

    const c = S.cam;
    const dive = smooth(0.0, 0.42, c);
    if (!boardRequested && (c > 0.001 || clock > 4)) loadBoard();

    if (!state.dragging) {
      const auto = reducedMotion ? 0 : 0.02 * (1 - dive);
      state.vSpin *= Math.pow(0.04, dt);
      state.vTilt *= Math.pow(0.04, dt);
      state.spin += (auto + state.vSpin) * dt;
      state.tilt = Math.min(1.15, Math.max(-0.4, state.tilt + state.vTilt * dt));
    }
    e3.set(state.tilt, state.spin, 0, "XYZ");
    userQ.setFromEuler(e3);
    q.copy(userQ).slerp(focusQ, dive);
    earth.quaternion.copy(q);
    earthMat.uniforms.uSunW.value.copy(SUN).applyQuaternion(q);
    earth.updateMatrixWorld(true);

    const { w, h, mobile } = state;
    const t = Math.tan((FOV / 2) * DEG);
    const heroD = poster ? h * 0.8 : mobile ? Math.min(w * 1.12, h * 0.62) : Math.min(h * 0.94, w * 0.6);
    const d0 = Math.sqrt(1 + Math.pow(h / heroD / t, 2));

    // Board frame as it will be once the globe has turned to its focus orientation.
    focusMat.makeRotationFromQuaternion(focusQ);
    boardRoot.updateMatrix();
    boardMat.multiplyMatrices(focusMat, boardRoot.matrix);
    B.setFromMatrixPosition(boardMat);
    {
      const frac = mobile ? 0.94 : 0.68;
      const aspect = w / h;
      const dWorld = BOARD_WORLD / (frac * 2 * t * Math.min(aspect, 1.15));
      CAM_BOARD.copy(mobile ? CAM_DIR_PHONE : CAM_DIR_DESK).multiplyScalar(dWorld / boardScale);
    }
    camFinal.copy(CAM_BOARD).applyMatrix4(boardMat);
    lookFinal.copy(LOOK_BOARD).applyMatrix4(boardMat);
    boardUp.set(0, 1, 0).transformDirection(boardMat);

    // One continuous move: distance to the board shrinks exponentially while the direction swings around it.
    const p0 = tmp.set(0, 0, d0);
    dir0.copy(p0).sub(B);
    const dist0 = dir0.length();
    dir0.normalize();
    dir1.copy(camFinal).sub(B);
    const dist1 = dir1.length();
    dir1.normalize();
    const swing = smooth(0.05, 0.95, c);
    dirT.copy(dir0).lerp(dir1, swing).normalize();
    const dist = dist0 * Math.pow(dist1 / dist0, c);
    camera.position.copy(B).addScaledVector(dirT, dist);
    const lookT = smooth(0.0, 0.7, c);
    look.set(0, 0, 0).lerp(lookFinal, lookT);
    // Slow orbit and push-in while the match plays, so the board never sits still.
    const settle = smooth(0.85, 1.0, c);
    if (settle > 0 && !still) {
      const ang = (S.drift - 0.5) * 0.32 * settle;
      driftQ.setFromAxisAngle(boardUp, ang);
      camera.position.sub(lookFinal).applyQuaternion(driftQ).multiplyScalar(1 - 0.09 * S.drift * settle).add(lookFinal);
    }
    up.set(0, 1, 0).lerp(boardUp, smooth(0.3, 1.0, c)).normalize();
    camera.up.copy(up);
    camera.lookAt(look);
    camera.near = Math.max(0.004, dist * 0.04);
    camera.far = dist + 6;

    const hx = poster || mobile ? w * 0.5 : w * 0.67;
    const hy = poster ? h * 0.5 : mobile ? h * 0.36 : h * 0.52;
    const fx = mobile ? w * 0.5 : w * 0.655;
    const fy = mobile ? h * 0.53 : h * 0.55;
    const off = smooth(0.0, 0.6, c);
    const cx = lerp(hx, fx, off);
    const cy = lerp(hy, fy, off);
    camera.aspect = w / h;
    camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    if (still) {
      // Share-card render: the finished board from above, square, no flight.
      tmp.set(0, 1.18, -0.3).applyMatrix4(boardMat);
      camera.position.copy(tmp);
      camera.up.copy(boardUp);
      look.set(0, 0, -0.012).applyMatrix4(boardMat);
      camera.lookAt(look);
      camera.clearViewOffset();
      camera.near = 0.01;
      camera.far = 8;
    }
    camera.updateProjectionMatrix();

    // Focus follows the board as it comes close.
    dofTarget.setFromMatrixPosition(boardRoot.matrixWorld);
    dof.cocMaterial.copyCameraSettings(camera);
    dof.cocMaterial.focusRange = lerp(3, 0.16, smooth(0.6, 1.0, c)) * (1 - 0.8 * S.win);
    dof.bokehScale = lerp(0, mobile ? 2.5 : 3.5, smooth(0.55, 0.95, c)) + S.win * 3;
    dofPass.enabled = tier >= 2 && c > 0.5;

    starMat.uniforms.uOpacity.value = 0.8;
    const intro = reducedMotion ? 1 : smooth(0.4, 2.4, clock);
    const m = main.material.uniforms;
    m.uDraw.value = poster ? 0 : intro;
    m.uHead.value = reducedMotion ? -1 : ((clock * 0.3) % 1.5) - 0.25;
    m.uGlow.value = dive;
    m.uOpacity.value = 1 - smooth(0.55, 0.9, c) * 0.82;
    dots.forEach((d, i) => {
      d.material.uniforms.uPhase.value = reducedMotion ? 0.6 : (clock * 0.5 + i * 0.5) % 1;
      d.material.uniforms.uOpacity.value = poster ? 0 : intro;
    });
    previews.forEach((pv) => {
      const cyc = 17.1;
      const tt = reducedMotion ? (pv.offset % 5.7 < 0.1 ? 2.5 : 9) : (clock + pv.offset) % cyc;
      const vis = tt < 6.4 ? 1 - smooth(5.2, 6.4, tt) : 0;
      const u = pv.arc.material.uniforms;
      u.uDraw.value = smooth(0, 1.6, tt);
      u.uHead.value = lerp(-0.2, 1.2, smooth(0.8, 4.2, tt));
      u.uOpacity.value = poster ? 0 : vis * 0.8 * (1 - dive);
      pv.dots.forEach((d) => {
        d.material.uniforms.uOpacity.value = vis * (1 - dive);
        d.material.uniforms.uPhase.value = (tt * 0.45) % 1;
      });
    });

    // Board appears as the camera leaves orbit.
    const boardIn = smooth(0.08, 0.3, c);
    boardRoot.visible = boardReady && boardIn > 0.001;
    if (boardReady) {
      const s = boardScale * (0.6 + 0.4 * boardIn);
      boardRoot.scale.setScalar(s);
      if (pieces.queen) {
        const mv = S.move;
        pieces.queen.position.x = pieces.queenBase.x + (queenTo.x - queenFrom.x) * mv;
        pieces.queen.position.z = pieces.queenBase.z + (queenTo.z - queenFrom.z) * mv;
        pieces.queen.position.y = pieces.queenBase.y + Math.sin(Math.PI * mv) * 0.03;
        pieces.kingPivot.rotation.z = S.tip * 1.36;
      }
      hlMat.opacity = 0.32 * smooth(0.9, 1, S.move);
      checkMat.opacity = 0.85 * S.check;
      checkLight.intensity = 0.06 * S.check;
    }

    camDir.copy(camera.position).normalize();
    for (const l of labels) {
      tmp.copy(l.pos).applyMatrix4(earth.matrixWorld);
      nrm.copy(tmp).normalize();
      const facing = nrm.dot(camDir);
      tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * w;
      const y = (-tmp.y * 0.5 + 0.5) * h;
      const textClear = mobile ? 1 - (1 - dive) * smooth(h * 0.4, h * 0.5, y) : 1;
      const o = smooth(0.15, 0.35, facing) * intro * (1 - smooth(0.32, 0.48, c)) * textClear;
      const left = x > w * 0.5;
      if (left !== l.left) {
        l.left = left;
        l.el.classList.toggle("city-right", left);
      }
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      l.el.style.opacity = o.toFixed(3);
      l.el.style.visibility = o < 0.01 ? "hidden" : "visible";
    }

    if (anchors && c > 0.3) {
      const place = (el, z, above) => {
        tmp.set(0, 0.03, z).applyMatrix4(boardRoot.matrixWorld).project(camera);
        const x = (tmp.x * 0.5 + 0.5) * w;
        let y = (-tmp.y * 0.5 + 0.5) * h + (above ? -64 : 16);
        const lo = mobile ? 168 : 72;
        const hi = h - (mobile ? 148 : 64);
        y = Math.min(hi, Math.max(lo, y));
        el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      };
      place(anchors.top, 0.3, true);
      place(anchors.bottom, -0.3, false);
    }

    const key = boardRoot.visible ? `${boardIn.toFixed(3)}|${S.move.toFixed(3)}|${S.tip.toFixed(3)}` : "off";
    if (key !== shadowKey) {
      shadowKey = key;
      renderer.shadowMap.needsUpdate = boardRoot.visible;
    }

    if (tier === 0) renderer.render(scene, camera);
    else composer.render(dt);
    if (first) {
      first = false;
      onFirstFrame && onFirstFrame();
    }
  };
  applyTier();

  return {
    S,
    tick: frame,
    get tier() {
      return tier;
    },
    setVisible(v) {
      state.visible = v;
    },
    addLabel,
    get ready() {
      return boardReady && envReady;
    },
  };
}
