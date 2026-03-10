/**
 * ═══════════════════════════════════════════════════════════════
 *  SANTA ROSA 3D – Interactive Neighborhood Map
 *  Barrio Santa Rosa, Cali, Colombia
 *
 *  Tech: Three.js r128 + OpenStreetMap Overpass API
 *
 *  Sections:
 *   1. OrbitControls polyfill
 *   2. Constants & scene setup
 *   3. Coordinate helpers
 *   4. Ground plane & texture
 *   5. Sun / shadow simulation
 *   6. OSM data fetch (buildings, roads, trees)
 *   7. Building extrusion
 *   8. Road rendering
 *   9. Tree generation
 *  10. Animated traffic cars
 *  11. Hotspot system
 *  12. Guided tour
 *  13. UI bindings
 *  14. Animation loop
 * ═══════════════════════════════════════════════════════════════
 */

/* ──────────────────────────────────────────────────────────────
   1. OrbitControls – inline polyfill (compatible with r128)
   Source: three.js examples, condensed for standalone use
────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  THREE.OrbitControls = function (object, domElement) {
    this.object = object;
    this.domElement = domElement || document;

    this.enabled = true;
    this.target = new THREE.Vector3();

    this.minDistance = 0; this.maxDistance = Infinity;
    this.minPolarAngle = 0; this.maxPolarAngle = Math.PI;
    this.enableDamping = true; this.dampingFactor = 0.08;
    this.enableZoom = true; this.zoomSpeed = 1.2;
    this.enableRotate = true; this.rotateSpeed = 0.6;
    this.enablePan = true; this.panSpeed = 0.8;

    let spherical = new THREE.Spherical();
    let sphericalDelta = new THREE.Spherical();
    let scale = 1;
    let panOffset = new THREE.Vector3();
    let zoomChanged = false;
    let rotateStart = new THREE.Vector2();
    let rotateEnd = new THREE.Vector2();
    let rotateDelta = new THREE.Vector2();
    let panStart = new THREE.Vector2();
    let panEnd = new THREE.Vector2();
    let panDelta = new THREE.Vector2();

    const STATE = { NONE: -1, ROTATE: 0, DOLLY: 1, PAN: 2 };
    let state = STATE.NONE;

    const EPS = 0.000001;
    const TWO_PI = 2 * Math.PI;

    const self = this;

    function getZoomScale() { return Math.pow(0.95, self.zoomSpeed); }

    function rotateLeft(angle) { sphericalDelta.theta -= angle; }
    function rotateUp(angle)   { sphericalDelta.phi -= angle; }

    const panLeftV = new THREE.Vector3();
    function panLeft(distance, objectMatrix) {
      panLeftV.setFromMatrixColumn(objectMatrix, 0);
      panLeftV.multiplyScalar(-distance);
      panOffset.add(panLeftV);
    }

    const panUpV = new THREE.Vector3();
    function panUp(distance, objectMatrix) {
      panUpV.setFromMatrixColumn(objectMatrix, 1);
      panUpV.multiplyScalar(distance);
      panOffset.add(panUpV);
    }

    const panOffsetV = new THREE.Vector3();
    function pan(deltaX, deltaY) {
      const el = self.domElement === document ? self.domElement.body : self.domElement;
      const fov = self.object.fov * Math.PI / 180;
      const targetDist = panOffsetV.copy(self.object.position).sub(self.target).length();
      const px = 2 * Math.tan(fov / 2) * targetDist;
      panLeft(deltaX * px / el.clientHeight, self.object.matrix);
      panUp(deltaY * px / el.clientHeight, self.object.matrix);
    }

    function dollyIn(dollyScale) { scale /= dollyScale; zoomChanged = true; }
    function dollyOut(dollyScale) { scale *= dollyScale; zoomChanged = true; }

    this.update = (function () {
      const offset = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(object.up, up);
      const quatInverse = quat.clone().invert();
      const lastPos = new THREE.Vector3();
      let lastQuaternion = new THREE.Quaternion();

      return function () {
        const position = self.object.position;
        offset.copy(position).sub(self.target);
        offset.applyQuaternion(quat);
        spherical.setFromVector3(offset);

        spherical.theta += sphericalDelta.theta * self.dampingFactor;
        spherical.phi += sphericalDelta.phi * self.dampingFactor;
        spherical.phi = Math.max(self.minPolarAngle, Math.min(self.maxPolarAngle, spherical.phi));
        spherical.makeSafe();
        spherical.radius *= scale;
        spherical.radius = Math.max(self.minDistance, Math.min(self.maxDistance, spherical.radius));

        self.target.addScaledVector(panOffset, self.dampingFactor);

        offset.setFromSpherical(spherical);
        offset.applyQuaternion(quatInverse);
        position.copy(self.target).add(offset);
        self.object.lookAt(self.target);

        if (self.enableDamping) {
          sphericalDelta.theta *= (1 - self.dampingFactor);
          sphericalDelta.phi *= (1 - self.dampingFactor);
          panOffset.multiplyScalar(1 - self.dampingFactor);
        } else {
          sphericalDelta.set(0, 0, 0);
          panOffset.set(0, 0, 0);
        }

        scale = 1;
        if (zoomChanged ||
            lastPos.distanceToSquared(self.object.position) > EPS ||
            8 * (1 - lastQuaternion.dot(self.object.quaternion)) > EPS) {
          lastPos.copy(self.object.position);
          lastQuaternion.copy(self.object.quaternion);
          zoomChanged = false;
          return true;
        }
        return false;
      };
    }());

    this.dispose = function () {
      const el = self.domElement === document ? self.domElement.body : self.domElement;
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('wheel', onMouseWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    function onMouseDown(event) {
      if (!self.enabled) return;
      event.preventDefault();
      if (event.button === 0) {
        state = STATE.ROTATE;
        rotateStart.set(event.clientX, event.clientY);
      } else if (event.button === 1) {
        state = STATE.DOLLY;
      } else if (event.button === 2) {
        state = STATE.PAN;
        panStart.set(event.clientX, event.clientY);
      }
      document.addEventListener('mousemove', onMouseMove, false);
      document.addEventListener('mouseup', onMouseUp, false);
    }

    function onMouseMove(event) {
      if (!self.enabled) return;
      const el = self.domElement === document ? self.domElement.body : self.domElement;
      if (state === STATE.ROTATE) {
        rotateEnd.set(event.clientX, event.clientY);
        rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(self.rotateSpeed);
        rotateLeft(TWO_PI * rotateDelta.x / el.clientHeight);
        rotateUp(TWO_PI * rotateDelta.y / el.clientHeight);
        rotateStart.copy(rotateEnd);
      } else if (state === STATE.PAN) {
        panEnd.set(event.clientX, event.clientY);
        panDelta.subVectors(panEnd, panStart).multiplyScalar(self.panSpeed);
        pan(panDelta.x, panDelta.y);
        panStart.copy(panEnd);
      }
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      state = STATE.NONE;
    }

    function onMouseWheel(event) {
      if (!self.enabled || !self.enableZoom) return;
      event.preventDefault();
      if (event.deltaY < 0) dollyOut(getZoomScale());
      else dollyIn(getZoomScale());
    }

    // Touch support
    let touch1 = new THREE.Vector2();
    let touch2 = new THREE.Vector2();
    let prevTouchDist = 0;

    function onTouchStart(event) {
      if (!self.enabled) return;
      if (event.touches.length === 1) {
        state = STATE.ROTATE;
        rotateStart.set(event.touches[0].pageX, event.touches[0].pageY);
      } else if (event.touches.length === 2) {
        state = STATE.DOLLY;
        touch1.set(event.touches[0].pageX, event.touches[0].pageY);
        touch2.set(event.touches[1].pageX, event.touches[1].pageY);
        prevTouchDist = touch1.distanceTo(touch2);
      }
    }

    function onTouchMove(event) {
      if (!self.enabled) return;
      event.preventDefault();
      const el = self.domElement === document ? self.domElement.body : self.domElement;
      if (event.touches.length === 1 && state === STATE.ROTATE) {
        rotateEnd.set(event.touches[0].pageX, event.touches[0].pageY);
        rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(self.rotateSpeed);
        rotateLeft(TWO_PI * rotateDelta.x / el.clientHeight);
        rotateUp(TWO_PI * rotateDelta.y / el.clientHeight);
        rotateStart.copy(rotateEnd);
      } else if (event.touches.length === 2 && state === STATE.DOLLY) {
        touch1.set(event.touches[0].pageX, event.touches[0].pageY);
        touch2.set(event.touches[1].pageX, event.touches[1].pageY);
        const dist = touch1.distanceTo(touch2);
        if (dist > prevTouchDist) dollyOut(getZoomScale());
        else dollyIn(getZoomScale());
        prevTouchDist = dist;
      }
    }

    function onTouchEnd() { state = STATE.NONE; }

    const el = domElement === document ? domElement.body : domElement;
    el.addEventListener('mousedown', onMouseDown, false);
    el.addEventListener('wheel', onMouseWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, false);
    el.addEventListener('touchmove', onTouchMove, { passive: false });

    this.update();
  };

})();


/* ──────────────────────────────────────────────────────────────
   2. CONSTANTS & SCENE SETUP
────────────────────────────────────────────────────────────── */

// Color palette
const PALETTE = {
  blue:   0x1F3A5F,
  terra:  0xC65D3B,
  cream:  0xF4EDE4,
  gray:   0x5C5C5C,
  green:  0x4F7A5B,
};

// Santa Rosa neighborhood bounding polygon (WGS84)
// Used for the Overpass API poly query
const POLY_COORDS = [
  [3.4512, -76.5331],
  [3.4523, -76.5318],
  [3.4521, -76.5298],
  [3.4505, -76.5302],
  [3.4503, -76.5327],
  [3.4512, -76.5331],
];

// Map origin (center of the polygon) – used as 3D world (0,0)
const MAP_ORIGIN = { lat: 3.4513, lon: -76.5315 };

// Scale: metres per degree at this latitude (approx)
const METRES_PER_LAT = 111320;
const METRES_PER_LON = 111320 * Math.cos(MAP_ORIGIN.lat * Math.PI / 180);

// World scale factor – 1 OSM metre = WORLD_SCALE Three.js units
const WORLD_SCALE = 0.06;

// Ground plane half-size (Three.js units)
const GROUND_HALF = 70;

// Canvas element
const canvas = document.getElementById('three-canvas');

// ── Renderer ──
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

// ── Scene ──
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7ab3d4);   // sky blue
scene.fog = new THREE.FogExp2(0x9ec8e0, 0.006);

// ── Camera ──
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3000);
// Default aerial view
camera.position.set(0, 80, 120);
camera.lookAt(0, 0, 0);

// ── OrbitControls ──
const controls = new THREE.OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.minDistance = 20;
controls.maxDistance = 300;
controls.maxPolarAngle = Math.PI / 2.1;
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.update();

// Store default camera state for reset
const DEFAULT_CAM_POS = camera.position.clone();
const DEFAULT_CAM_TARGET = controls.target.clone();

// ── Raycaster for click / hover ──
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();


/* ──────────────────────────────────────────────────────────────
   3. COORDINATE HELPERS
   Convert OSM lat/lon to Three.js (x, z) world coordinates
────────────────────────────────────────────────────────────── */

/**
 * latLonToWorld(lat, lon) → {x, z}
 * Maps geographic coords to a flat Three.js plane.
 * North → -Z, East → +X.
 */
function latLonToWorld(lat, lon) {
  const x = (lon - MAP_ORIGIN.lon) * METRES_PER_LON * WORLD_SCALE;
  const z = -(lat - MAP_ORIGIN.lat) * METRES_PER_LAT * WORLD_SCALE;
  return { x, z };
}


/* ──────────────────────────────────────────────────────────────
   4. GROUND PLANE & TEXTURE
   Creates a large textured plane as the neighbourhood surface.
   Falls back to a procedural green-brown color if the texture
   file is not found.
────────────────────────────────────────────────────────────── */
function createGround() {
  const geo = new THREE.PlaneGeometry(GROUND_HALF * 2, GROUND_HALF * 2, 1, 1);
  const loader = new THREE.TextureLoader();

  // Try to load the aerial texture; fallback to procedural colour
  loader.load(
    'barrio-textura.jpg',
    (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(4, 4);
      ground.material.map = tex;
      ground.material.needsUpdate = true;
    },
    undefined,
    () => {
      // Texture not found – keep fallback colour
      console.warn('barrio-textura.jpg not found – using fallback color.');
    }
  );

  const mat = new THREE.MeshLambertMaterial({ color: 0x6a8f60 });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  return ground;
}

createGround();


/* ──────────────────────────────────────────────────────────────
   5. SUN & SHADOW SIMULATION
   A directional light orbits the scene to simulate the sun
   moving from east to west throughout the day.
   The ambient light colour shifts between warm and cool tones.
────────────────────────────────────────────────────────────── */

// Ambient base light
const ambientLight = new THREE.AmbientLight(0xfff5e0, 0.55);
scene.add(ambientLight);

// Hemisphere light (sky / ground)
const hemiLight = new THREE.HemisphereLight(0xb0d8f0, 0x5a7a3a, 0.4);
scene.add(hemiLight);

// Sun directional light
const sunLight = new THREE.DirectionalLight(0xfff0cc, 1.2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 600;
sunLight.shadow.camera.left = -150;
sunLight.shadow.camera.right = 150;
sunLight.shadow.camera.top = 150;
sunLight.shadow.camera.bottom = -150;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);
scene.add(sunLight.target); // target stays at (0,0,0)

// Simulated time (0–1 maps to midnight→midnight)
// Start at 10 am → 10/24 ≈ 0.417
let simulatedTime = 0.417;
const SUN_SPEED = 0.00004; // how fast time advances per frame

/**
 * updateSun(t) – move the sun and adjust sky colour.
 * t: 0 = midnight, 0.5 = noon, 1 = midnight again.
 */
function updateSun(t) {
  // Sun arc: rises at east (-X), sets at west (+X)
  const angle = (t - 0.5) * Math.PI; // -π/2 (midnight) to +π/2 (midnight)
  const elevation = Math.sin(t * Math.PI); // 0 at t=0, 1 at t=0.5, 0 at t=1
  const radius = 200;

  sunLight.position.set(
    Math.cos(angle) * radius,
    Math.abs(elevation) * radius + 10,
    -50
  );

  // Colour temperature: dawn/dusk = warm orange, noon = white
  const warmth = 1 - Math.pow(elevation, 2);
  const r = 1;
  const g = 0.85 + 0.15 * elevation;
  const b = 0.65 + 0.35 * elevation;
  sunLight.color.setRGB(r, g, b);
  sunLight.intensity = Math.max(0.1, elevation * 1.4);

  // Sky background
  const skyR = 0.47 + elevation * 0.2 + warmth * 0.12;
  const skyG = 0.60 + elevation * 0.15 - warmth * 0.05;
  const skyB = 0.78 + elevation * 0.1 - warmth * 0.18;
  scene.background.setRGB(skyR, skyG, skyB);

  // Update time label
  const hours = (t * 24) % 24;
  const hh = Math.floor(hours);
  const mm = Math.floor((hours - hh) * 60);
  const ampm = hh < 12 ? 'am' : 'pm';
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  document.getElementById('time-label').textContent =
    `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
  document.getElementById('time-icon').textContent =
    elevation > 0.1 ? '☀' : '🌙';
}


/* ──────────────────────────────────────────────────────────────
   6. OVERPASS API – OSM DATA FETCH
   We query the Overpass API using a polygon string that exactly
   represents the Santa Rosa neighborhood boundary.
   Three separate queries: buildings, roads, trees.
────────────────────────────────────────────────────────────── */

/**
 * Build the Overpass "poly:" string from POLY_COORDS.
 * Format: "lat lon lat lon …"
 */
function buildPolyString() {
  return POLY_COORDS.map(([lat, lon]) => `${lat} ${lon}`).join(' ');
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * fetchOSM(query) – POST to Overpass and return JSON.
 */
async function fetchOSM(query) {
  const resp = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
  return resp.json();
}

/**
 * loadAllOSMData() – fetch buildings, roads, trees in parallel.
 * Falls back to synthetic procedural data if the API is unreachable.
 */
async function loadAllOSMData() {
  const poly = buildPolyString();

  // ── Overpass queries ──
  // Buildings: any way with a "building" tag inside our polygon
  const qBuildings = `
    [out:json][timeout:25];
    (
      way["building"](poly:"${poly}");
    );
    out body;>;out skel qt;
  `;

  // Roads: ways tagged as highway
  const qRoads = `
    [out:json][timeout:25];
    (
      way["highway"](poly:"${poly}");
    );
    out body;>;out skel qt;
  `;

  // Trees: nodes tagged natural=tree
  const qTrees = `
    [out:json][timeout:25];
    (
      node["natural"="tree"](poly:"${poly}");
    );
    out body;
  `;

  try {
    const [bldData, rdData, treeData] = await Promise.all([
      fetchOSM(qBuildings),
      fetchOSM(qRoads),
      fetchOSM(qTrees),
    ]);

    generateBuildings(bldData);
    generateRoads(rdData);
    generateTrees(treeData.elements);

  } catch (err) {
    console.warn('Overpass API unreachable – generating synthetic data.', err);
    generateSyntheticData();
  }
}


/* ──────────────────────────────────────────────────────────────
   7. BUILDING EXTRUSION
   For each OSM way tagged as a building we:
     a) Look up the node coordinates that define its footprint.
     b) Project them to world XZ space.
     c) Create an ExtrudeGeometry with a random height.
     d) Assign a neutral grey/cream colour.

   HOW TO EXTEND:
     • Add "building:levels" support by reading the tag and
       multiplying by ~4m per level.
     • Use different colours per building type (residential vs
       commercial).
────────────────────────────────────────────────────────────── */

// Colour variants for buildings
const BUILDING_COLORS = [0xd4c9bc, 0xbfb0a3, 0xc8bfb2, 0xe0d5c5, 0xcfbfb0];

function generateBuildings(osmData) {
  // Build a nodeId → {lat, lon} lookup table
  const nodeMap = {};
  osmData.elements.forEach(el => {
    if (el.type === 'node') nodeMap[el.id] = { lat: el.lat, lon: el.lon };
  });

  osmData.elements.forEach(el => {
    if (el.type !== 'way' || !el.tags || !el.tags.building) return;
    if (!el.nodes || el.nodes.length < 3) return;

    // Convert node ids to world points
    const pts2D = el.nodes
      .map(id => nodeMap[id])
      .filter(Boolean)
      .map(({ lat, lon }) => {
        const w = latLonToWorld(lat, lon);
        return new THREE.Vector2(w.x, w.z);
      });

    if (pts2D.length < 3) return;

    // Read OSM height / levels tag, or randomise
    let h = 4 + Math.random() * 10; // default 4–14 units
    if (el.tags['building:levels']) {
      h = parseInt(el.tags['building:levels']) * 2.5 * WORLD_SCALE * 20;
    } else if (el.tags['height']) {
      h = parseFloat(el.tags['height']) * WORLD_SCALE * 3;
    }
    h = Math.max(2, h);

    try {
      const shape = new THREE.Shape(pts2D);
      const extrudeSettings = { depth: h, bevelEnabled: false };
      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // Rotate so extrusion goes up (+Y) instead of default (+Z)
      geo.rotateX(-Math.PI / 2);

      const colorHex = BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
      const mat = new THREE.MeshLambertMaterial({ color: colorHex });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    } catch (e) {
      // Skip degenerate footprints
    }
  });
}


/* ──────────────────────────────────────────────────────────────
   8. ROAD RENDERING
   Roads are rendered as thin planes (ribbons) along OSM way paths.
   We build a CatmullRomCurve3, sample points, then tessellate a
   BufferGeometry ribbon with a fixed width.

   HOW TO EXTEND:
     • Vary width by road type (highway=primary wider than
       highway=residential).
     • Add lane markings as a secondary ribbon.
────────────────────────────────────────────────────────────── */

const ROAD_WIDTH = 1.2;
const ROAD_MAT = new THREE.MeshLambertMaterial({ color: 0x3a3a3a, side: THREE.DoubleSide });

// We also store road paths for car traffic
const roadPaths = [];

function generateRoads(osmData) {
  const nodeMap = {};
  osmData.elements.forEach(el => {
    if (el.type === 'node') nodeMap[el.id] = { lat: el.lat, lon: el.lon };
  });

  osmData.elements.forEach(el => {
    if (el.type !== 'way' || !el.tags) return;
    const hw = el.tags.highway;
    if (!hw) return;

    const pts3D = (el.nodes || [])
      .map(id => nodeMap[id])
      .filter(Boolean)
      .map(({ lat, lon }) => {
        const w = latLonToWorld(lat, lon);
        return new THREE.Vector3(w.x, 0.05, w.z);
      });

    if (pts3D.length < 2) return;

    // Store path for traffic
    roadPaths.push(pts3D);

    // Road width varies by type
    let w = ROAD_WIDTH;
    if (hw === 'primary' || hw === 'secondary') w = 2.0;
    if (hw === 'footway' || hw === 'path') w = 0.5;

    const ribbonGeo = buildRibbonGeometry(pts3D, w);
    if (!ribbonGeo) return;
    const mesh = new THREE.Mesh(ribbonGeo, ROAD_MAT);
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
}

/**
 * buildRibbonGeometry(points, width)
 * Builds a flat ribbon mesh along a polyline.
 */
function buildRibbonGeometry(points, width) {
  if (points.length < 2) return null;
  const positions = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    // Tangent direction
    let dir;
    if (i === 0) dir = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    else if (i === points.length - 1) dir = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
    else dir = new THREE.Vector3().subVectors(points[i + 1], points[i - 1]).normalize();

    const side = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(width / 2);

    positions.push(p.x - side.x, 0.05, p.z - side.z);
    positions.push(p.x + side.x, 0.05, p.z + side.z);

    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}


/* ──────────────────────────────────────────────────────────────
   9. TREE GENERATION
   OSM tree nodes are rendered as two-part 3D meshes:
     • Cylinder trunk (brown)
     • Sphere foliage (leaf green #4F7A5B)

   HOW TO EXTEND:
     • Vary foliage size by tree species tag.
     • Add LOD (Level of Detail) – use sprites at distance.
────────────────────────────────────────────────────────────── */

const TRUNK_MAT = new THREE.MeshLambertMaterial({ color: 0x6b4f2a });
const FOLIAGE_MAT = new THREE.MeshLambertMaterial({ color: PALETTE.green });

// Reusable geometries for trees (instanced via cloning is fine at small counts)
const TRUNK_GEO = new THREE.CylinderGeometry(0.15, 0.2, 1.5, 6);
const FOLIAGE_GEO = new THREE.SphereGeometry(1.0, 7, 5);

function generateTrees(treeElements) {
  treeElements.forEach(el => {
    if (el.type !== 'node') return;
    spawnTree(el.lat, el.lon);
  });

  // If OSM returned 0 trees, scatter some procedurally
  if (treeElements.length === 0) {
    for (let i = 0; i < 40; i++) {
      const lat = MAP_ORIGIN.lat + (Math.random() - 0.5) * 0.006;
      const lon = MAP_ORIGIN.lon + (Math.random() - 0.5) * 0.008;
      spawnTree(lat, lon);
    }
  }
}

function spawnTree(lat, lon) {
  const { x, z } = latLonToWorld(lat, lon);
  const h = 1.2 + Math.random() * 1.2;
  const scale = 0.7 + Math.random() * 0.6;

  const trunk = new THREE.Mesh(TRUNK_GEO, TRUNK_MAT);
  trunk.scale.setScalar(scale);
  trunk.position.set(x, (1.5 * scale) / 2, z);
  trunk.castShadow = true;
  scene.add(trunk);

  const foliage = new THREE.Mesh(FOLIAGE_GEO, FOLIAGE_MAT);
  foliage.scale.setScalar(scale * (0.9 + Math.random() * 0.3));
  foliage.position.set(x, 1.5 * scale + 0.8 * scale, z);
  foliage.castShadow = true;
  scene.add(foliage);
}


/* ──────────────────────────────────────────────────────────────
   10. ANIMATED TRAFFIC CARS
   Simple box-geometry cars drive along road paths in a loop.
   Each car has a target path and advances along it each frame.

   HOW TO EXTEND:
     • Assign different body colours per car.
     • Add headlights (PointLight) that activate at night.
────────────────────────────────────────────────────────────── */

const CAR_COLORS = [0xc0392b, 0x2980b9, 0xf39c12, 0x27ae60, 0x8e44ad];
const cars = []; // { mesh, path, t, speed }

const CAR_GEO = new THREE.BoxGeometry(1.8, 0.7, 0.9);

function spawnCars() {
  // One car per road path (up to 12)
  const usable = roadPaths.filter(p => p.length >= 4).slice(0, 12);

  usable.forEach((path, i) => {
    const mat = new THREE.MeshLambertMaterial({ color: CAR_COLORS[i % CAR_COLORS.length] });
    const mesh = new THREE.Mesh(CAR_GEO, mat);
    mesh.castShadow = true;
    mesh.position.copy(path[0]);
    mesh.position.y = 0.4;
    scene.add(mesh);
    cars.push({ mesh, path, t: Math.random(), speed: 0.0004 + Math.random() * 0.0004 });
  });
}

/**
 * updateCars(delta) – move each car along its road path.
 * t goes 0→1 and wraps around (loop).
 */
function updateCars(delta) {
  cars.forEach(car => {
    car.t = (car.t + car.speed) % 1;
    const total = car.path.length - 1;
    const raw = car.t * total;
    const idx = Math.floor(raw);
    const frac = raw - idx;

    const a = car.path[Math.min(idx, total)];
    const b = car.path[Math.min(idx + 1, total)];

    const pos = new THREE.Vector3().lerpVectors(a, b, frac);
    pos.y = 0.4;

    // Orient car along direction of travel
    const dir = new THREE.Vector3().subVectors(b, a);
    if (dir.length() > 0.001) {
      car.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    }
    car.mesh.position.copy(pos);
  });
}


/* ──────────────────────────────────────────────────────────────
   11. HOTSPOT SYSTEM
   Floating map pins placed at key neighbourhood locations.

   Each hotspot has:
     • name        – internal key (sent via postMessage)
     • label       – displayed in the UI
     • icon        – emoji icon
     • description – shown in the info panel
     • lat / lon   – geographic position
     • mesh        – Three.js Mesh (sphere + ring)
     • labelSprite – CSS2D-style div (we use DOM tooltips instead)

   HOW TO ADD A NEW HOTSPOT:
     1. Add an object to the HOTSPOTS array.
     2. Give it name, label, icon, description, lat, lon.
     3. Reload – it will appear automatically.
────────────────────────────────────────────────────────────── */

const HOTSPOTS = [
  {
    name: 'barrio',
    label: 'El Barrio',
    icon: '🏘',
    description: 'Conoce la historia y el territorio de Santa Rosa, un barrio que construye identidad desde sus calles.',
    lat: 3.4513, lon: -76.5315,
  },
  {
    name: 'dofa',
    label: 'DOFA',
    icon: '📊',
    description: 'Análisis participativo de las fortalezas, oportunidades, debilidades y amenazas del barrio.',
    lat: 3.4519, lon: -76.5308,
  },
  {
    name: 'ecosistema',
    label: 'Ecosistema Digital',
    icon: '🌐',
    description: 'Mapa de actores digitales y plataformas que conectan a la comunidad de Santa Rosa.',
    lat: 3.4507, lon: -76.5320,
  },
  {
    name: 'fotorrelato',
    label: 'Fotorrelato',
    icon: '📷',
    description: 'Galería fotográfica comunitaria: imágenes que narran la vida cotidiana del barrio.',
    lat: 3.4516, lon: -76.5300,
  },
  {
    name: 'equipo',
    label: 'Equipo',
    icon: '👥',
    description: 'Conoce al equipo de investigadores y comunicadores que hacen posible este proyecto.',
    lat: 3.4505, lon: -76.5310,
  },
];

// Meshes used for raycasting
const hotspotMeshes = [];

/**
 * createHotspotPin(hotspot)
 * Builds a floating pin: sphere body + vertical stem + ring base.
 */
function createHotspotPin(hotspot) {
  const group = new THREE.Group();
  const { x, z } = latLonToWorld(hotspot.lat, hotspot.lon);
  group.position.set(x, 0, z);

  // Stem
  const stemGeo = new THREE.CylinderGeometry(0.08, 0.08, 4, 6);
  const stemMat = new THREE.MeshLambertMaterial({ color: PALETTE.terra });
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.y = 2;
  group.add(stem);

  // Sphere head
  const headGeo = new THREE.SphereGeometry(0.8, 14, 10);
  const headMat = new THREE.MeshLambertMaterial({ color: PALETTE.terra });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 4.8;
  head.castShadow = true;
  group.add(head);

  // Pulse ring at base
  const ringGeo = new THREE.RingGeometry(0.6, 1.0, 20);
  const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.terra, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  scene.add(group);

  // Tag the head mesh for raycasting
  head.userData = { hotspot, ring, group };
  hotspotMeshes.push(head);
  hotspot.mesh = group;
  hotspot.headMesh = head;
  hotspot.ring = ring;
  hotspot._floatOffset = Math.random() * Math.PI * 2; // phase offset
}

// Create all pins
HOTSPOTS.forEach(createHotspotPin);

// Tooltip DOM element
const tooltip = document.getElementById('tooltip');

/**
 * animateHotspots(t) – floating bob + ring pulse animation.
 */
function animateHotspots(t) {
  HOTSPOTS.forEach(hs => {
    // Bob the entire pin up and down
    hs.mesh.position.y = Math.sin(t * 1.5 + hs._floatOffset) * 0.4;
    // Pulse the ring scale
    const pulse = 1 + 0.3 * Math.abs(Math.sin(t * 2 + hs._floatOffset));
    hs.ring.scale.setScalar(pulse);
    hs.ring.material.opacity = 0.5 - 0.3 * Math.abs(Math.sin(t * 2 + hs._floatOffset));
  });
}


/* ──────────────────────────────────────────────────────────────
   12. GUIDED TOUR
   The tour flies the camera sequentially to each hotspot.
   At each stop it pauses TOUR_PAUSE ms then moves to the next.

   HOW IT WORKS:
     • tourActive controls the loop.
     • tourIndex tracks the current hotspot.
     • cameraFlyTo() animates position & target using GSAP-like
       lerp (without a dependency) over TOUR_FLY_MS milliseconds.
────────────────────────────────────────────────────────────── */

let tourActive = false;
let tourIndex = 0;
const TOUR_PAUSE = 3000;  // ms to wait at each hotspot
const TOUR_FLY_MS = 2000; // ms to fly between hotspots

// Update the dots UI
function buildTourDots() {
  const container = document.getElementById('tour-dots');
  container.innerHTML = '';
  HOTSPOTS.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'tour-dot';
    dot.id = `tour-dot-${i}`;
    container.appendChild(dot);
  });
}
buildTourDots();

function setTourDotState(index, state) {
  HOTSPOTS.forEach((_, i) => {
    const d = document.getElementById(`tour-dot-${i}`);
    if (!d) return;
    d.className = 'tour-dot';
    if (i < index) d.classList.add('done');
    if (i === index) d.classList.add('active');
  });
}

/**
 * cameraFlyTo(targetPos, lookAt, duration)
 * Returns a Promise that resolves after the animation completes.
 * Uses requestAnimationFrame lerp.
 */
function cameraFlyTo(targetPos, lookAt, durationMs) {
  return new Promise(resolve => {
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const start = performance.now();

    function step(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / durationMs, 1);
      // Smooth ease in-out
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      camera.position.lerpVectors(startPos, targetPos, ease);
      controls.target.lerpVectors(startTarget, lookAt, ease);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

/**
 * runTour() – the main guided tour coroutine.
 */
async function runTour() {
  tourActive = true;
  document.getElementById('tour-progress').classList.remove('hidden');
  closeInfoPanel();

  for (let i = 0; i < HOTSPOTS.length; i++) {
    if (!tourActive) break;
    tourIndex = i;
    setTourDotState(i);

    const hs = HOTSPOTS[i];
    const { x, z } = latLonToWorld(hs.lat, hs.lon);
    const targetCamPos = new THREE.Vector3(x + 10, 20, z + 25);
    const lookAt = new THREE.Vector3(x, 0, z);

    // Fly to hotspot
    await cameraFlyTo(targetCamPos, lookAt, TOUR_FLY_MS);
    if (!tourActive) break;

    // Show info panel
    showInfoPanel(hs);

    // Pause
    await new Promise(r => setTimeout(r, TOUR_PAUSE));
    if (!tourActive) break;

    closeInfoPanel();
  }

  if (tourActive) {
    // Return to default view
    await cameraFlyTo(DEFAULT_CAM_POS, DEFAULT_CAM_TARGET, TOUR_FLY_MS);
  }

  stopTour();
}

function stopTour() {
  tourActive = false;
  document.getElementById('tour-progress').classList.add('hidden');
  closeInfoPanel();
}


/* ──────────────────────────────────────────────────────────────
   INFO PANEL
────────────────────────────────────────────────────────────── */

function showInfoPanel(hs) {
  document.getElementById('info-icon').textContent = hs.icon;
  document.getElementById('info-title').textContent = hs.label;
  document.getElementById('info-desc').textContent = hs.description;
  document.getElementById('info-nav').dataset.name = hs.name;
  document.getElementById('info-panel').classList.remove('hidden');
}

function closeInfoPanel() {
  document.getElementById('info-panel').classList.add('hidden');
}

/**
 * postMessage to Wix parent page.
 * The parent Wix Studio page listens for these messages to
 * navigate to the corresponding section.
 */
function navigateToSection(name) {
  window.parent.postMessage(name, '*');
}


/* ──────────────────────────────────────────────────────────────
   SYNTHETIC FALLBACK DATA
   If Overpass API is not reachable (offline or CORS issues),
   we procedurally generate buildings, roads, and trees so the
   scene is never empty.
────────────────────────────────────────────────────────────── */

function generateSyntheticData() {
  console.info('Using synthetic fallback scene data.');

  // ── Synthetic buildings ──
  const bldPositions = [
    [3.4512, -76.5325, 8], [3.4515, -76.5312, 6], [3.4509, -76.5305, 10],
    [3.4520, -76.5322, 7], [3.4517, -76.5298, 5], [3.4508, -76.5330, 9],
    [3.4505, -76.5315, 6], [3.4522, -76.5310, 8], [3.4510, -76.5320, 7],
    [3.4518, -76.5302, 5], [3.4506, -76.5308, 11], [3.4514, -76.5328, 6],
    [3.4503, -76.5320, 4], [3.4521, -76.5295, 9], [3.4507, -76.5303, 7],
  ];

  bldPositions.forEach(([lat, lon, h]) => {
    const { x, z } = latLonToWorld(lat, lon);
    const w = 3 + Math.random() * 5;
    const d = 3 + Math.random() * 5;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({
      color: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)]
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // ── Synthetic roads ──
  const roadGrid = [
    [[3.4503, -76.5331], [3.4523, -76.5331], [3.4523, -76.5298]],
    [[3.4503, -76.5315], [3.4523, -76.5315]],
    [[3.4513, -76.5331], [3.4513, -76.5298]],
  ];

  roadGrid.forEach(coords => {
    const pts = coords.map(([lat, lon]) => {
      const { x, z } = latLonToWorld(lat, lon);
      return new THREE.Vector3(x, 0.05, z);
    });
    roadPaths.push(pts);
    const geo = buildRibbonGeometry(pts, 1.6);
    if (geo) {
      const mesh = new THREE.Mesh(geo, ROAD_MAT);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  });

  // ── Synthetic trees ──
  generateTrees([]); // triggers the fallback scatter inside generateTrees()

  // Spawn cars on synthetic roads
  spawnCars();
}


/* ──────────────────────────────────────────────────────────────
   13. UI BINDINGS
────────────────────────────────────────────────────────────── */

// Start tour button
document.getElementById('btn-tour').addEventListener('click', () => {
  if (tourActive) { stopTour(); return; }
  runTour();
});

// Stop tour inside progress bar
document.getElementById('btn-stop-tour').addEventListener('click', stopTour);

// Reset view button
document.getElementById('btn-reset').addEventListener('click', async () => {
  stopTour();
  closeInfoPanel();
  await cameraFlyTo(DEFAULT_CAM_POS, DEFAULT_CAM_TARGET, 1200);
});

// Info panel close
document.getElementById('info-close').addEventListener('click', closeInfoPanel);

// Info panel navigate button
document.getElementById('info-nav').addEventListener('click', (e) => {
  navigateToSection(e.target.dataset.name);
});

// ── Mouse / Touch interaction ──
let hoveredHotspot = null;

canvas.addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(hotspotMeshes);

  if (hits.length > 0) {
    const hs = hits[0].object.userData.hotspot;
    canvas.style.cursor = 'pointer';

    // Show tooltip
    tooltip.textContent = hs.label;
    tooltip.style.left = `${e.clientX}px`;
    tooltip.style.top = `${e.clientY}px`;
    tooltip.classList.remove('hidden');

    // Highlight pin
    if (hoveredHotspot !== hs) {
      if (hoveredHotspot) hoveredHotspot.headMesh.material.emissive.setHex(0x000000);
      hoveredHotspot = hs;
      hs.headMesh.material.emissive.setHex(0x331100);
    }
  } else {
    canvas.style.cursor = 'default';
    tooltip.classList.add('hidden');
    if (hoveredHotspot) {
      hoveredHotspot.headMesh.material.emissive.setHex(0x000000);
      hoveredHotspot = null;
    }
  }
});

canvas.addEventListener('pointerdown', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(hotspotMeshes);

  if (hits.length > 0) {
    const hs = hits[0].object.userData.hotspot;
    showInfoPanel(hs);

    // Fly camera to hotspot
    const { x, z } = latLonToWorld(hs.lat, hs.lon);
    cameraFlyTo(
      new THREE.Vector3(x + 8, 18, z + 20),
      new THREE.Vector3(x, 0, z),
      1200
    );

    // Send postMessage to Wix parent
    navigateToSection(hs.name);
  }
});

// ── Window resize ──
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});


/* ──────────────────────────────────────────────────────────────
   14. ANIMATION LOOP
────────────────────────────────────────────────────────────── */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Advance simulated time
  simulatedTime = (simulatedTime + SUN_SPEED) % 1;
  updateSun(simulatedTime);

  // Animate hotspot pins
  animateHotspots(elapsed);

  // Move cars
  updateCars(delta);

  // Update orbit controls (damping)
  controls.update();

  renderer.render(scene, camera);
}


/* ──────────────────────────────────────────────────────────────
   INITIALISATION
   1. Build ground + lights (already done above)
   2. Load OSM data (async)
   3. Start render loop
────────────────────────────────────────────────────────────── */

async function init() {
  try {
    await loadAllOSMData();

    // If OSM returned data but no roads for cars, still call spawnCars
    if (cars.length === 0 && roadPaths.length > 0) spawnCars();

  } catch (e) {
    console.error('Init error:', e);
  }

  // Hide loading screen
  const loadingScreen = document.getElementById('loading-screen');
  loadingScreen.classList.add('hidden');
  // Remove from DOM after transition
  setTimeout(() => { loadingScreen.style.display = 'none'; }, 900);

  // Start render loop
  animate();
}

init();
