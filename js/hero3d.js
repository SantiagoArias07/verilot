// Cinematic WebGL hero — the VERILOT M1 optical-sorting module over a running
// conveyor of PET flake, with live computer-vision bounding boxes.
//
// Three.js is loaded from the local vendored copy via the page import map
// ("three"), so there is no CDN round-trip and the first studio-lit frame is
// rendered synchronously before the render loop starts (o.onReady fires then,
// letting the page cross-fade out the poster with zero flash of empty canvas).
import * as T from 'three';

export async function mountHero(gl, ov, o = {}) {
  const acc = new T.Color(o.accent || '#00E5FF');
  let speed = o.speed ?? 1;
  const AMB = '#F59E0B', RED = '#EF4444';

  const renderer = new T.WebGLRenderer({ canvas: gl, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();
  scene.fog = new T.Fog(0x08090C, 6.5, 12.5);
  const camera = new T.PerspectiveCamera(30, 1, 0.1, 60);

  // studio environment (softbox + rim strips)
  const pm = new T.PMREMGenerator(renderer);
  const env = new T.Scene();
  env.add(new T.Mesh(new T.BoxGeometry(30, 30, 30), new T.MeshBasicMaterial({ color: 0x06070a, side: T.BackSide })));
  const panel = (w, h, pos, rgb) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color().setRGB(...rgb), side: T.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 1, 0); env.add(m);
  };
  panel(10, 5, [0, 9, 0], [2.0, 2.1, 2.2]);
  panel(1.2, 8, [-9, 3, 2], [2.6, 2.7, 2.9]);
  panel(12, 0.7, [3, 3, -9], [5, 5.3, 5.8]);
  panel(.6, 5, [8, 2, 4], [0.08, 0.35, 0.45]);
  panel(6, 2, [-4, 1, 9], [0.45, 0.47, 0.5]);
  const envRT = pm.fromScene(env, 0.03);
  scene.environment = envRT.texture;

  const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const rep = (t, x, y) => { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(x, y); t.anisotropy = 8; return t; };

  // textures
  const brushedC = (() => {
    const c = cnv(512, 512), x = c.getContext('2d'); x.fillStyle = '#808080'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) { const v = Math.random() < .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${.03 + Math.random() * .08})`; x.fillRect(Math.random() * 600 - 100, Math.random() * 512, 80 + Math.random() * 400, 1); }
    return c;
  })();
  const brT = rep(new T.CanvasTexture(brushedC), 3, 3);
  const belt = (() => {
    const b = cnv(512, 512), bx = b.getContext('2d'), id = bx.createImageData(512, 512);
    for (let i = 0; i < id.data.length; i += 4) { const n = 22 + Math.random() * 16; id.data[i] = n; id.data[i + 1] = n + 2; id.data[i + 2] = n + 5; id.data[i + 3] = 255; }
    bx.putImageData(id, 0, 0);
    const c = cnv(512, 512), x = c.getContext('2d'); x.drawImage(b, 0, 0);
    x.globalAlpha = .2; for (let k = 1; k <= 7; k++) { x.drawImage(b, k * 3, 0); x.drawImage(b, k * 3 - 512, 0); }
    x.globalAlpha = 1;
    for (let i = 0; i < 46; i++) { x.fillStyle = `rgba(255,255,255,${.008 + Math.random() * .022})`; x.fillRect(0, Math.random() * 512, 512, 1 + Math.random() * 2); }
    return { c, b };
  })();
  const beltMap = rep(new T.CanvasTexture(belt.c), 9, 1); beltMap.colorSpace = T.SRGBColorSpace;
  const beltBump = rep(new T.CanvasTexture(belt.b), 9, 1);
  const glowTex = (() => { const c = cnv(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
  // soft radial contact-shadow / ambient-occlusion blob
  const aoTex = (() => { const c = cnv(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(.55, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); })();
  const textTex = (() => { const c = cnv(1024, 128), x = c.getContext('2d'); x.fillStyle = '#fff'; x.font = '600 64px Geist, "Helvetica Neue", Arial, sans-serif'; x.textBaseline = 'middle'; let px = 8; for (const ch of 'VERILOT   M1') { x.fillText(ch, px, 66); px += x.measureText(ch).width + 18; } const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t; })();

  // materials
  const anod = new T.MeshPhysicalMaterial({ color: 0x4e555e, metalness: 1, roughness: .62, roughnessMap: brT, bumpMap: brT, bumpScale: .12, anisotropy: .6, clearcoat: .35, clearcoatRoughness: .3, envMapIntensity: 1.15 });
  const alu = new T.MeshPhysicalMaterial({ color: 0xc4cad2, metalness: 1, roughness: .46, roughnessMap: brT, anisotropy: .7, envMapIntensity: 1.3 });
  const coat = new T.MeshStandardMaterial({ color: 0x23272e, metalness: .35, roughness: .55, envMapIntensity: .8 });
  const darkM = new T.MeshStandardMaterial({ color: 0x0c0d10, metalness: .7, roughness: .4 });
  const black = new T.MeshStandardMaterial({ color: 0x040405, roughness: .7 });
  const glass = new T.MeshPhysicalMaterial({ color: 0x030407, metalness: 0, roughness: .03, clearcoat: 1, clearcoatRoughness: .02, iridescence: 1, iridescenceIOR: 1.85, iridescenceThicknessRange: [260, 560], envMapIntensity: 3 });
  const winGlass = new T.MeshPhysicalMaterial({ color: 0x06080c, metalness: 0, roughness: .05, clearcoat: 1, iridescence: .55, iridescenceIOR: 1.7, iridescenceThicknessRange: [300, 500], envMapIntensity: 2 });
  const emis = (hex, k) => new T.MeshBasicMaterial({ color: new T.Color(hex).multiplyScalar(k), toneMapped: true });
  const aoMat = () => new T.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, opacity: 1 });

  // floor + conveyor
  const floor = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshStandardMaterial({ color: 0x0a0b0e, roughness: .85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.9; floor.receiveShadow = true; scene.add(floor);
  const beltMat = new T.MeshStandardMaterial({ map: beltMap, bumpMap: beltBump, bumpScale: .6, roughness: .72, metalness: 0, envMapIntensity: .9 });
  const beltTop = new T.Mesh(new T.PlaneGeometry(18, 1.22), beltMat); beltTop.rotation.x = -Math.PI / 2; beltTop.receiveShadow = true; scene.add(beltTop);
  const body = new T.Mesh(new T.BoxGeometry(18, .12, 1.26), new T.MeshStandardMaterial({ color: 0x111317, roughness: .8 })); body.position.y = -.061; scene.add(body);
  for (const z of [-.655, .655]) {
    const r = new T.Mesh(new T.BoxGeometry(18, .16, .05), alu); r.position.set(0, .01, z); r.receiveShadow = true; scene.add(r);
    const g = new T.Mesh(new T.BoxGeometry(18, .012, .052), black); g.position.set(0, .045, z); scene.add(g);
    for (const x of [-6, -3, 3, 6]) {
      const l = new T.Mesh(new T.BoxGeometry(.06, .8, .06), anod); l.position.set(x, -.5, z * .92); l.castShadow = true; scene.add(l);
      // soft AO contact shadow at the foot of each gantry/support leg
      const ao = new T.Mesh(new T.PlaneGeometry(.5, .5), aoMat()); ao.rotation.x = -Math.PI / 2; ao.position.set(x, -.888, z * .92); ao.renderOrder = 1; scene.add(ao);
    }
  }
  // broad AO pool under the module footprint
  const footAO = new T.Mesh(new T.PlaneGeometry(2.4, 2.0), aoMat()); footAO.material.opacity = .7; footAO.rotation.x = -Math.PI / 2; footAO.position.set(0, -.884, 0); footAO.renderOrder = 1; scene.add(footAO);

  // gantry
  for (const z of [-.88, .88]) { const p = new T.Mesh(new T.BoxGeometry(.08, 2.32, .08), coat); p.position.set(0, .26, z); p.castShadow = true; scene.add(p); }
  const beam = new T.Mesh(new T.BoxGeometry(.12, .1, 1.86), coat); beam.position.set(0, 1.42, 0); beam.castShadow = true; scene.add(beam);
  for (const z of [-.5, .5]) { const h = new T.Mesh(new T.BoxGeometry(.05, .14, .05), alu); h.position.set(0, 1.31, z); scene.add(h); }

  // VERILOT M1 housing
  const mod = new T.Group(); mod.position.set(0, 1.0, 0); scene.add(mod);
  const prof = new T.Shape(); prof.moveTo(-.42, .22); prof.lineTo(.42, .22); prof.lineTo(.42, -.22); prof.lineTo(-.2, -.22); prof.lineTo(-.42, -.02); prof.closePath();
  const hg = new T.ExtrudeGeometry(prof, { depth: 1.42, bevelEnabled: true, bevelThickness: .018, bevelSize: .018, bevelSegments: 3, curveSegments: 1 }); hg.translate(0, 0, -.71);
  const housing = new T.Mesh(hg, anod); housing.castShadow = true; mod.add(housing);
  const cg = new T.ExtrudeGeometry(prof, { depth: .04, bevelEnabled: true, bevelThickness: .008, bevelSize: .012, bevelSegments: 2, curveSegments: 1 }); cg.translate(0, 0, -.02); cg.scale(1.05, 1.05, 1);
  for (const z of [-.75, .75]) { const c = new T.Mesh(cg, alu); c.position.z = z; c.castShadow = true; mod.add(c); }
  // optics on the chamfered face
  const nrm = new T.Vector3(-1, -1, 0).normalize();
  const opt = new T.Group(); opt.position.set(-.31 + nrm.x * .02, -.12 + nrm.y * .02, 0);
  opt.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), nrm); mod.add(opt);
  const win = new T.Mesh(new T.BoxGeometry(.2, .006, 1.3), winGlass); win.position.y = .002; opt.add(win);
  for (const [z, r] of [[-.42, .042], [0, .068], [.42, .042]]) {
    const barrel = new T.Mesh(new T.CylinderGeometry(r + .014, r + .014, .03, 48), darkM); barrel.position.y = .012; opt.add(barrel);
    const ring = new T.Mesh(new T.TorusGeometry(r + .007, .004, 12, 48), alu); ring.rotation.x = Math.PI / 2; ring.position.y = .027; opt.add(ring);
    const inner = new T.Mesh(new T.CylinderGeometry(r, r, .002, 48), black); inner.position.y = .026; opt.add(inner);
    const R = r / Math.sin(.55);
    const dome = new T.Mesh(new T.SphereGeometry(R, 48, 16, 0, Math.PI * 2, 0, .55), glass); dome.position.y = .026 - R * Math.cos(.55); opt.add(dome);
    [barrel, ring, inner, dome].forEach(m => m.position.z = z);
  }
  // front face details
  const label = new T.Mesh(new T.PlaneGeometry(.56, .07), new T.MeshBasicMaterial({ map: textTex, transparent: true, color: 0x9aa3ae, opacity: .8, depthWrite: false }));
  label.position.set(-.4395, .15, -.36); label.rotation.y = -Math.PI / 2; mod.add(label);
  for (let i = 0; i < 6; i++) { const v = new T.Mesh(new T.BoxGeometry(.006, .01, .3), black); v.position.set(-.437, .03 + i * .024, .1); mod.add(v); }
  const bezel = new T.Mesh(new T.BoxGeometry(.008, .032, .17), black); bezel.position.set(-.437, .16, .52); mod.add(bezel);
  const leds = [];
  [[.46, 'acc'], [.52, 'acc'], [.58, AMB]].forEach(([z, c]) => {
    const m = new T.Mesh(new T.BoxGeometry(.006, .014, .028), emis(c === 'acc' ? acc : c, 3)); m.position.set(-.442, .16, z); mod.add(m);
    const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: c === 'acc' ? acc.clone() : new T.Color(c), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: .7 }));
    s.scale.set(.09, .09, 1); s.position.set(-.452, .16, z); mod.add(s);
    leds.push({ m, s, c });
  });
  // emitter slot on the underside
  const slot = new T.Mesh(new T.BoxGeometry(.12, .006, 1.34), black); slot.position.set(.08, -.236, 0); mod.add(slot);
  const emitter = new T.Mesh(new T.BoxGeometry(.045, .008, 1.26), emis(acc, 4)); emitter.position.set(.08, -.24, 0); mod.add(emitter);

  // NIR laser sheet + belt line
  const BX = .08, SH = .76;
  const sheetMats = [];
  const sheetShader = (k) => new T.ShaderMaterial({
    uniforms: { uColor: { value: acc.clone() }, uTime: { value: 0 }, uK: { value: k } },
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uK; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        float edge = smoothstep(0.0,0.06,vUv.x)*smoothstep(1.0,0.94,vUv.x);
        float body = mix(0.18,0.9,pow(vUv.y,1.6));
        float contact = exp(-vUv.y*26.0)*1.1;
        float flick = 0.9 + 0.1*sin(uTime*37.0 + vUv.x*80.0);
        vec2 g = floor(vec2(vUv.x*220.0, vUv.y*90.0 + uTime*6.0));
        float dust = step(0.995, h(g))*0.5;
        float a = (body*0.32*flick + contact + dust*body) * edge * uK;
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  [[-.022, .35], [0, 1], [.022, .35]].forEach(([dx, k]) => {
    const m = sheetShader(k); sheetMats.push(m);
    const p = new T.Mesh(new T.PlaneGeometry(1.22, SH), m); p.rotation.y = Math.PI / 2; p.position.set(BX + dx, SH / 2, 0); scene.add(p);
  });
  const lineMat = new T.ShaderMaterial({
    uniforms: { uColor: { value: acc.clone() } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; varying vec2 vUv;
      void main(){ float d=vUv.x-0.5; float e=smoothstep(0.0,0.05,vUv.y)*smoothstep(1.0,0.95,vUv.y);
        float a=(exp(-d*d*900.0)*0.45 + exp(-d*d*40000.0)*1.6)*e;
        gl_FragColor=vec4(uColor*(1.0+exp(-d*d*40000.0)), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const line = new T.Mesh(new T.PlaneGeometry(.6, 1.22), lineMat); line.rotation.x = -Math.PI / 2; line.position.set(BX, .013, 0); scene.add(line);
  sheetMats.push(lineMat);

  // lights
  const key = new T.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, 6, 2.5); key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 15 });
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0004; key.shadow.normalBias = .02; scene.add(key);
  const rim1 = new T.DirectionalLight(0xd6e8ff, 2.4); rim1.position.set(4, 2.5, -4); scene.add(rim1);
  const rim2 = new T.DirectionalLight(acc.clone(), 1.0); rim2.position.set(-2, 1.2, -5); scene.add(rim2);
  const spot = new T.SpotLight(acc.clone(), 3, 3, .6, .7, 1.2); spot.position.set(BX, .76, 0); spot.target.position.set(BX, 0, 0); scene.add(spot, spot.target);

  // flakes
  const fs = new T.Shape(); for (let i = 0, N = 7; i < N; i++) { const a = i / N * Math.PI * 2 + (Math.random() - .5) * .5, r = .6 + Math.random() * .4; i ? fs.lineTo(Math.cos(a) * r, Math.sin(a) * r) : fs.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const fg = new T.ShapeGeometry(fs); fg.rotateX(-Math.PI / 2);
  const NF = 1800;
  const petMat = new T.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .4, roughness: .08, metalness: 0, clearcoat: 1, clearcoatRoughness: .05, ior: 1.57, envMapIntensity: 1.25, side: T.DoubleSide, depthWrite: false });
  const pet = new T.InstancedMesh(fg, petMat, NF); pet.instanceMatrix.setUsage(T.DynamicDrawUsage); pet.receiveShadow = true; pet.frustumCulled = false; scene.add(pet);
  const tints = [[.62, .74, .8], [.56, .7, .82], [.62, .76, .72], [.7, .74, .78]];
  const F = [], col = new T.Color(), dmy = new T.Object3D();
  for (let i = 0; i < NF; i++) { F.push({ x: -9 + Math.random() * 18, z: (Math.random() * 2 - 1) * .56, y: .003 + Math.random() * .006, s: .024 + Math.random() * .024, sx: .7 + Math.random() * .6, ry: Math.random() * 6.28, rx: (Math.random() - .5) * .5, rz: (Math.random() - .5) * .5, c: tints[i % 4] }); pet.setColorAt(i, col.setRGB(...tints[i % 4])); }
  pet.instanceColor.setUsage(T.DynamicDrawUsage);

  // contaminants — sparse, well spaced
  const CT = [
    { name: 'PP CAP', col: AMB, w: .4, mat: new T.MeshPhysicalMaterial({ color: 0x2c63d0, roughness: .35, clearcoat: .6 }) },
    { name: 'PVC', col: RED, w: .3, mat: new T.MeshPhysicalMaterial({ color: 0xd9d2b8, roughness: .3, transparent: true, opacity: .88, clearcoat: .8 }) },
    { name: 'LABEL', col: AMB, w: .2, mat: new T.MeshStandardMaterial({ color: 0xefefe8, roughness: .9 }) },
    { name: 'ALU', col: RED, w: .1, mat: new T.MeshStandardMaterial({ color: 0xc9ced6, metalness: 1, roughness: .25 }) }
  ];
  const pick = () => { let r = Math.random(); for (const c of CT) { if ((r -= c.w) <= 0) return c; } return CT[0]; };
  const C = []; let nid = 1329, lastSpawnX = 0;
  const spawn = (x) => {
    const t = pick(), m = new T.Mesh(fg, t.mat); const s = .05 + Math.random() * .015;
    m.scale.set(s * (.8 + Math.random() * .4), 1, s); m.rotation.set((Math.random() - .5) * .3, Math.random() * 6.28, (Math.random() - .5) * .3);
    const z = (Math.random() * 2 - 1) * .38; m.position.set(x, .009, z); scene.add(m);
    C.push({ m, x, z, t, id: nid++, conf: (.91 + Math.random() * .08).toFixed(2), ox: 0, oy: 0, ob: 0, lock: 0 }); lastSpawnX = x;
  };
  for (let x = 6; x > -9; x -= 1.15 + (Math.random() - .5) * .4) spawn(x);
  C.reverse(); lastSpawnX = C[C.length - 1].x;
  C.sort((a, b) => a.id - b.id);

  // overlay
  const octx = ov.getContext('2d');
  let W = 1, H = 1, odpr = 1;
  const resize = () => {
    W = gl.clientWidth || 1; H = gl.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); renderer.setSize(W, H, false);
    odpr = Math.min(2, window.devicePixelRatio || 1); ov.width = Math.round(W * odpr); ov.height = Math.round(H * odpr);
    const wide = W > 900, asp = W / H;
    const dist = wide ? 6.2 * Math.max(1, Math.min(1.3, 1180 / W)) : Math.min(13, 6.2 * Math.max(1.15, 1.35 / asp));
    const tgt = new T.Vector3(.25, wide ? .42 : .1, .05), dir = new T.Vector3(-.62, .36, .7).normalize();
    camera.position.copy(tgt).addScaledVector(dir, dist); camera.lookAt(tgt);
    scene.fog.near = dist + .8; scene.fog.far = dist + 7.5;
    camera.aspect = asp; camera.updateProjectionMatrix();
    // gentle horizontal lens shift: frames the belt on a clean diagonal and keeps
    // a safe right margin so the CV callouts never kiss the viewport edge.
    camera.projectionMatrix.elements[8] = wide ? -.38 : 0;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  };
  const ro = new ResizeObserver(resize); ro.observe(gl); resize();

  const P = new T.Vector3(), Q = new T.Vector3();
  const toScreen = (v) => { v.project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
  const drawOverlay = (dt) => {
    octx.setTransform(odpr, 0, 0, odpr, 0, 0); octx.clearRect(0, 0, W, H);
    octx.font = '500 11px "Geist Mono", ui-monospace, monospace'; octx.textBaseline = 'middle';
    const MARGIN = 14, lk = Math.min(1, dt * 12); // lerp factor toward locked target
    let shown = 0;
    for (const c of C) {
      const d = c.x - BX; if (d < -.02 || d > 2.4 || shown >= 3) continue; shown++;
      const a = Math.min(1, (d + .02) / .12) * Math.min(1, (2.4 - d) / .4);
      const [sx, sy] = toScreen(P.set(c.x, .01, c.z));
      const [qx] = toScreen(Q.set(c.x, .01, c.z + .07));
      const bTarget = Math.max(18, Math.min(44, Math.abs(qx - sx) * 2.4 + 8));
      // lerp the drawn box toward the projected target; "lock on" scale-in on entry
      if (!c.lock) { c.ox = sx; c.oy = sy; c.ob = bTarget * 1.9; c.lock = 1; }
      c.ox += (sx - c.ox) * lk; c.oy += (sy - c.oy) * lk; c.ob += (bTarget - c.ob) * lk;
      const bx = c.ox, by = c.oy, b = c.ob, x0 = bx - b / 2, y0 = by - b / 2, k = b * .3;
      octx.globalAlpha = a; octx.strokeStyle = c.t.col; octx.lineWidth = 1.5; octx.beginPath();
      octx.moveTo(x0, y0 + k); octx.lineTo(x0, y0); octx.lineTo(x0 + k, y0); octx.moveTo(x0 + b - k, y0); octx.lineTo(x0 + b, y0); octx.lineTo(x0 + b, y0 + k);
      octx.moveTo(x0 + b, y0 + b - k); octx.lineTo(x0 + b, y0 + b); octx.lineTo(x0 + b - k, y0 + b); octx.moveTo(x0 + k, y0 + b); octx.lineTo(x0, y0 + b); octx.lineTo(x0, y0 + b - k); octx.stroke();
      octx.fillStyle = c.t.col; octx.fillRect(bx - 1.5, by - 1.5, 3, 3);
      // label chip — clamp inside the viewport; flip to the left if it would overflow
      const s1 = '#' + c.id + ' ', s2 = c.t.name + ' ', s3 = c.conf;
      const w1 = octx.measureText(s1).width, w2 = octx.measureText(s2).width, w3 = octx.measureText(s3).width, cw = w1 + w2 + w3 + 18;
      let lx = x0 + b + 16, ly = y0 - 22, flip = false;
      if (lx + cw > W - MARGIN) { lx = x0 - cw - 16; flip = true; }
      if (lx < MARGIN) { lx = MARGIN; }
      if (ly < MARGIN) { ly = y0 + b + 22; }
      octx.lineWidth = 1; octx.beginPath();
      if (flip) { octx.moveTo(x0, y0); octx.lineTo(lx + cw + 4, ly); octx.lineTo(lx + cw, ly); }
      else { octx.moveTo(x0 + b, y0); octx.lineTo(lx - 4, ly); octx.lineTo(lx, ly); }
      octx.strokeStyle = c.t.col; octx.stroke();
      octx.fillStyle = 'rgba(8,9,12,.84)'; octx.fillRect(lx, ly - 10, cw, 20);
      octx.strokeStyle = 'rgba(255,255,255,.08)'; octx.strokeRect(lx + .5, ly - 9.5, cw - 1, 19);
      octx.fillStyle = c.t.col; octx.fillRect(lx, ly - 10, 2, 20);
      octx.fillStyle = '#9BA3AF'; octx.fillText(s1, lx + 9, ly + .5);
      octx.fillStyle = c.t.col; octx.fillText(s2, lx + 9 + w1, ly + .5);
      octx.fillStyle = '#EEF1F5'; octx.fillText(s3, lx + 9 + w1 + w2, ly + .5);
    }
    octx.globalAlpha = 1;
  };

  // loop
  let raf = 0, last = 0, alive = true, kg = 784.2, batch = 404, jit = 0, firstDone = false;
  const accHi = new T.Color();
  const renderOnce = (t) => {
    const ts = t / 1000; sheetMats.forEach(m => { if (m.uniforms.uTime) m.uniforms.uTime.value = ts; });
    renderer.render(scene, camera); drawOverlay(0.016);
  };
  const frame = (t) => {
    if (!alive) return; raf = requestAnimationFrame(frame);
    const r = ov.getBoundingClientRect(); if (r.bottom < 0 || r.top > window.innerHeight) { last = 0; return; }
    const dt = Math.min(.05, (t - (last || t)) / 1000); last = t;
    const v = 1.35 * speed, step = v * dt;
    beltMap.offset.x -= step / 2; beltBump.offset.x = beltMap.offset.x;
    accHi.copy(acc).multiplyScalar(2.6);
    for (let i = 0; i < NF; i++) {
      const f = F[i]; f.x += step; if (f.x > 9) f.x -= 18;
      dmy.position.set(f.x, f.y, f.z); dmy.rotation.set(f.rx, f.ry, f.rz); dmy.scale.set(f.s * f.sx, 1, f.s); dmy.updateMatrix(); pet.setMatrixAt(i, dmy.matrix);
      // crisp cyan glint exactly as a flake crosses the NIR laser plane
      const d = f.x - BX, g = Math.exp(-(d * d) / .0016);
      col.setRGB(f.c[0], f.c[1], f.c[2]); if (g > .01) col.lerp(accHi, Math.min(1, g * 1.15)); pet.setColorAt(i, col);
    }
    pet.instanceMatrix.needsUpdate = true; pet.instanceColor.needsUpdate = true;
    for (let i = C.length - 1; i >= 0; i--) { const c = C[i]; c.x += step; c.m.position.x = c.x; if (c.x > 9) { scene.remove(c.m); C.splice(i, 1); } }
    lastSpawnX += step; if (lastSpawnX > -9 + 1.15 + (nid % 3) * .15) spawn(-9);
    const ts = t / 1000; sheetMats.forEach(m => { if (m.uniforms.uTime) m.uniforms.uTime.value = ts; });
    const blink = Math.sin(ts * 7) > 0 ? 1 : .15;
    leds[1].s.material.opacity = .7 * blink; leds[1].m.material.color.copy(acc).multiplyScalar(3 * blink);
    renderer.render(scene, camera); drawOverlay(dt);
    kg += step * 6; if (kg >= 850) { kg = 0; batch++; }
    jit += dt;
    if (jit > .4) {
      jit = 0;
      if (o.kgEl) o.kgEl.textContent = kg.toFixed(1) + ' kg';
      if (o.petEl) o.petEl.textContent = (98.1 + (Math.random() - .5) * .2).toFixed(1) + '%';
      if (o.batchEl) o.batchEl.textContent = 'BATCH #' + String(batch).padStart(4, '0');
    }
    if (!firstDone) { firstDone = true; if (o.onReady) o.onReady(); }
  };
  // Render one studio-lit frame synchronously, then signal readiness so the page
  // can cross-fade the poster out with zero flash of empty canvas.
  renderOnce(performance.now());
  if (o.onReady) o.onReady();
  firstDone = true;
  raf = requestAnimationFrame(frame);

  return {
    setAccent(h) {
      acc.set(h);
      sheetMats.forEach(m => m.uniforms.uColor.value.copy(acc));
      emitter.material.color.copy(acc).multiplyScalar(4);
      spot.color.copy(acc); rim2.color.copy(acc);
      leds.forEach(l => { if (l.c === 'acc') { l.m.material.color.copy(acc).multiplyScalar(3); l.s.material.color.copy(acc); } });
    },
    setSpeed(s) { speed = s; },
    dispose() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); envRT.dispose(); pm.dispose(); renderer.dispose(); }
  };
}
