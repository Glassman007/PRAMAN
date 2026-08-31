(() => {
  'use strict';

  const bridge = window.SIH_LAYER2_BRIDGE;
  const canvas = document.getElementById('webglMap');
  const mapFrame = document.querySelector('.map-frame');
  const labelsRoot = document.getElementById('parcelLabels3d');
  if (!bridge || !canvas || !mapFrame) return;


  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    depth: true,
    premultipliedAlpha: false
  });
  if (!gl) {
    canvas.hidden = true;
    mapFrame.classList.add('webgl-unavailable');
    return;
  }

  const VERTEX_SHADER = `
    attribute vec3 a_position;
    uniform mat4 u_viewProjection;
    void main() {
      gl_Position = u_viewProjection * vec4(a_position, 1.0);
    }
  `;
  const FRAGMENT_SHADER = `
    precision mediump float;
    uniform vec4 u_color;
    void main() {
      gl_FragColor = u_color;
    }
  `;

  const program = createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const viewProjectionLocation = gl.getUniformLocation(program, 'u_viewProjection');
  const colorLocation = gl.getUniformLocation(program, 'u_color');
  const sharedBuffer = gl.createBuffer();

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(1, 1, 1, 0);

  mapFrame.classList.add('is-webgl');

  const DATA = bridge.data;
  const canonicalFeatures = DATA.parcelsGeoJSON.features;
  const pids = canonicalFeatures.map(f => f.properties.parcel_id);
  const canonicalRings = Object.fromEntries(
    canonicalFeatures.map(f => [f.properties.parcel_id, f.geometry.coordinates[0]])
  );
  const layerColors = Object.fromEntries(bridge.layers.map(layer => [layer.id, hexToRgb(layer.color)]));

  // Arrange every parcel from the dataset into a scalable city-block layout.
  // The previous renderer hard-clamped parcels into five rows, which caused
  // parcels after the first few rows to overlap or leave the camera view.
  // This layout is driven by pids.length, so all 128 parcels remain visible.
  const allCanonicalPoints = Object.values(canonicalRings).flat();
  const lon0 = allCanonicalPoints.reduce((s, p) => s + p[0], 0) / allCanonicalPoints.length;
  const lat0 = allCanonicalPoints.reduce((s, p) => s + p[1], 0) / allCanonicalPoints.length;
  const metersPerLon = 111320 * Math.cos(lat0 * Math.PI / 180);
  const metersPerLat = 110540;

  const CITY = {
    parcelsPerBlock: 8,
    lotsPerRow: 4,
    lotsPerColumn: 2,
    lotWidth: 19,
    lotDepth: 17,
    lotGap: 2.6,
    roadWidth: 16
  };
  CITY.blockColumns = Math.max(1, Math.ceil(Math.sqrt(Math.ceil(pids.length / CITY.parcelsPerBlock))));
  CITY.blockRows = Math.max(1, Math.ceil(Math.ceil(pids.length / CITY.parcelsPerBlock) / CITY.blockColumns));
  CITY.blockWidth = CITY.lotsPerRow * CITY.lotWidth + (CITY.lotsPerRow - 1) * CITY.lotGap;
  CITY.blockDepth = CITY.lotsPerColumn * CITY.lotDepth + (CITY.lotsPerColumn - 1) * CITY.lotGap;
  CITY.pitchX = CITY.blockWidth + CITY.roadWidth;
  CITY.pitchZ = CITY.blockDepth + CITY.roadWidth;
  CITY.width = CITY.blockColumns * CITY.blockWidth + Math.max(0, CITY.blockColumns - 1) * CITY.roadWidth;
  CITY.depth = CITY.blockRows * CITY.blockDepth + Math.max(0, CITY.blockRows - 1) * CITY.roadWidth;

  const parcelIndex = Object.fromEntries(pids.map((pid, index) => [pid, index]));

  function ringMetrics(ring) {
    const points = ring.slice(0, -1).map(lonLatToMeters);
    const cx = points.reduce((s, p) => s + p[0], 0) / Math.max(1, points.length);
    const cz = points.reduce((s, p) => s + p[1], 0) / Math.max(1, points.length);
    const width = Math.max(0.01, Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])));
    const depth = Math.max(0.01, Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1])));
    return { cx, cz, width, depth };
  }

  const parcelLayout = Object.fromEntries(pids.map((pid, index) => {
    const blockIndex = Math.floor(index / CITY.parcelsPerBlock);
    const blockRow = Math.floor(blockIndex / CITY.blockColumns);
    const blockColumn = blockIndex % CITY.blockColumns;
    const local = index % CITY.parcelsPerBlock;
    const lotRow = Math.floor(local / CITY.lotsPerRow);
    const lotColumn = local % CITY.lotsPerRow;

    const blockLeft = -CITY.width / 2 + blockColumn * CITY.pitchX;
    const blockTop = -CITY.depth / 2 + blockRow * CITY.pitchZ;
    const centerX = blockLeft + lotColumn * (CITY.lotWidth + CITY.lotGap) + CITY.lotWidth / 2;
    const centerZ = blockTop + lotRow * (CITY.lotDepth + CITY.lotGap) + CITY.lotDepth / 2;

    const source = ringMetrics(canonicalRings[pid]);
    const fitX = (CITY.lotWidth * 0.78) / source.width;
    const fitZ = (CITY.lotDepth * 0.78) / source.depth;
    const scale = Math.max(0.18, Math.min(1.15, fitX, fitZ));

    return [pid, { centerX, centerZ, sourceCx: source.cx, sourceCz: source.cz, scale }];
  }));

  const defaultCameraRadius = Math.max(320, Math.hypot(CITY.width, CITY.depth) * 1.25);

  const scene = { faces: [], lines: [] };
  const state = {
    activeOrder: [...bridge.state.activeOrder],
    selectedParcel: bridge.state.selectedParcel,
    boundaryMode: bridge.state.boundaryMode
  };

  const camera = {
    radius: defaultCameraRadius,
    theta: 0.72,
    phi: 0.55,
    target: [0, 0.8, 0],
    position: [0, 0, 0],
    viewProjection: identity4()
  };

  const labelEls = Object.fromEntries(pids.map(pid => {
    const el = document.createElement('span');
    el.className = 'parcel-label-3d';
    el.textContent = pid.replace(/^P(\d+)$/, (_, n) => `P-${n.padStart(3, '0')}`);
    el.style.padding = '0';
    el.style.background = 'transparent';
    el.style.border = '0';
    el.style.borderRadius = '0';
    el.style.backdropFilter = 'none';
    el.style.boxShadow = 'none';
    labelsRoot.appendChild(el);
    return [pid, el];
  }));

  let spaceDown = false;
  let orbiting = false;
  let pointerId = null;
  let lastPointer = [0, 0];
  let draggedPixels = 0;
  let pointerOverCanvas = false;

  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Unknown WebGL shader error';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram(vsSource, fsSource) {
    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(p) || 'Unknown WebGL program link error';
      gl.deleteProgram(p);
      throw new Error(message);
    }
    return p;
  }

  function hexToRgb(hex) {
    const clean = String(hex).replace('#', '');
    const value = Number.parseInt(clean.length === 3 ? clean.split('').map(x => x + x).join('') : clean, 16);
    return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
  }


  function lonLatToMeters([lon, lat]) {
    return [(lon - lon0) * metersPerLon, (lat - lat0) * metersPerLat];
  }

  function transformRing(pid, ring) {
    const layout = parcelLayout[pid];
    if (!layout) return [];
    return ring.slice(0, -1).map(point => {
      const [mx, mz] = lonLatToMeters(point);
      return [
        layout.centerX + (mx - layout.sourceCx) * layout.scale,
        layout.centerZ + (mz - layout.sourceCz) * layout.scale
      ];
    });
  }

  function parcelHeight(pid) {
    const i = (parcelIndex[pid] ?? 0) + 1;
    return 12 + ((i * 7) % 5) * 3;
  }

  function geometryRing(layerId, pid) {
    if (layerId === 'canonical') return bridge.geometry.canonicalRing(pid);
    if (layerId === 'survey') return bridge.geometry.surveyRing(pid);
    if (layerId === 'revenue') return bridge.geometry.revenueRing(pid);
    if (layerId === 'ulb') return bridge.geometry.ulbRing(pid);
    if (layerId === 'planning') return bridge.geometry.planningRing(pid);
    return bridge.geometry.canonicalRing(pid);
  }

  function pushVec3(target, x, y, z) {
    target.push(x, y, z);
  }

  function addLineSegment(target, a, b) {
    pushVec3(target, a[0], a[1], a[2]);
    pushVec3(target, b[0], b[1], b[2]);
  }

  function addLoopLines(target, points, y) {
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      addLineSegment(target, [a[0], y, a[1]], [b[0], y, b[1]]);
    }
  }

  function addObject(list, positions, color, alpha, center, meta = {}) {
    if (!positions.length) return;
    list.push({ positions: new Float32Array(positions), color, alpha, center, meta });
  }

  function addPrism(pid, layerId, ring, yBase, height, layerRank, isTopLayer) {
    const points = transformRing(pid, ring);
    if (points.length < 3) return;

    const face = [];
    const structuralEdges = [];
    const sourceOutline = [];
    const yTop = yBase + height;

    // Roof triangulation (all current source shapes are convex synthetic polygons).
    for (let i = 1; i < points.length - 1; i++) {
      pushVec3(face, points[0][0], yTop, points[0][1]);
      pushVec3(face, points[i][0], yTop, points[i][1]);
      pushVec3(face, points[i + 1][0], yTop, points[i + 1][1]);
    }

    // Transparent vertical faces.
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      pushVec3(face, a[0], yBase, a[1]);
      pushVec3(face, b[0], yBase, b[1]);
      pushVec3(face, b[0], yTop, b[1]);
      pushVec3(face, a[0], yBase, a[1]);
      pushVec3(face, b[0], yTop, b[1]);
      pushVec3(face, a[0], yTop, a[1]);

      addLineSegment(structuralEdges, [a[0], yBase, a[1]], [b[0], yBase, b[1]]);
      addLineSegment(structuralEdges, [a[0], yTop, a[1]], [b[0], yTop, b[1]]);
      addLineSegment(structuralEdges, [a[0], yBase, a[1]], [a[0], yTop, a[1]]);
    }
    addLoopLines(sourceOutline, points, yTop + 0.06);

    const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
    const cz = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    const selected = state.selectedParcel === pid;
    const faceAlpha = isTopLayer ? (selected ? 0.17 : 0.115) : 0.042;
    const paleBlue = [0.20, 0.68, 0.84];
    const structuralBlue = selected ? [0.02, 0.34, 0.68] : [0.03, 0.50, 0.76];
    const sourceColor = layerColors[layerId] || [0.15, 0.39, 0.92];

    addObject(scene.faces, face, paleBlue, faceAlpha, [cx, yBase + height / 2, cz], { pid, layerId, layerRank });
    addObject(scene.lines, structuralEdges, structuralBlue, isTopLayer ? 0.94 : 0.54, [cx, yBase + height / 2, cz], { pid, layerId, kind: 'structure' });
    addObject(scene.lines, sourceOutline, sourceColor, isTopLayer ? 0.98 : 0.72, [cx, yTop, cz], { pid, layerId, kind: 'source-outline' });
  }

  function addGroundPolygon(points, y, color, alpha, meta = {}) {
    if (points.length < 3) return;
    const positions = [];
    for (let i = 1; i < points.length - 1; i++) {
      pushVec3(positions, points[0][0], y, points[0][1]);
      pushVec3(positions, points[i][0], y, points[i][1]);
      pushVec3(positions, points[i + 1][0], y, points[i + 1][1]);
    }
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cz = points.reduce((s, p) => s + p[1], 0) / points.length;
    addObject(scene.faces, positions, color, alpha, [cx, y, cz], meta);
  }

  function addGroundLoop(points, y, color, alpha, meta = {}) {
    const positions = [];
    addLoopLines(positions, points, y);
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cz = points.reduce((s, p) => s + p[1], 0) / points.length;
    addObject(scene.lines, positions, color, alpha, [cx, y, cz], meta);
  }

  function rectPoints(cx, cz, width, depth) {
    return [
      [cx - width / 2, cz - depth / 2],
      [cx + width / 2, cz - depth / 2],
      [cx + width / 2, cz + depth / 2],
      [cx - width / 2, cz + depth / 2]
    ];
  }

  function circlePoints(cx, cz, radius, segments = 32) {
    return Array.from({ length: segments }, (_, i) => {
      const angle = (i / segments) * Math.PI * 2;
      return [cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius];
    });
  }

  function roadCentersX() {
    const centers = [];
    for (let col = 1; col < CITY.blockColumns; col++) {
      centers.push(-CITY.width / 2 + col * CITY.blockWidth + (col - 0.5) * CITY.roadWidth);
    }
    return centers;
  }

  function roadCentersZ() {
    const centers = [];
    for (let row = 1; row < CITY.blockRows; row++) {
      centers.push(-CITY.depth / 2 + row * CITY.blockDepth + (row - 0.5) * CITY.roadWidth);
    }
    return centers;
  }

  const roadXs = roadCentersX();
  const roadZs = roadCentersZ();

  function pickSpread(values) {
    if (!values.length) return [];
    if (values.length === 1) return [values[0]];
    return [values[0], values[values.length - 1]];
  }

  const parkCenters = [];
  pickSpread(roadXs).forEach(x => {
    pickSpread(roadZs).forEach(z => {
      if (parkCenters.length < 4) parkCenters.push([x, z]);
    });
  });

  // Lightweight billboard trees. They use the supplied tree assets and are
  // projected into the 3D scene without changing parcel hit-testing.
  const treeStyle = document.createElement('style');
  treeStyle.textContent = `
    .park-tree-layer { position:absolute; inset:0; z-index:4; pointer-events:none; overflow:hidden; }
    .park-tree-sprite { position:absolute; transform:translate(-50%,-100%); transform-origin:50% 100%; object-fit:contain; user-select:none; -webkit-user-drag:none; filter:drop-shadow(0 3px 3px rgba(0,0,0,.30)); }
  `;
  document.head.appendChild(treeStyle);

  const treeRoot = document.createElement('div');
  treeRoot.className = 'park-tree-layer';
  treeRoot.setAttribute('aria-hidden', 'true');
  mapFrame.appendChild(treeRoot);

  const treePlacements = parkCenters.flatMap(([cx, cz], parkIndex) => {
    const radius = Math.max(3.1, CITY.roadWidth * 0.29);
    const placements = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + parkIndex * 0.31;
      const r = i % 2 === 0 ? radius : radius * 0.63;
      placements.push({
        x: cx + Math.cos(angle) * r,
        z: cz + Math.sin(angle) * r,
        height: 7.5 + ((parkIndex + i) % 3) * 0.75,
        type: ((parkIndex * 6 + i) % 5 === 0 || (parkIndex + i) % 7 === 0) ? 'pink' : 'green'
      });
    }
    return placements;
  });

  const treeEls = treePlacements.map(tree => {
    const img = document.createElement('img');
    img.className = 'park-tree-sprite';
    img.alt = '';
    img.draggable = false;
    img.src = tree.type === 'pink' ? 'assets/tree-pink.png' : 'assets/tree-green.png';
    treeRoot.appendChild(img);
    return img;
  });

  function addRoadAndParkContext() {
    const roadColor = [0.22, 0.24, 0.27];
    const roadEdge = [0.47, 0.50, 0.54];
    const laneColor = [0.78, 0.78, 0.72];
    const margin = CITY.roadWidth * 0.85;

    // Narrow access roads run inside every block so buildings do not read as
    // one dense cluster. They occupy only the lot-gap space.
    for (let blockRow = 0; blockRow < CITY.blockRows; blockRow++) {
      for (let blockColumn = 0; blockColumn < CITY.blockColumns; blockColumn++) {
        const blockLeft = -CITY.width / 2 + blockColumn * CITY.pitchX;
        const blockTop = -CITY.depth / 2 + blockRow * CITY.pitchZ;
        const blockCenterX = blockLeft + CITY.blockWidth / 2;
        const blockCenterZ = blockTop + CITY.blockDepth / 2;
        const minorColor = [0.27, 0.29, 0.32];

        for (let gap = 1; gap < CITY.lotsPerRow; gap++) {
          const x = blockLeft + gap * CITY.lotWidth + (gap - 0.5) * CITY.lotGap;
          addGroundPolygon(
            rectPoints(x, blockCenterZ, CITY.lotGap, CITY.blockDepth),
            -0.47,
            minorColor,
            0.78,
            { kind: 'access-road' }
          );
        }

        for (let gap = 1; gap < CITY.lotsPerColumn; gap++) {
          const z = blockTop + gap * CITY.lotDepth + (gap - 0.5) * CITY.lotGap;
          addGroundPolygon(
            rectPoints(blockCenterX, z, CITY.blockWidth, CITY.lotGap),
            -0.47,
            minorColor,
            0.78,
            { kind: 'access-road' }
          );
        }
      }
    }

    roadXs.forEach(x => {
      addGroundPolygon(
        rectPoints(x, 0, CITY.roadWidth, CITY.depth + margin * 2),
        -0.46,
        roadColor,
        0.92,
        { kind: 'road' }
      );
      const lane = [];
      addLineSegment(lane, [x, -0.39, -CITY.depth / 2 - margin], [x, -0.39, CITY.depth / 2 + margin]);
      addObject(scene.lines, lane, laneColor, 0.32, [x, -0.39, 0], { kind: 'road-center' });
      const left = [];
      addLineSegment(left, [x - CITY.roadWidth / 2, -0.40, -CITY.depth / 2 - margin], [x - CITY.roadWidth / 2, -0.40, CITY.depth / 2 + margin]);
      addLineSegment(left, [x + CITY.roadWidth / 2, -0.40, -CITY.depth / 2 - margin], [x + CITY.roadWidth / 2, -0.40, CITY.depth / 2 + margin]);
      addObject(scene.lines, left, roadEdge, 0.42, [x, -0.40, 0], { kind: 'road-edge' });
    });

    roadZs.forEach(z => {
      addGroundPolygon(
        rectPoints(0, z, CITY.width + margin * 2, CITY.roadWidth),
        -0.45,
        roadColor,
        0.92,
        { kind: 'road' }
      );
      const lane = [];
      addLineSegment(lane, [-CITY.width / 2 - margin, -0.38, z], [CITY.width / 2 + margin, -0.38, z]);
      addObject(scene.lines, lane, laneColor, 0.32, [0, -0.38, z], { kind: 'road-center' });
      const edges = [];
      addLineSegment(edges, [-CITY.width / 2 - margin, -0.39, z - CITY.roadWidth / 2], [CITY.width / 2 + margin, -0.39, z - CITY.roadWidth / 2]);
      addLineSegment(edges, [-CITY.width / 2 - margin, -0.39, z + CITY.roadWidth / 2], [CITY.width / 2 + margin, -0.39, z + CITY.roadWidth / 2]);
      addObject(scene.lines, edges, roadEdge, 0.42, [0, -0.39, z], { kind: 'road-edge' });
    });

    const parkOuterRadius = Math.max(4.6, CITY.roadWidth * 0.46);
    const parkInnerRadius = parkOuterRadius * 0.72;
    parkCenters.forEach(([x, z], index) => {
      addGroundPolygon(circlePoints(x, z, parkOuterRadius, 40), -0.29, [0.64, 0.66, 0.61], 0.96, { kind: 'park-path', park: index });
      addGroundPolygon(circlePoints(x, z, parkInnerRadius, 40), -0.24, [0.18, 0.43, 0.22], 0.96, { kind: 'park-lawn', park: index });
      addGroundLoop(circlePoints(x, z, parkOuterRadius, 40), -0.20, [0.80, 0.84, 0.78], 0.58, { kind: 'park-border', park: index });
    });
  }

  function sceneBounds() {
    const points = pids.flatMap(pid => transformRing(pid, canonicalRings[pid]));
    return {
      minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])),
      minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1]))
    };
  }

  function rebuildScene() {
    scene.faces.length = 0;
    scene.lines.length = 0;
    const bounds = sceneBounds();
    const active = state.activeOrder;
    const parcelLayers = active.filter(id => ['canonical', 'revenue', 'survey', 'ulb', 'planning'].includes(id));
    const topParcelLayer = [...active].reverse().find(id => parcelLayers.includes(id));

    if (active.length > 0) addRoadAndParkContext();

    // Keep the original parcel buildings visible as the base 3D context even
    // when only a contextual layer (Satellite/Flood) is selected.
    if (active.length > 0 && parcelLayers.length === 0) {
      pids.forEach(pid => {
        addPrism(pid, 'canonical', geometryRing('canonical', pid), 0, parcelHeight(pid), 0, true);
      });
    }

    active.forEach((layerId, rank) => {
      if (layerId === 'satellite') {
        const p = [
          [bounds.minX - 13, bounds.minZ - 13], [bounds.maxX + 13, bounds.minZ - 13],
          [bounds.maxX + 13, bounds.maxZ + 13], [bounds.minX - 13, bounds.maxZ + 13]
        ];
        addGroundPolygon(p, -0.55 + rank * 0.03, [0.42, 0.49, 0.39], 0.11, { layerId });
      } else if (layerId === 'flood') {
        const w = bounds.maxX - bounds.minX;
        const d = bounds.maxZ - bounds.minZ;
        const p = [
          [bounds.minX - 5, bounds.minZ + d * 0.03],
          [bounds.minX + w * 0.58, bounds.minZ - 4],
          [bounds.maxX + 5, bounds.minZ + d * 0.26],
          [bounds.maxX - w * 0.16, bounds.minZ + d * 0.47],
          [bounds.minX + w * 0.28, bounds.minZ + d * 0.39]
        ];
        addGroundPolygon(p, -0.32 + rank * 0.03, [0.01, 0.52, 0.78], 0.18, { layerId });
        addGroundLoop(p, -0.28 + rank * 0.03, [0.01, 0.40, 0.67], 0.82, { layerId });
      } else if (parcelLayers.includes(layerId)) {
        pids.forEach(pid => {
          addPrism(pid, layerId, geometryRing(layerId, pid), rank * 0.22, parcelHeight(pid), rank, layerId === topParcelLayer);
        });

        if (layerId === 'planning') {
          const pad = 8;
          const zone = [
            [bounds.minX - pad, bounds.minZ - pad], [bounds.maxX + pad, bounds.minZ - pad],
            [bounds.maxX + pad, bounds.maxZ + pad], [bounds.minX - pad, bounds.maxZ + pad]
          ];
          addGroundLoop(zone, 0.18 + rank * 0.22, layerColors.planning, 0.78, { layerId, kind: 'planning-zone' });
        }
      }
    });

    // Conflicts keep the current application's exact relevance logic and only
    // appear when the active source combination exposes them.
    if (active.length > 1) {
      DATA.conflicts.forEach(conflict => {
        if (!bridge.conflictRelevant(conflict)) return;
        const pid = conflict.parcel_id;
        const points = transformRing(pid, canonicalRings[pid]);
        const y = parcelHeight(pid) + active.length * 0.22 + 0.7;
        addGroundLoop(points, y, [0.84, 0.08, 0.10], 0.96, { pid, kind: 'conflict' });
      });
    }

    if (state.boundaryMode && state.selectedParcel) {
      const pid = state.selectedParcel;
      const h = parcelHeight(pid) + active.length * 0.22 + 1.0;
      const compare = [
        ['canonical', h, [0.08, 0.11, 0.16]],
        ['revenue', h + 0.45, layerColors.revenue],
        ['survey', h + 0.90, layerColors.survey]
      ];
      compare.forEach(([layerId, y, color]) => {
        addGroundLoop(transformRing(pid, geometryRing(layerId, pid)), y, color, 1, { pid, layerId, kind: 'boundary-compare' });
      });
    }

    render();
  }

  function identity4() {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  }

  function mat4Multiply(a, b) {
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

  function perspective(fovRadians, aspect, near, far) {
    const f = 1 / Math.tan(fovRadians / 2);
    const out = new Float32Array(16);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  }

  function normalize(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function cross(a, b) {
    return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
  }

  function dot(a, b) {
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  }

  function lookAt(eye, center, up) {
    const z = normalize([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
    ]);
  }

  function updateCamera() {
    const sinPhi = Math.sin(camera.phi);
    camera.position = [
      camera.target[0] + camera.radius * sinPhi * Math.sin(camera.theta),
      camera.target[1] + camera.radius * Math.cos(camera.phi),
      camera.target[2] + camera.radius * sinPhi * Math.cos(camera.theta)
    ];
    const aspect = Math.max(0.1, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    const projection = perspective(44 * Math.PI / 180, aspect, 0.2, Math.max(1400, defaultCameraRadius * 4));
    const view = lookAt(camera.position, camera.target, [0, 1, 0]);
    camera.viewProjection = mat4Multiply(projection, view);
  }

  function resizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function objectDistance(obj) {
    const dx = obj.center[0] - camera.position[0];
    const dy = obj.center[1] - camera.position[1];
    const dz = obj.center[2] - camera.position[2];
    return dx*dx + dy*dy + dz*dz;
  }

  function drawObject(obj, mode) {
    gl.bindBuffer(gl.ARRAY_BUFFER, sharedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, obj.positions, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(colorLocation, obj.color[0], obj.color[1], obj.color[2], obj.alpha);
    gl.drawArrays(mode, 0, obj.positions.length / 3);
  }

  function render() {
    resizeCanvas();
    updateCamera();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(viewProjectionLocation, false, camera.viewProjection);

    gl.depthMask(false);
    [...scene.faces].sort((a, b) => objectDistance(b) - objectDistance(a)).forEach(obj => drawObject(obj, gl.TRIANGLES));

    gl.depthMask(true);
    [...scene.lines].sort((a, b) => objectDistance(b) - objectDistance(a)).forEach(obj => drawObject(obj, gl.LINES));

    updateLabels();
    updateTrees();
  }

  function transformPoint(m, p) {
    const x = p[0], y = p[1], z = p[2];
    return [
      m[0]*x + m[4]*y + m[8]*z + m[12],
      m[1]*x + m[5]*y + m[9]*z + m[13],
      m[2]*x + m[6]*y + m[10]*z + m[14],
      m[3]*x + m[7]*y + m[11]*z + m[15]
    ];
  }

  function project(world) {
    const clip = transformPoint(camera.viewProjection, world);
    if (clip[3] <= 0.0001) return null;
    const nx = clip[0] / clip[3];
    const ny = clip[1] / clip[3];
    const nz = clip[2] / clip[3];
    return {
      x: (nx * 0.5 + 0.5) * canvas.clientWidth,
      y: (1 - (ny * 0.5 + 0.5)) * canvas.clientHeight,
      z: nz,
      visible: nx > -1.18 && nx < 1.18 && ny > -1.18 && ny < 1.18 && nz > -1.2 && nz < 1.2
    };
  }

  function canonicalWorldCenter(pid) {
    const points = transformRing(pid, canonicalRings[pid]);
    return [
      points.reduce((s, p) => s + p[0], 0) / points.length,
      0.08,
      points.reduce((s, p) => s + p[1], 0) / points.length
    ];
  }

  function updateLabels() {
    const visible = state.activeOrder.length > 0;
    pids.forEach(pid => {
      const el = labelEls[pid];
      if (!visible) {
        el.style.display = 'none';
        return;
      }
      const point = project(canonicalWorldCenter(pid));
      if (!point || !point.visible) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      el.style.left = `${point.x}px`;
      el.style.top = `${point.y}px`;
      el.style.opacity = String(Math.max(0.38, Math.min(1, 1.08 - (point.z + 1) * 0.12)));
      el.classList.toggle('is-selected', state.selectedParcel === pid);
    });
  }

  function updateTrees() {
    const visible = state.activeOrder.length > 0;
    treePlacements.forEach((tree, index) => {
      const el = treeEls[index];
      if (!visible) {
        el.style.display = 'none';
        return;
      }
      const base = project([tree.x, -0.16, tree.z]);
      const top = project([tree.x, tree.height, tree.z]);
      if (!base || !top || !base.visible) {
        el.style.display = 'none';
        return;
      }
      const heightPx = Math.max(14, Math.min(78, Math.abs(base.y - top.y)));
      el.style.display = 'block';
      el.style.left = `${base.x}px`;
      el.style.top = `${base.y}px`;
      el.style.height = `${heightPx}px`;
      el.style.width = `${heightPx * 0.72}px`;
      el.style.opacity = String(Math.max(0.64, Math.min(1, 1.12 - (base.z + 1) * 0.10)));
      el.style.zIndex = String(Math.round((2 - base.z) * 1000));
    });
  }

  function pickParcel(clientX, clientY) {
    if (!state.activeOrder.length) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const candidates = [];

    pids.forEach(pid => {
      const ring = transformRing(pid, canonicalRings[pid]);
      const h = parcelHeight(pid);
      const projected = ring.flatMap(([x, z]) => [project([x, 0, z]), project([x, h, z])]).filter(Boolean);
      if (!projected.length) return;
      const minX = Math.min(...projected.map(p => p.x));
      const maxX = Math.max(...projected.map(p => p.x));
      const minY = Math.min(...projected.map(p => p.y));
      const maxY = Math.max(...projected.map(p => p.y));
      if (mx < minX - 4 || mx > maxX + 4 || my < minY - 4 || my > maxY + 4) return;
      const center = project(canonicalWorldCenter(pid));
      if (center) candidates.push({ pid, depth: center.z, distance: Math.hypot(mx - center.x, my - center.y) });
    });

    candidates.sort((a, b) => a.depth - b.depth || a.distance - b.distance);
    return candidates[0]?.pid || null;
  }

  function clampCamera() {
    camera.radius = Math.max(18, Math.min(defaultCameraRadius * 2.4, camera.radius));
    camera.phi = Math.max(0.09, Math.min(1.52, camera.phi));
  }

  function zoom(factor) {
    camera.radius *= factor;
    clampCamera();
    render();
  }

  function fitAll() {
    camera.radius = defaultCameraRadius;
    camera.theta = 0.72;
    camera.phi = 0.55;
    camera.target = [0, 0.8, 0];
    render();
  }

  function canCaptureSpace() {
    const active = document.activeElement;
    return pointerOverCanvas || !active || active === document.body || active === canvas || active === mapFrame;
  }

  document.addEventListener('keydown', event => {
    if (event.code === 'Space' && canCaptureSpace()) {
      spaceDown = true;
      event.preventDefault();
    }
  });
  document.addEventListener('keyup', event => {
    if (event.code === 'Space') {
      spaceDown = false;
      if (orbiting) {
        orbiting = false;
        canvas.classList.remove('is-orbiting');
      }
    }
  });
  window.addEventListener('blur', () => {
    spaceDown = false;
    orbiting = false;
    canvas.classList.remove('is-orbiting');
  });

  canvas.addEventListener('pointerenter', () => { pointerOverCanvas = true; });
  canvas.addEventListener('pointerleave', () => { if (!orbiting) pointerOverCanvas = false; });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    canvas.focus({ preventScroll: true });
    draggedPixels = 0;
    if (event.button === 2 && spaceDown) {
      orbiting = true;
      pointerId = event.pointerId;
      lastPointer = [event.clientX, event.clientY];
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add('is-orbiting');
      event.preventDefault();
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (!orbiting || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastPointer[0];
    const dy = event.clientY - lastPointer[1];
    draggedPixels += Math.abs(dx) + Math.abs(dy);
    lastPointer = [event.clientX, event.clientY];
    camera.theta -= dx * 0.007;
    camera.phi += dy * 0.007;
    clampCamera();
    render();
    event.preventDefault();
  });
  const stopOrbit = event => {
    if (!orbiting || (event.pointerId !== undefined && event.pointerId !== pointerId)) return;
    orbiting = false;
    pointerId = null;
    canvas.classList.remove('is-orbiting');
  };
  canvas.addEventListener('pointerup', stopOrbit);
  canvas.addEventListener('pointercancel', stopOrbit);

  canvas.addEventListener('click', event => {
    if (event.button !== 0 || draggedPixels > 6) return;
    const pid = pickParcel(event.clientX, event.clientY);
    if (pid) bridge.selectParcel(pid, true);
  });

  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    zoom(event.deltaY > 0 ? 1.11 : 0.90);
  }, { passive: false });

  document.getElementById('zoomInButton')?.addEventListener('click', () => zoom(0.80));
  document.getElementById('zoomOutButton')?.addEventListener('click', () => zoom(1.25));
  window.addEventListener('resize', render);
  window.addEventListener('sih-layer2-fit', fitAll);
  window.addEventListener('sih-layer2-state', event => {
    state.activeOrder = [...event.detail.activeOrder];
    state.selectedParcel = event.detail.selectedParcel;
    state.boundaryMode = event.detail.boundaryMode;
    rebuildScene();
  });

  rebuildScene();
})();
