/**
 * ═══════════════════════════════════════════════════════════════
 *  SANTA ROSA 3D — Stylized Interactive Neighborhood Map
 *  Cali, Colombia
 *
 *  Architecture:
 *   §1  OrbitControls (inline, no external dep)
 *   §2  Scene, camera, renderer
 *   §3  Lighting
 *   §4  Ground & grid
 *   §5  Road network
 *   §6  Sidewalks
 *   §7  City blocks & buildings
 *   §8  Trees
 *   §9  Plaza
 *   §10 Hotspot pins
 *   §11 DOM label sprites
 *   §12 Raycasting (hover & click)
 *   §13 Info panel
 *   §14 Guided tour
 *   §15 Camera utilities
 *   §16 Animation loop
 * ═══════════════════════════════════════════════════════════════
 */

/* ──────────────────────────────────────────────────────────────
   §1  ORBIT CONTROLS  (Three.js r128 compatible, self-contained)
────────────────────────────────────────────────────────────── */
THREE.OrbitControls = function (camera, domElement) {
  this.camera = camera;
  this.domElement = domElement;
  this.object = camera;

  this.enabled        = true;
  this.target         = new THREE.Vector3();
  this.enableDamping  = true;
  this.dampingFactor  = 0.07;
  this.enableZoom     = true;
  this.zoomSpeed      = 1.1;
  this.enableRotate   = true;
  this.rotateSpeed    = 0.65;
  this.enablePan      = true;
  this.panSpeed       = 0.8;
  this.minDistance    = 15;
  this.maxDistance    = 220;
  this.minPolarAngle  = 0.2;
  this.maxPolarAngle  = Math.PI / 2.05;

  const _sph      = new THREE.Spherical();
  const _sphDelta = new THREE.Spherical();
  const _panOff   = new THREE.Vector3();
  let   _scale    = 1;

  const STATE = { NONE:-1, ROTATE:0, DOLLY:1, PAN:2 };
  let state = STATE.NONE;

  const rStart = new THREE.Vector2(), rEnd = new THREE.Vector2(), rDelta = new THREE.Vector2();
  const pStart = new THREE.Vector2(), pEnd = new THREE.Vector2(), pDelta = new THREE.Vector2();

  const self = this;

  // helpers
  function zs() { return Math.pow(0.95, self.zoomSpeed); }

  const _panL = new THREE.Vector3();
  function panLeft(d, m) {
    _panL.setFromMatrixColumn(m, 0).multiplyScalar(-d);
    _panOff.add(_panL);
  }
  const _panU = new THREE.Vector3();
  function panUp(d, m) {
    _panU.setFromMatrixColumn(m, 1).multiplyScalar(d);
    _panOff.add(_panU);
  }
  const _tmp = new THREE.Vector3();
  function pan(dx, dy) {
    const el  = self.domElement;
    const fov = self.object.fov * Math.PI / 180;
    const td  = _tmp.copy(self.object.position).sub(self.target).length();
    const px  = 2 * Math.tan(fov / 2) * td;
    panLeft(dx * px / el.clientHeight, self.object.matrix);
    panUp(dy * px / el.clientHeight, self.object.matrix);
  }

  this.update = (function () {
    const off = new THREE.Vector3();
    const q   = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0,1,0));
    const qi  = q.clone().invert();
    const lp  = new THREE.Vector3();
    const lq  = new THREE.Quaternion();
    const EPS = 0.000001;
    return function () {
      const pos = self.object.position;
      off.copy(pos).sub(self.target).applyQuaternion(q);
      _sph.setFromVector3(off);
      _sph.theta += _sphDelta.theta * self.dampingFactor;
      _sph.phi   += _sphDelta.phi   * self.dampingFactor;
      _sph.phi    = Math.max(self.minPolarAngle, Math.min(self.maxPolarAngle, _sph.phi));
      _sph.makeSafe();
      _sph.radius *= _scale;
      _sph.radius  = Math.max(self.minDistance, Math.min(self.maxDistance, _sph.radius));
      self.target.addScaledVector(_panOff, self.dampingFactor);
      off.setFromSpherical(_sph).applyQuaternion(qi);
      pos.copy(self.target).add(off);
      self.object.lookAt(self.target);
      if (self.enableDamping) {
        _sphDelta.theta *= (1 - self.dampingFactor);
        _sphDelta.phi   *= (1 - self.dampingFactor);
        _panOff.multiplyScalar(1 - self.dampingFactor);
      } else {
        _sphDelta.set(0,0,0);
        _panOff.set(0,0,0);
      }
      _scale = 1;
      return lp.distanceToSquared(pos) > EPS || 8*(1-lq.dot(self.object.quaternion)) > EPS
        ? (lp.copy(pos), lq.copy(self.object.quaternion), true) : false;
    };
  }());

  function onDown(e) {
    if (!self.enabled) return;
    if (e.button === 0) { state = STATE.ROTATE; rStart.set(e.clientX, e.clientY); }
    else if (e.button === 2) { state = STATE.PAN; pStart.set(e.clientX, e.clientY); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  function onMove(e) {
    if (!self.enabled) return;
    const el = self.domElement;
    if (state === STATE.ROTATE) {
      rEnd.set(e.clientX, e.clientY);
      rDelta.subVectors(rEnd, rStart).multiplyScalar(self.rotateSpeed);
      _sphDelta.theta -= 2 * Math.PI * rDelta.x / el.clientHeight;
      _sphDelta.phi   -= 2 * Math.PI * rDelta.y / el.clientHeight;
      rStart.copy(rEnd);
    } else if (state === STATE.PAN) {
      pEnd.set(e.clientX, e.clientY);
      pDelta.subVectors(pEnd, pStart).multiplyScalar(self.panSpeed);
      pan(pDelta.x, pDelta.y);
      pStart.copy(pEnd);
    }
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    state = STATE.NONE;
  }
  function onWheel(e) {
    if (!self.enabled || !self.enableZoom) return;
    e.preventDefault();
    _scale = e.deltaY < 0 ? _scale * zs() : _scale / zs();
  }
  // Touch
  let _pt1 = new THREE.Vector2(), _pt2 = new THREE.Vector2(), _ptd = 0;
  function onTouchStart(e) {
    if (!self.enabled) return;
    if (e.touches.length === 1) { state = STATE.ROTATE; rStart.set(e.touches[0].pageX, e.touches[0].pageY); }
    else if (e.touches.length === 2) {
      state = STATE.DOLLY;
      _pt1.set(e.touches[0].pageX, e.touches[0].pageY);
      _pt2.set(e.touches[1].pageX, e.touches[1].pageY);
      _ptd = _pt1.distanceTo(_pt2);
    }
  }
  function onTouchMove(e) {
    if (!self.enabled) return; e.preventDefault();
    const el = self.domElement;
    if (e.touches.length === 1 && state === STATE.ROTATE) {
      rEnd.set(e.touches[0].pageX, e.touches[0].pageY);
      rDelta.subVectors(rEnd, rStart).multiplyScalar(self.rotateSpeed);
      _sphDelta.theta -= 2*Math.PI*rDelta.x/el.clientHeight;
      _sphDelta.phi   -= 2*Math.PI*rDelta.y/el.clientHeight;
      rStart.copy(rEnd);
    } else if (e.touches.length === 2 && state === STATE.DOLLY) {
      _pt1.set(e.touches[0].pageX, e.touches[0].pageY);
      _pt2.set(e.touches[1].pageX, e.touches[1].pageY);
      const d = _pt1.distanceTo(_pt2);
      _scale = d > _ptd ? _scale * zs() : _scale / zs();
      _ptd = d;
    }
  }

  domElement.addEventListener('mousedown', onDown, false);
  domElement.addEventListener('wheel', onWheel, { passive: false });
  domElement.addEventListener('touchstart', onTouchStart, { passive: true });
  domElement.addEventListener('touchmove', onTouchMove, { passive: false });
  domElement.addEventListener('touchend', () => { state = STATE.NONE; }, false);

  this.update();
};


/* ──────────────────────────────────────────────────────────────
   §2  SCENE · CAMERA · RENDERER
────────────────────────────────────────────────────────────── */

const canvas   = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled  = true;
renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
renderer.outputEncoding     = THREE.sRGBEncoding;
renderer.toneMapping        = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fbfd4);
scene.fog = new THREE.FogExp2(0x9eccd8, 0.007);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 1200);
// Drone-like angled top-down default
camera.position.set(0, 95, 110);
camera.lookAt(0, 0, 0);

const controls = new THREE.OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.update();

// Snapshot for reset
const CAM0_POS = camera.position.clone();
const CAM0_TGT = controls.target.clone();

const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();


/* ──────────────────────────────────────────────────────────────
   §3  LIGHTING
   Key sun + fill + hemisphere + ambient
────────────────────────────────────────────────────────────── */

// Warm hemisphere
const hemi = new THREE.HemisphereLight(0xb8d8f0, 0x8fa87a, 0.55);
scene.add(hemi);

// Ambient
const ambient = new THREE.AmbientLight(0xfff8ee, 0.45);
scene.add(ambient);

// Sun directional
const sun = new THREE.DirectionalLight(0xfff5d6, 1.3);
sun.position.set(60, 120, 80);
sun.castShadow = true;
sun.shadow.mapSize.width  = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near   = 1;
sun.shadow.camera.far    = 500;
sun.shadow.camera.left   = -120;
sun.shadow.camera.right  =  120;
sun.shadow.camera.top    =  120;
sun.shadow.camera.bottom = -120;
sun.shadow.bias          = -0.0006;
scene.add(sun);
scene.add(sun.target);


/* ──────────────────────────────────────────────────────────────
   §4  GROUND  &  SUBTLE GRID
────────────────────────────────────────────────────────────── */

// Main ground plane (grass / earth)
const groundGeo = new THREE.PlaneGeometry(300, 300);
const groundMat = new THREE.MeshLambertMaterial({ color: 0x7a9e6e });
const ground    = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Subtle block-lot grid overlay
const gridHelper = new THREE.GridHelper(200, 40, 0x5a7a4a, 0x5a7a4a);
gridHelper.material.transparent = true;
gridHelper.material.opacity     = 0.15;
gridHelper.position.y           = 0.05;
scene.add(gridHelper);


/* ──────────────────────────────────────────────────────────────
   §5  ROAD NETWORK
   Two main perpendicular avenues + secondary cross streets.
   Roads are flat planes with a slightly raised kerb strip.
────────────────────────────────────────────────────────────── */

const ROAD_COLOR  = 0x2e2e2e;
const KERB_COLOR  = 0x888880;
const ROAD_MAT    = new THREE.MeshLambertMaterial({ color: ROAD_COLOR });
const KERB_MAT    = new THREE.MeshLambertMaterial({ color: KERB_COLOR });

/**
 * makeRoad(x, z, w, d, axis)
 * Lays a road ribbon.
 *   x,z   = center position
 *   w,d   = width, depth (in XZ)
 *   Creates the asphalt slab + two kerb strips.
 */
function makeRoad(x, z, w, d) {
  // Asphalt
  const geo  = new THREE.BoxGeometry(w, 0.12, d);
  const mesh = new THREE.Mesh(geo, ROAD_MAT);
  mesh.position.set(x, 0.06, z);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Kerbs — along the long side
  const kw = (w > d) ? 0.5 : w;
  const kd = (w > d) ? d   : 0.5;
  const kh = 0.18;
  const offX = (w > d) ? 0         : (w / 2 + 0.25);
  const offZ = (w > d) ? (d / 2 + 0.25) : 0;

  [-1, 1].forEach(s => {
    const k = new THREE.Mesh(
      new THREE.BoxGeometry(kw, kh, kd),
      KERB_MAT
    );
    k.position.set(x + s * offX, kh / 2, z + s * offZ);
    k.receiveShadow = true;
    scene.add(k);
  });
}

// Main Avenue — runs North-South (along Z)
makeRoad(0, 0, 9, 260);

// Cross Avenue — runs East-West (along X)
makeRoad(0, 5, 260, 9);

// Secondary streets
[[-45, 0, 5, 260], [45, 0, 5, 260],                     // N-S secondaries
 [0, -40, 260, 5],  [0, 40, 260, 5],                     // E-W secondaries
 [0, -80, 260, 4],  [0, 80, 260, 4],                     // farther E-W
 [-45, -40, 4, 80],[45, -40, 4, 80],                     // short links
 [-45,  40, 4, 80],[45,  40, 4, 80]
].forEach(r => makeRoad(...r));


/* ──────────────────────────────────────────────────────────────
   §6  SIDEWALKS
   Thin concrete strips along main roads.
────────────────────────────────────────────────────────────── */
const SW_MAT = new THREE.MeshLambertMaterial({ color: 0xc8bfb0 });

function makeSidewalk(x, z, w, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, d), SW_MAT);
  m.position.set(x, 0.075, z);
  m.receiveShadow = true;
  scene.add(m);
}

// Sidewalks flanking main N-S avenue
makeSidewalk(-5.8, 0, 1.5, 260);
makeSidewalk( 5.8, 0, 1.5, 260);

// Sidewalks flanking main E-W avenue
makeSidewalk(0,  10.8, 260, 1.5);
makeSidewalk(0, -10.8, 260, 1.5);


/* ──────────────────────────────────────────────────────────────
   §7  CITY BLOCKS  &  BUILDINGS
   We define explicit city blocks as groups of buildings.
   Each block sits in one of the four quadrants formed by
   the two main avenues, further divided by secondary streets.

   Building geometry: BoxGeometry with a flat-top cap mesh
   for subtle roof shading.

   Color palette:
     Warm gray   0xd4cbbf
     Light concrete 0xc8beb0
     Soft beige  0xe2d8cc
     Pale ochre  0xd6c8b0
     Stone white 0xddd5c8
────────────────────────────────────────────────────────────── */

const BCOLORS = [0xd4cbbf, 0xc8beb0, 0xe2d8cc, 0xd6c8b0, 0xddd5c8, 0xcbc0b4, 0xd8d0c4];
const ROOF_COLORS = [0xbfb6a8, 0xb8afa0, 0xc8bfb0, 0xc4bba8, 0xbab0a4];

/**
 * makeBuilding(x, z, w, h, d, colorIdx)
 * Creates one building: walls + slightly darker roof slab.
 */
function makeBuilding(x, z, w, h, d, ci) {
  ci = ci !== undefined ? ci : Math.floor(Math.random() * BCOLORS.length);
  const mat     = new THREE.MeshLambertMaterial({ color: BCOLORS[ci] });
  const roofMat = new THREE.MeshLambertMaterial({ color: ROOF_COLORS[ci % ROOF_COLORS.length] });

  // Walls
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.set(x, h / 2, z);
  body.castShadow   = true;
  body.receiveShadow = true;
  scene.add(body);

  // Roof cap (slightly wider, darker)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.15, 0.22, d + 0.15), roofMat);
  roof.position.set(x, h + 0.11, z);
  roof.castShadow = true;
  scene.add(roof);
}

/**
 * makeBlock(cx, cz, blockW, blockD, buildings)
 * Lays out a city block. buildings[] is an array of
 * relative [{rx, rz, w, h, d}] placements.
 */
function makeBlock(cx, cz, buildings) {
  buildings.forEach(b => {
    makeBuilding(cx + b.rx, cz + b.rz, b.w, b.h, b.d, b.ci);
  });
}

// ── QUADRANT  NW  (x < 0, z < -12) ──────────────────────────

// Block NW-1
makeBlock(-24, -32, [
  { rx:  0,   rz:  0,   w: 9,  h: 9,  d: 7,  ci: 0 },
  { rx:  11,  rz:  0,   w: 7,  h: 6,  d: 7,  ci: 2 },
  { rx: -11,  rz:  0,   w: 6,  h: 12, d: 7,  ci: 4 },
  { rx:  0,   rz:  8,   w: 14, h: 5,  d: 5,  ci: 1 },
  { rx:  0,   rz: -9,   w: 10, h: 7,  d: 6,  ci: 3 },
]);

// Block NW-2
makeBlock(-24, -62, [
  { rx:  0,   rz:  0,   w: 8,  h: 14, d: 8,  ci: 5 },
  { rx:  10,  rz:  2,   w: 6,  h: 8,  d: 10, ci: 0 },
  { rx: -10,  rz: -2,   w: 7,  h: 6,  d: 6,  ci: 2 },
  { rx:  5,   rz: -9,   w: 10, h: 5,  d: 5,  ci: 6 },
]);

// Block NW-3
makeBlock(-60, -32, [
  { rx:  0,   rz:  0,   w: 12, h: 7,  d: 10, ci: 1 },
  { rx:  0,   rz:  12,  w: 8,  h: 10, d: 7,  ci: 3 },
  { rx:  12,  rz:  5,   w: 7,  h: 5,  d: 12, ci: 6 },
  { rx: -12,  rz:  3,   w: 6,  h: 8,  d: 8,  ci: 4 },
]);

// Block NW-4  (small row houses feel)
makeBlock(-60, -62, [
  { rx: -10,  rz:  0,   w: 5,  h: 5,  d: 8,  ci: 0 },
  { rx:  -4,  rz:  0,   w: 5,  h: 7,  d: 8,  ci: 2 },
  { rx:   2,  rz:  0,   w: 5,  h: 5,  d: 8,  ci: 1 },
  { rx:   8,  rz:  0,   w: 5,  h: 6,  d: 8,  ci: 5 },
  { rx:   0,  rz: -10,  w: 18, h: 4,  d: 6,  ci: 3 },
]);

// ── QUADRANT  NE  (x > 0, z < -12) ──────────────────────────

makeBlock(24, -32, [
  { rx:  0,   rz:  0,   w: 10, h: 8,  d: 8,  ci: 2 },
  { rx:  11,  rz:  3,   w: 6,  h: 11, d: 10, ci: 0 },
  { rx: -11,  rz: -3,   w: 7,  h: 5,  d: 7,  ci: 4 },
  { rx:  2,   rz: -10,  w: 12, h: 6,  d: 5,  ci: 1 },
  { rx: -3,   rz:  10,  w: 9,  h: 4,  d: 5,  ci: 6 },
]);

makeBlock(60, -32, [
  { rx:  0,   rz:  0,   w: 14, h: 6,  d: 10, ci: 3 },
  { rx:  0,   rz:  11,  w: 10, h: 9,  d: 7,  ci: 5 },
  { rx:  0,   rz: -11,  w: 10, h: 5,  d: 6,  ci: 0 },
  { rx: -14,  rz:  3,   w: 6,  h: 7,  d: 11, ci: 2 },
]);

makeBlock(24, -62, [
  { rx:  0,   rz:  0,   w: 9,  h: 13, d: 9,  ci: 6 },
  { rx:  11,  rz:  0,   w: 8,  h: 7,  d: 9,  ci: 1 },
  { rx: -11,  rz:  0,   w: 8,  h: 5,  d: 9,  ci: 3 },
  { rx:  0,   rz:  10,  w: 14, h: 4,  d: 6,  ci: 4 },
]);

makeBlock(60, -62, [
  { rx: -8,   rz:  0,   w: 5,  h: 6,  d: 9,  ci: 0 },
  { rx: -2,   rz:  0,   w: 5,  h: 8,  d: 9,  ci: 2 },
  { rx:  4,   rz:  0,   w: 5,  h: 5,  d: 9,  ci: 5 },
  { rx:  0,   rz: -10,  w: 16, h: 10, d: 6,  ci: 1 },
]);

// ── QUADRANT  SW  (x < 0, z > 12) ───────────────────────────

makeBlock(-24, 32, [
  { rx:  0,   rz:  0,   w: 11, h: 7,  d: 9,  ci: 1 },
  { rx:  12,  rz:  0,   w: 7,  h: 10, d: 9,  ci: 4 },
  { rx: -12,  rz:  0,   w: 7,  h: 6,  d: 9,  ci: 6 },
  { rx:  2,   rz:  10,  w: 12, h: 5,  d: 6,  ci: 0 },
  { rx: -2,   rz: -10,  w: 10, h: 8,  d: 6,  ci: 3 },
]);

makeBlock(-60, 32, [
  { rx:  0,   rz:  0,   w: 10, h: 9,  d: 12, ci: 2 },
  { rx:  12,  rz: -2,   w: 7,  h: 6,  d: 10, ci: 5 },
  { rx: -13,  rz:  2,   w: 6,  h: 5,  d: 8,  ci: 1 },
  { rx:  2,   rz:  12,  w: 15, h: 4,  d: 6,  ci: 3 },
]);

makeBlock(-24, 62, [
  { rx:  0,   rz:  0,   w: 8,  h: 6,  d: 8,  ci: 0 },
  { rx:  10,  rz:  2,   w: 6,  h: 9,  d: 10, ci: 6 },
  { rx: -10,  rz: -2,   w: 7,  h: 5,  d: 7,  ci: 2 },
  { rx:  0,   rz: -10,  w: 12, h: 7,  d: 5,  ci: 4 },
]);

makeBlock(-60, 62, [
  { rx:  0,   rz:  0,   w: 7,  h: 4,  d: 7,  ci: 1 },
  { rx:  9,   rz:  0,   w: 6,  h: 7,  d: 7,  ci: 3 },
  { rx: -9,   rz:  0,   w: 6,  h: 5,  d: 7,  ci: 5 },
  { rx:  0,   rz:  9,   w: 16, h: 6,  d: 5,  ci: 0 },
  { rx:  0,   rz: -9,   w: 10, h: 8,  d: 5,  ci: 2 },
]);

// ── QUADRANT  SE  (x > 0, z > 12) ───────────────────────────

makeBlock(24, 32, [
  { rx:  0,   rz:  0,   w: 9,  h: 11, d: 9,  ci: 3 },
  { rx:  11,  rz:  2,   w: 7,  h: 7,  d: 9,  ci: 0 },
  { rx: -11,  rz: -2,   w: 7,  h: 5,  d: 9,  ci: 2 },
  { rx:  2,   rz:  11,  w: 13, h: 4,  d: 6,  ci: 6 },
  { rx: -3,   rz: -11,  w: 9,  h: 6,  d: 6,  ci: 1 },
]);

makeBlock(60, 32, [
  { rx:  0,   rz:  0,   w: 13, h: 8,  d: 11, ci: 4 },
  { rx:  0,   rz:  12,  w: 9,  h: 12, d: 6,  ci: 2 },
  { rx:  0,   rz: -12,  w: 9,  h: 5,  d: 6,  ci: 5 },
  { rx:  13,  rz:  0,   w: 5,  h: 6,  d: 11, ci: 0 },
]);

makeBlock(24, 62, [
  { rx:  0,   rz:  0,   w: 10, h: 7,  d: 10, ci: 6 },
  { rx:  12,  rz:  0,   w: 7,  h: 5,  d: 10, ci: 1 },
  { rx: -12,  rz:  0,   w: 7,  h: 9,  d: 10, ci: 3 },
  { rx:  0,   rz:  11,  w: 14, h: 4,  d: 7,  ci: 4 },
]);

makeBlock(60, 62, [
  { rx: -9,   rz:  0,   w: 5,  h: 8,  d: 9,  ci: 2 },
  { rx: -3,   rz:  0,   w: 5,  h: 5,  d: 9,  ci: 0 },
  { rx:  3,   rz:  0,   w: 5,  h: 7,  d: 9,  ci: 5 },
  { rx:  9,   rz:  0,   w: 5,  h: 6,  d: 9,  ci: 1 },
  { rx:  0,   rz: -11,  w: 18, h: 9,  d: 6,  ci: 3 },
]);


/* ──────────────────────────────────────────────────────────────
   §8  TREES
   Low-poly tree: cylinder trunk + sphere foliage cluster.
   Distributed along main streets and in plazas.
────────────────────────────────────────────────────────────── */

const TRUNK_MAT   = new THREE.MeshLambertMaterial({ color: 0x7a5c30 });
const FOLIAGE_MAT = new THREE.MeshLambertMaterial({ color: 0x4F7A5B });
const FOLIAGE_LITE = new THREE.MeshLambertMaterial({ color: 0x5f9068 });

const TRUNK_GEO   = new THREE.CylinderGeometry(0.18, 0.24, 1.6, 6);
const FOLIAGE_GEO = new THREE.SphereGeometry(1.1, 7, 5);

/**
 * spawnTree(x, z, scale?)
 * Places one tree at world coords (x, z).
 */
function spawnTree(x, z, s) {
  s = s || (0.75 + Math.random() * 0.5);
  const t = new THREE.Mesh(TRUNK_GEO, TRUNK_MAT);
  t.scale.setScalar(s);
  t.position.set(x, 0.8 * s, z);
  t.castShadow = true;
  scene.add(t);
  const f = new THREE.Mesh(FOLIAGE_GEO, Math.random() > 0.4 ? FOLIAGE_MAT : FOLIAGE_LITE);
  f.scale.setScalar(s * (0.9 + Math.random() * 0.25));
  f.position.set(x, 1.6 * s + 0.9 * s, z);
  f.castShadow = true;
  scene.add(f);
}

// Along main N-S avenue
for (let z = -90; z <= 90; z += 14) {
  spawnTree(-7.5, z, 0.85 + Math.random() * 0.3);
  spawnTree( 7.5, z, 0.85 + Math.random() * 0.3);
}

// Along main E-W avenue
for (let x = -90; x <= 90; x += 14) {
  if (Math.abs(x) < 8) continue; // skip intersection
  spawnTree(x, -12.5, 0.8 + Math.random() * 0.3);
  spawnTree(x,  12.5, 0.8 + Math.random() * 0.3);
}

// Accent trees at intersections
[[-50, -40], [50, -40], [-50, 40], [50, 40]].forEach(([x, z]) => {
  spawnTree(x, z, 1.1);
  spawnTree(x + 3, z + 3, 0.7);
});

// Plaza / green space trees
[[-40, 0], [40, 0], [0, -20], [0, 20],
 [-15, -20],[15,-20],[-15,20],[15,20]].forEach(([x, z]) => {
  spawnTree(x, z, 0.7 + Math.random() * 0.4);
});


/* ──────────────────────────────────────────────────────────────
   §9  PLAZA  (central open space)
   A slightly elevated paved square at the intersection of
   the two main avenues.
────────────────────────────────────────────────────────────── */

// Paved base
const plazaMesh = new THREE.Mesh(
  new THREE.BoxGeometry(18, 0.18, 18),
  new THREE.MeshLambertMaterial({ color: 0xcec4b4 })
);
plazaMesh.position.set(0, 0.09, 0);
plazaMesh.receiveShadow = true;
scene.add(plazaMesh);

// Central sculpture / obelisk
const obelisk = new THREE.Mesh(
  new THREE.CylinderGeometry(0.3, 0.7, 5, 8),
  new THREE.MeshLambertMaterial({ color: 0xb8a898 })
);
obelisk.position.set(0, 2.7, 0);
obelisk.castShadow = true;
scene.add(obelisk);

// Small plaza benches (box stools)
const benchMat = new THREE.MeshLambertMaterial({ color: 0x9a8878 });
[[4, 4], [-4, 4], [4, -4], [-4, -4]].forEach(([x, z]) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 0.7), benchMat);
  b.position.set(x, 0.3, z);
  b.castShadow = true;
  scene.add(b);
});


/* ──────────────────────────────────────────────────────────────
   §10  HOTSPOT  PINS
   Each pin is a Three.js Group with:
     • Thin stem cylinder
     • Sphere head (terracotta)
     • Pulsing ring at ground
   They store userData for raycasting.
────────────────────────────────────────────────────────────── */

/**
 * HOTSPOT DATA
 * Add new entries here to extend the map.
 *   name    → sent via postMessage to Wix
 *   label   → shown in tooltip + info card
 *   icon    → emoji in info card
 *   desc    → description in info card
 *   pos     → THREE.Vector3 world position
 *   camPos  → camera position when flying here
 *   camTgt  → camera look-at when flying here
 */
const HOTSPOTS = [
  {
    name:   'barrio',
    label:  'El Barrio',
    icon:   '🏘️',
    desc:   'Conoce la historia, el territorio y la identidad de Santa Rosa. Un barrio que construye su memoria desde las calles.',
    pos:    new THREE.Vector3(0, 0, 0),
    camPos: new THREE.Vector3(10, 22, 28),
    camTgt: new THREE.Vector3(0, 0, 0),
  },
  {
    name:   'dofa',
    label:  'DOFA',
    icon:   '📊',
    desc:   'Análisis participativo de fortalezas, oportunidades, debilidades y amenazas. La voz del barrio en un diagnóstico colectivo.',
    pos:    new THREE.Vector3(-40, 0, -50),
    camPos: new THREE.Vector3(-32, 22, -30),
    camTgt: new THREE.Vector3(-40, 0, -50),
  },
  {
    name:   'ecosistema',
    label:  'Ecosistema Digital',
    icon:   '🌐',
    desc:   'Mapa de actores y plataformas digitales que conectan a la comunidad de Santa Rosa con el mundo.',
    pos:    new THREE.Vector3(45, 0, -45),
    camPos: new THREE.Vector3(38, 22, -26),
    camTgt: new THREE.Vector3(45, 0, -45),
  },
  {
    name:   'fotorrelato',
    label:  'Fotorrelato',
    icon:   '📷',
    desc:   'Galería fotográfica comunitaria. Imágenes que narran la vida cotidiana y el alma del barrio.',
    pos:    new THREE.Vector3(38, 0, 50),
    camPos: new THREE.Vector3(30, 22, 32),
    camTgt: new THREE.Vector3(38, 0, 50),
  },
  {
    name:   'equipo',
    label:  'Equipo',
    icon:   '👥',
    desc:   'El equipo de investigadores y comunicadores que hacen posible este proyecto de comunicación comunitaria.',
    pos:    new THREE.Vector3(-38, 0, 50),
    camPos: new THREE.Vector3(-30, 22, 32),
    camTgt: new THREE.Vector3(-38, 0, 50),
  },
];

// Meshes registered for raycasting
const pinMeshes = [];

const PIN_STEM_MAT  = new THREE.MeshLambertMaterial({ color: 0xC65D3B });
const PIN_HEAD_MAT  = new THREE.MeshLambertMaterial({ color: 0xC65D3B });
const PIN_RING_MAT  = new THREE.MeshBasicMaterial({ color: 0xC65D3B, transparent: true, opacity: 0.4, side: THREE.DoubleSide });

function buildPin(hs) {
  const group = new THREE.Group();
  group.position.copy(hs.pos);

  // Stem
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 8), PIN_STEM_MAT.clone());
  stem.position.y = 2.5;
  group.add(stem);

  // Head sphere
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 10), PIN_HEAD_MAT.clone());
  head.position.y = 6.0;
  head.castShadow = true;
  group.add(head);

  // Inner white dot
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff8f0 })
  );
  dot.position.y = 6.0;
  group.add(dot);

  // Pulse ring at ground
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.35, 24), PIN_RING_MAT.clone());
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);

  scene.add(group);

  // Tag head mesh for raycasting
  head.userData = { hotspot: hs };
  pinMeshes.push(head);

  hs._group = group;
  hs._head  = head;
  hs._ring  = ring;
  hs._phase = Math.random() * Math.PI * 2;
}

HOTSPOTS.forEach(buildPin);


/* ──────────────────────────────────────────────────────────────
   §11  DOM  LABEL  SPRITES
   We project each pin's world position to screen coords
   each frame and move a <div> there — no CSS2DRenderer needed.
────────────────────────────────────────────────────────────── */

const labelEls = HOTSPOTS.map(hs => {
  const el = document.createElement('div');
  el.className = 'hs-label';
  el.textContent = hs.label;
  document.body.appendChild(el);
  return el;
});

const _projV = new THREE.Vector3();

function updateLabels() {
  HOTSPOTS.forEach((hs, i) => {
    // Project pin head world pos to NDC
    _projV.copy(hs._group.position);
    _projV.y = hs._group.position.y + 8.5; // above the head
    _projV.project(camera);

    const x =  (_projV.x * 0.5 + 0.5) * innerWidth;
    const y = -(_projV.y * 0.5 - 0.5) * innerHeight;

    // Hide when behind camera
    if (_projV.z > 1) {
      labelEls[i].style.opacity = '0';
    } else {
      labelEls[i].style.opacity = '1';
      labelEls[i].style.left = x + 'px';
      labelEls[i].style.top  = y + 'px';
    }
  });
}


/* ──────────────────────────────────────────────────────────────
   §12  RAYCASTING — hover & click
────────────────────────────────────────────────────────────── */

const tooltip = document.getElementById('tip');
let hoveredPin = null;

canvas.addEventListener('pointermove', e => {
  mouse.x =  (e.clientX / innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(pinMeshes);

  if (hits.length) {
    const hs = hits[0].object.userData.hotspot;
    canvas.style.cursor = 'pointer';
    tooltip.textContent = hs.label;
    tooltip.style.left  = e.clientX + 'px';
    tooltip.style.top   = e.clientY + 'px';
    tooltip.classList.remove('hidden');

    if (hoveredPin !== hs) {
      if (hoveredPin) hoveredPin._head.material.emissive.setHex(0x000000);
      hoveredPin = hs;
      hs._head.material.emissive.setHex(0x401000);
    }
  } else {
    canvas.style.cursor = '';
    tooltip.classList.add('hidden');
    if (hoveredPin) {
      hoveredPin._head.material.emissive.setHex(0x000000);
      hoveredPin = null;
    }
  }
});

canvas.addEventListener('pointerup', e => {
  if (e.button !== 0) return;
  mouse.x =  (e.clientX / innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(pinMeshes);
  if (hits.length) {
    const hs = hits[0].object.userData.hotspot;
    openInfoCard(hs);
    flyTo(hs.camPos, hs.camTgt, 1400);
    // ── Notify parent Wix page ──────────────────────────────
    window.parent.postMessage(hs.name, '*');
  }
});


/* ──────────────────────────────────────────────────────────────
   §13  INFO  CARD
────────────────────────────────────────────────────────────── */

function openInfoCard(hs) {
  document.getElementById('info-emoji').textContent = hs.icon;
  document.getElementById('info-title').textContent = hs.label;
  document.getElementById('info-body').textContent  = hs.desc;
  document.getElementById('info-cta').dataset.name  = hs.name;
  document.getElementById('info-card').classList.remove('hidden');
}

function closeInfoCard() {
  document.getElementById('info-card').classList.add('hidden');
}

document.getElementById('info-close').addEventListener('click', closeInfoCard);

// CTA sends postMessage and could open Wix section directly
document.getElementById('info-cta').addEventListener('click', e => {
  window.parent.postMessage(e.currentTarget.dataset.name, '*');
});


/* ──────────────────────────────────────────────────────────────
   §15  CAMERA  FLY-TO  (declared before tour so tour can use it)
   Simple lerp animation — no external GSAP dependency.
   Returns a Promise that resolves when animation completes.
────────────────────────────────────────────────────────────── */

function flyTo(targetPos, lookAt, durationMs) {
  return new Promise(resolve => {
    const startPos = camera.position.clone();
    const startTgt = controls.target.clone();
    const t0 = performance.now();

    function step(now) {
      const raw = Math.min((now - t0) / durationMs, 1);
      // Smooth ease in-out cubic
      const t = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;

      camera.position.lerpVectors(startPos, targetPos, t);
      controls.target.lerpVectors(startTgt, lookAt, t);

      if (raw < 1) requestAnimationFrame(step);
      else         resolve();
    }
    requestAnimationFrame(step);
  });
}


/* ──────────────────────────────────────────────────────────────
   §14  GUIDED  TOUR
────────────────────────────────────────────────────────────── */

let tourActive = false;
let tourIdx    = 0;
const PAUSE_MS = 3200;
const FLY_MS   = 1800;

// Build pip indicators
const pipsEl = document.getElementById('tour-pips');
HOTSPOTS.forEach((_, i) => {
  const p = document.createElement('div');
  p.className = 't-pip';
  p.id = `tp${i}`;
  pipsEl.appendChild(p);
});

function setTourPips(active) {
  HOTSPOTS.forEach((_, i) => {
    const el = document.getElementById(`tp${i}`);
    el.className = 't-pip' + (i < active ? ' visited' : i === active ? ' active' : '');
  });
}

async function startTour() {
  tourActive = true;
  document.getElementById('tour-bar').classList.remove('hidden');
  document.getElementById('btn-tour').textContent = '⏸ Pausar';
  closeInfoCard();

  for (let i = 0; i < HOTSPOTS.length; i++) {
    if (!tourActive) break;
    tourIdx = i;
    setTourPips(i);
    const hs = HOTSPOTS[i];
    await flyTo(hs.camPos, hs.camTgt, FLY_MS);
    if (!tourActive) break;
    openInfoCard(hs);
    await new Promise(r => setTimeout(r, PAUSE_MS));
    if (!tourActive) break;
    closeInfoCard();
  }

  if (tourActive) await flyTo(CAM0_POS, CAM0_TGT, FLY_MS);
  endTour();
}

function endTour() {
  tourActive = false;
  document.getElementById('tour-bar').classList.add('hidden');
  document.getElementById('btn-tour').innerHTML = '<span class="btn-icon">▶</span> Iniciar recorrido';
  closeInfoCard();
}

document.getElementById('btn-tour').addEventListener('click', () => {
  if (tourActive) endTour();
  else startTour();
});

document.getElementById('btn-stop').addEventListener('click', endTour);

document.getElementById('btn-reset').addEventListener('click', () => {
  endTour();
  closeInfoCard();
  flyTo(CAM0_POS, CAM0_TGT, 1200);
});


/* ──────────────────────────────────────────────────────────────
   §16  ANIMATION  LOOP
────────────────────────────────────────────────────────────── */

let _t = 0;

function animate() {
  requestAnimationFrame(animate);
  _t += 0.016;

  // ── Animate hotspot pins ──────────────────────────────────
  HOTSPOTS.forEach(hs => {
    // Bob float
    hs._group.position.y = Math.sin(_t * 1.4 + hs._phase) * 0.45;

    // Ring pulse
    const pulse = 1 + 0.35 * Math.abs(Math.sin(_t * 1.8 + hs._phase));
    hs._ring.scale.setScalar(pulse);
    hs._ring.material.opacity = 0.45 - 0.3 * Math.abs(Math.sin(_t * 1.8 + hs._phase));

    // Always face camera (billboard head)
    hs._head.lookAt(camera.position);
  });

  // ── DOM labels ───────────────────────────────────────────
  updateLabels();

  // ── Controls ─────────────────────────────────────────────
  controls.update();

  renderer.render(scene, camera);
}

// ── Resize ───────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── Start ────────────────────────────────────────────────────
animate();
