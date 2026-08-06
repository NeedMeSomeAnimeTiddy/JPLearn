/* ===================== STUDY — 方丈と四方の庭, the hall and its four gardens =====================
   ONE HALL IN THE MIDDLE, FOUR GARDENS ROUND IT. There is a real precedent and it is exactly this:
   東福寺方丈 in Kyoto has four gardens, one on each face of a single hall, each in a different
   style — the only such arrangement in Japan. It hands level two four picks that are genuinely
   different OBJECTS rather than four labels on the same one, and it hands level four its room for
   nothing, because the room you kneel in is the room that faces your garden.

     東 east   苔庭     moss and cherry            春  かな
     北 north  池庭     the pond and its 反橋      夏  漢字
     西 west   紅葉     the maple grove            秋  語彙
     南 south  枯山水   raked gravel and rock      冬  文法

   STEP TWO BUILDS THE STRUCTURE ONLY: the wall, its coping, the offset gate, the platform and the
   hall. The four gardens are step three and are stood in here as bare ground so their extents can
   be measured. Everything is still separately named boxes — `NAV.hit` reports what a ray struck,
   which is how the level-two rank was proved and how the gate's occlusion band was found. */
import * as THREE from 'three';
import { outlineGeom } from './toolkit.js';

export function buildStudy(ctx) {
  const {
    HOME_EYE, LAKE_Y, RAMP, SECTION_ACCENT, addOutline, backScene, blockAdd, destPlace, groundAt,
    outlineMaterial, pickWorldTile, spec, treeClaim, worldPickEl,
  } = ctx;
  /* WHAT THIS PLACE REGISTERS, GATHERED RATHER THAN SCATTERED. These used to be writes straight
     into the page's registries, which is what forced the call site to sit at an exact point in the
     module — the comment there read "it has to run HERE and not later". They are collected here
     and handed back instead, so installing them is the caller's decision and its timing is visible
     in the caller. */
  const _marks = {};
  let _probe = null, _focus = null, _eyeLift = null, _l2 = null;


  /* the invisible proxy the raycast actually tests. `buildEmaWall` keeps its own copy of this
     because it was written before there was a second place; one each is cheaper than another
     name in the context object. */
  const hitMat = new THREE.MeshBasicMaterial();
  hitMat.visible = false;

  /* ---- the site, and its own coordinates ----
     f down the axis away from home, sd across it, positive to the right. The bearing is READ from
     the spec rather than repeated here — written out twice it is two numbers kept equal by hand. */
  const SPEC = spec;
  const base = destPlace(SPEC.bearing, SPEC.dist, 0);
  const fwd = new THREE.Vector3().copy(base).sub(HOME_EYE).setY(0).normalize();
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const at3 = (f, sd, lift = 0) => {
    const v = base.clone().addScaledVector(fwd, f).addScaledVector(side, sd);
    v.y = groundAt(v.x, v.z) + lift;
    return v;
  };
  _probe = at3;

  /* ---- the compound ----
     The hall sits at the middle with a garden on each face, so the plan is a square of squares and
     the size falls out of the hall rather than being chosen. The entrance court is a fifth space,
     a strip inside the near wall, because level two's rank has to stand somewhere that is not one
     of the four gardens. */
  const HALL = { w: 940, d: 760, wall: 300, veranda: 120, eave: 230, roof: 300 };
  const GARDEN = 820;                 /* how deep each garden runs off its face of the hall */
  const HALF_S = HALL.w / 2 + HALL.veranda + GARDEN;             /* 1,410 across */
  const F_FAR = HALL.d / 2 + HALL.veranda + GARDEN;              /* 1,320 to the far wall */
  const PICK_F = -F_FAR;              /* the rank, on the court's far edge where the gardens start */
  /* THE COURT'S DEPTH IS FIXED BY THE FLIGHT, NOT CHOSEN. The camera lands `stand` short of the
     focus and the focus is the rank of picks, so matching the shrine's 3,916-unit journey puts the
     eye exactly 1,284 back from them — wherever that falls. At 620 it fell 664 OUTSIDE the near
     wall, and from out there the compound's own plinth (it stands 194 above the ground it is cut
     into) filled the lower third of the frame as a brown cliff, with the wall a band across the
     middle. The court has to be at least as deep as the stand-off for the arrival to happen
     inside the compound at all. */
  const COURT = 1400;                 /* the entrance court, > stand so the camera lands within it */
  const F_NEAR = PICK_F - COURT;      /* -2,720 to the near wall */
  /* THE WALL WAS TOO TALL FOR THE EYE THAT HAS TO FLY IN OVER IT. At 128 to the coping it stood
     only 34 below the arrival eye, so the camera skimmed its top on the way in and then stood
     peering over it. A 築地塀 is a garden wall, not a rampart — it marks the enclosure and is
     meant to be seen over from inside. At 92 the eye clears it properly and can come down. */
  const WALL_H = 70, WALL_T = 54, COPE = 22;
  const GATE_W = 320, GATE_H = 230, GATE_X = -HALF_S + 620;      /* off the axis, deliberately */

  /* THE COMPOUND MAKES ITS OWN GROUND. Same rule the shrine's court had to learn: a platform set
     to the average of the ground under it comes out buried at the high end. Take the highest point
     it covers. (The `LAKE_Y` guard is kept even though this site is dry — it costs nothing and the
     next place to use this pattern may not be.) */
  let TOP = -Infinity, LOW = Infinity, WET = 0, N = 0;
  for (let f = F_NEAR; f <= F_FAR; f += 100) {
    for (let sd = -HALF_S; sd <= HALF_S; sd += 100) {
      const y = at3(f, sd).y;
      TOP = Math.max(TOP, Math.max(y, LAKE_Y));
      LOW = Math.min(LOW, y);
      if (y < LAKE_Y) WET++;
      N++;
    }
  }
  TOP += 30;
  const SITE = { top: Math.round(TOP), low: Math.round(LOW), fall: Math.round(TOP - LOW), wet: +(WET / N).toFixed(2) };

  const grp = new THREE.Group();
  const MID_F = (F_NEAR + F_FAR) / 2;
  const foot = at3(MID_F, 0);
  grp.position.set(foot.x, TOP, foot.z);
  /* a plain Object3D points its LOCAL +Z at the lookAt target (a camera points -Z), so local +Z is
     "toward home" and local z is the negative of f measured from the compound's centre */
  grp.lookAt(HOME_EYE.x, TOP, HOME_EYE.z);
  backScene.add(grp);
  const zOf = (f) => MID_F - f;

  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP, flatShading: true });
  const EARTH = 0x8a7f6b, TILE = 0x4d5257, TIMBER = 0x7d6849, PLASTER = 0xd9cdb4,
    GRAVEL = 0xa9a396, MOSS = 0x5c6e42, WATER = 0x3c4c55, MAPLE = 0x8c4a33, SAND = 0xb9b2a2;

  function block(name, w, h, d, x, y, z, color, px) {
    const g = new THREE.BoxGeometry(w, h, d);
    const c = new THREE.Color(color);
    const col = [];
    for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.translate(x, y + h / 2, z);
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    grp.add(m);
    addOutline(m, px);
    _marks['study-' + name] = m;
    return m;
  }

  /* the made ground. Depth is READ, not assumed — the fall across this site would be a different
     number anywhere else, and a fixed skirt floats over the low corner. */
  const SINK = Math.max(260, TOP - LOW + 90);
  block('court', HALF_S * 2, SINK, F_FAR - F_NEAR, 0, -SINK, 0, EARTH, 3.2);

  /* ---- the wall ----
     THE GATE IS OFF THE AXIS AND THAT IS A MEASURED DECISION, NOT A STYLISTIC ONE. Centred, the
     four level-two picks read 4/4 visible at an eye of 200, 0/4 at 320, 4/4 at 460 and 0/4 again
     further back: the sight line passes UNDER the gate roof from low down and OVER it from high
     up, and between those is a band where the slab cuts exactly through the name-plaques. Widening
     the opening does not fix it and raising the roof only moves the band — any roofed threshold
     standing between the eye and level two fails somewhere in its range. Offsetting removes the
     whole class of problem, and it is what a Japanese garden does anyway: entrances are
     deliberately not axial, so the garden is disclosed rather than presented. */
  [[-HALF_S, GATE_X - GATE_W / 2, 'L'], [GATE_X + GATE_W / 2, HALF_S, 'R']].forEach(([a, b, k]) => {
    const run = b - a, cx = (a + b) / 2;
    block('wall-near' + k, run, WALL_H, WALL_T, cx, 0, zOf(F_NEAR) - WALL_T / 2, EARTH, 2.9);
    block('cope-near' + k, run + 20, COPE, WALL_T + 20, cx, WALL_H, zOf(F_NEAR) - WALL_T / 2, TILE, 2.9);
  });
  [[-1, 'W'], [1, 'E']].forEach(([s, k]) => {
    block('wall-' + k, WALL_T, WALL_H, F_FAR - F_NEAR, s * (HALF_S - WALL_T / 2), 0, 0, EARTH, 2.9);
    block('cope-' + k, WALL_T + 20, COPE, F_FAR - F_NEAR + 20, s * (HALF_S - WALL_T / 2), WALL_H, 0, TILE, 2.9);
  });
  block('wall-far', HALF_S * 2, WALL_H, WALL_T, 0, 0, zOf(F_FAR) + WALL_T / 2, EARTH, 2.9);
  block('cope-far', HALF_S * 2 + 20, COPE, WALL_T + 20, 0, WALL_H, zOf(F_FAR) + WALL_T / 2, TILE, 2.9);

  /* 棟門 — the gate. The one place the low wall is allowed a roof, so the compound has something to
     be recognised by from outside without becoming a building. */
  block('gate-post-L', 44, GATE_H, 50, GATE_X - GATE_W / 2 + 22, 0, zOf(F_NEAR) - WALL_T / 2, TIMBER, 3.2);
  block('gate-post-R', 44, GATE_H, 50, GATE_X + GATE_W / 2 - 22, 0, zOf(F_NEAR) - WALL_T / 2, TIMBER, 3.2);
  block('gate-roof', GATE_W + 140, 48, 170, GATE_X, GATE_H, zOf(F_NEAR) - WALL_T / 2, TILE, 3.5);

  /* ---- the hall ----
     SINGLE STOREY, DELIBERATELY. The re-plan removed two of the world's three stacked roofs and
     left the fifth storey to the pagoda at JLPT, where five storeys mean five levels. This is one
     big roof over one floor: a 縁側 veranda running right round it, shoji on all four faces, and
     deep eaves. What shows over the wall from outside is the roof and nothing else, which is the
     compound's landmark. */
  const HV = { w: HALL.w + HALL.veranda * 2, d: HALL.d + HALL.veranda * 2 };
  const HE = { w: HALL.w + HALL.eave * 2, d: HALL.d + HALL.eave * 2 };
  block('hall-plinth', HV.w + 60, 90, HV.d + 60, 0, 0, 0, GRAVEL, 3.0);
  block('hall-veranda', HV.w, 34, HV.d, 0, 90, 0, TIMBER, 2.9);
  block('hall-body', HALL.w, HALL.wall, HALL.d, 0, 124, 0, PLASTER, 3.2);
  block('hall-eave', HE.w, 46, HE.d, 0, 124 + HALL.wall - 46, 0, TILE, 3.5);
  {
    /* the roof: a four-sided hip. `ConeGeometry(r, h, 4)` turned 45° gives a square pyramid with
       flat faces on the axes; the radius is the half-diagonal, so it is scaled to the eave. */
    const y0 = 124 + HALL.wall;
    const g = new THREE.ConeGeometry(1, HALL.roof, 4);
    g.rotateY(Math.PI / 4);
    g.scale(HE.w / Math.SQRT2, 1, HE.d / Math.SQRT2);
    g.translate(0, y0 + HALL.roof / 2, 0);
    const c = new THREE.Color(TILE);
    const col = [];
    for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, mat);
    m.name = 'hall-roof';
    grp.add(m);
    addOutline(m, 3.5);
    _marks['study-hall-roof'] = m;
  }

  /* ================= STEP THREE: the four gardens =================
     Each face of the hall gets a garden in its own style, after 東福寺方丈 — the whole reason for
     this form. They share nothing but their wall, which is what makes level two four different
     OBJECTS rather than four labels.

     THE CHARACTER HAS TO BE IN THE GROUND, NOT IN THE PLANTING. A maple garden and a moss garden
     with the same floor under them read as the same garden with different trees in it, and from
     the entrance you mostly see FLOOR — the arrival looks down into the court. So each garden's
     surface is its own colour and its own texture, and the planting is what confirms it. */
  const GY = 8;                       /* the gardens sit a little below the hall's plinth */
  const innerS = HALL.w / 2 + HALL.veranda, innerF = HALL.d / 2 + HALL.veranda;
  const IN_W = HALF_S * 2 - WALL_T * 2;
  const gardens = {
    south: { w: IN_W, d: GARDEN, x: 0, z: zOf(-innerF - GARDEN / 2), col: SAND },
    north: { w: IN_W, d: GARDEN, x: 0, z: zOf(innerF + GARDEN / 2), col: MOSS },
    east: { w: GARDEN, d: innerF * 2, x: innerS + GARDEN / 2, z: 0, col: MOSS },
    west: { w: GARDEN, d: innerF * 2, x: -(innerS + GARDEN / 2), z: 0, col: MAPLE },
  };
  /* the pond's footprint, cut out of the north garden's floor rather than laid on top of it. A
     slab spanning the whole face runs UNDER the water and over it at the same time: the first
     pass drew the pond at y -46 and the garden at 0..8, so the water was buried and the arched
     bridge crossed dry grass. A pond is a hole in the ground, so the ground has to have a hole. */
  const POND = { hw: 780, hd: 310 };
  Object.entries(gardens).forEach(([k, g]) => {
    if (k !== 'north') { block('garden-' + k, g.w, GY, g.d, g.x, 0, g.z, g.col, 2.4); return; }
    const nearD = g.d / 2 - POND.hd;
    block('garden-north-near', g.w, GY, nearD, g.x, 0, g.z + POND.hd + nearD / 2, g.col, 2.4);
    block('garden-north-far', g.w, GY, nearD, g.x, 0, g.z - POND.hd - nearD / 2, g.col, 2.4);
    [-1, 1].forEach((s) => {
      const sw = g.w / 2 - POND.hw;
      block('garden-north-' + (s < 0 ? 'W' : 'E'), sw, GY, POND.hd * 2,
        g.x + s * (POND.hw + sw / 2), 0, g.z, g.col, 2.4);
    });
  });

  /* a stand and a rock, the two things every one of these gardens needs, so the four builders
     below stay about what makes each of them different */
  const plant = (name, x, z, r, h, color, px = 2.7) => {
    const g = new THREE.CylinderGeometry(r * 0.86, r, h, 7);
    const c = new THREE.Color(color);
    const col = [];
    for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.translate(x, GY + h / 2, z);
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    grp.add(m);
    addOutline(m, px);
    return m;
  };
  const rock = (name, x, z, r, h, lean = 0) => {
    const g = new THREE.DodecahedronGeometry(r, 0);
    g.scale(1, h / r, 0.88);
    g.rotateY(x * 0.013);
    g.rotateZ(lean);
    const c = new THREE.Color(0x6d6a63);
    const col = [];
    for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.translate(x, GY + h * 0.42, z);
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    grp.add(m);
    addOutline(m, 2.9);
    return m;
  };

  /* ---- 南庭 · 枯山水 → 文法 ----
     Raked gravel and rock groupings, and NOTHING GROWING. Grammar is structure with nothing on it,
     and a dry garden is the one form in the set that says so. The rakes are shallow ridges rather
     than a texture, because at this distance a texture is a flat colour and a ridge is a line.
     Rock groupings are odd-numbered — three, five, seven — which is the rule the form actually
     uses, and the reason a dry garden never reads as decoration. */
  {
    const g = gardens.south;
    /* the rakes: SHALLOW AND CLOSE. The first pass used 13 ridges 22 deep and 9 tall, which from
       inside the garden read as a striped floor rather than as combed gravel — at this scale a
       ridge has to be a line, not a band. 21 of them, half the height. */
    for (let i = 0; i < 21; i++) {
      const z = g.z - g.d / 2 + 50 + i * ((g.d - 100) / 20);
      block('rake-' + i, g.w - 120, 5, 14, 0, GY, z, 0xc4bcaa, 1.6);
    }
    /* rock groupings in odd numbers — three, two, three — which is the rule the form actually
       uses and the reason a dry garden never reads as decoration.
       SIZED AGAINST A PERSON, NOT AGAINST THE COURT. The first pass stood them 150 tall, which is
       five and a half metres at this world's scale: standing stones, not garden rocks. */
    [[-820, 78, 3], [-700, 52, 2.2], [-930, 40, 1.9],
      [180, 68, 2.6], [320, 46, 2.0],
      [900, 60, 2.4], [1010, 38, 1.8], [790, 31, 1.6]].forEach(([x, h, r], i) => {
      rock('rock-s' + i, x, g.z + (i % 3 - 1) * 150, h / r, h, (i % 2 ? 0.1 : -0.08));
    });
  }

  /* ---- 東庭 · 苔庭 → かな ----
     Moss and cherry: the softest of the four, and the only one whose ground is a single unbroken
     surface. Mounds rather than beds — moss follows the shape under it, so the character is in the
     ground swelling, not in anything planted on it. */
  {
    const g = gardens.east;
    [[-140, -520, 190, 44], [90, -170, 240, 58], [-60, 260, 200, 48], [120, 620, 165, 38]]
      .forEach(([dx, dz, r, h], i) => {
        const mg = new THREE.SphereGeometry(r, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
        mg.scale(1, h / r, 1.1);
        const c = new THREE.Color(0x6c8046);
        const col = [];
        for (let j = 0; j < mg.attributes.position.count; j++) col.push(c.r, c.g, c.b);
        mg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        mg.translate(g.x + dx, GY, g.z + dz);
        const m = new THREE.Mesh(mg, mat);
        m.name = 'moss' + i;
        grp.add(m);
        addOutline(m, 2.4);
      });
    [[-180, -420], [140, 120], [-120, 560]].forEach(([dx, dz], i) => {
      plant('cherry-trunk' + i, g.x + dx, g.z + dz, 26, 210, 0x4a3a2f, 2.7);
      block('cherry-crown' + i, 330, 150, 300, g.x + dx, GY + 190, g.z + dz, 0xd9a8b4, 2.9);
    });
    /* 飛石 — stepping stones, which is how a moss garden is crossed without treading on it */
    for (let i = 0; i < 9; i++) {
      block('step-e' + i, 78, 14, 62, g.x - 250 + (i % 2) * 46, GY, g.z - 600 + i * 150, 0x7d7a72, 1.8);
    }
  }

  /* ---- 西庭 · 紅葉 → 語彙 ----
     The maple grove: accumulation. It is the busiest of the four by design — a vocabulary is a
     heap of things and this is the garden that looks like one — and the only one whose ground is
     covered by what fell on it rather than by what was laid. */
  {
    const g = gardens.west;
    [[-120, -560], [110, -230], [-150, 90], [130, 400], [-90, 690]].forEach(([dx, dz], i) => {
      plant('maple-trunk' + i, g.x + dx, g.z + dz, 22, 180, 0x53413a, 2.7);
      block('maple-crown' + i, 340, 170, 320, g.x + dx, GY + 160, g.z + dz, i % 2 ? 0x9c4a2f : 0xb35a34, 2.9);
    });
    /* leaf litter: patches of fallen colour, which is what makes a maple garden autumn rather
       than a garden with red trees in it */
    for (let i = 0; i < 7; i++) {
      block('litter' + i, 250 + (i % 3) * 90, 6, 210, g.x + ((i * 197) % 500 - 250), GY,
        g.z - 700 + i * 230, i % 2 ? 0xa8603c : 0x8f4b31, 1.6);
    }
  }

  /* ---- 北庭 · 池庭 → 漢字 ----
     The pond and the 反橋 over it. THE BRIDGE IS THE ONE FIXED ELEMENT IN THE BRIEF, so it is
     built as an arch rather than a plank: five segments on a shallow parabola, the same trick the
     torii's kasagi uses, because a swept surface costs far more and at this size the facets read
     as the traditional stepped boards. It crosses to the island, so it is a thing you use on the
     way round rather than a thing you look at. */
  {
    const g = gardens.north;
    /* the water fills the hole and its surface sits a little below the surrounding ground, which
       is the whole reason a pond reads as a pond and not as a blue floor */
    block('pond', POND.hw * 2, 54, POND.hd * 2, 0, -54, g.z, WATER, 2.4);
    block('island', 300, 74, 240, -430, -54, g.z + 90, 0x5f7346, 2.7);
    {
      /* the arch: segments along y = rise * (1 - t²), t from -1 to 1 across the span */
      const SPAN = g.d - 260, RISE = 96, N = 5, HALF_B = 84;
      for (let i = 0; i < N; i++) {
        const t0 = -1 + (i / N) * 2, t1 = -1 + ((i + 1) / N) * 2;
        const z0 = t0 * SPAN / 2, y0 = (1 - t0 * t0) * RISE;
        const z1 = t1 * SPAN / 2, y1 = (1 - t1 * t1) * RISE;
        const len = Math.hypot(z1 - z0, y1 - y0) * 1.1;
        const bg = new THREE.BoxGeometry(HALF_B * 2, 22, len);
        bg.rotateX(-Math.atan2(y1 - y0, z1 - z0));
        bg.translate(220, GY + (y0 + y1) / 2, g.z + (z0 + z1) / 2);
        const c = new THREE.Color(0x8a5a3c);
        const col = [];
        for (let j = 0; j < bg.attributes.position.count; j++) col.push(c.r, c.g, c.b);
        bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        const m = new THREE.Mesh(bg, mat);
        m.name = 'bridge' + i;
        grp.add(m);
        addOutline(m, 2.9);
        if (i === Math.floor(N / 2)) _marks['study-bridge'] = m;
      }
      /* the rail posts, which is what stops an arch reading as a ramp. BOTH SIDES: the first pass
         put them on one edge only and the bridge read as a ramp with a fence beside it. */
      for (let i = 0; i <= 6; i++) {
        const t = -1 + (i / 6) * 2;
        const y = GY + (1 - t * t) * RISE + 22;
        [-1, 1].forEach((s) => {
          block('rail' + (s < 0 ? 'W' : 'E') + i, 16, 78, 16, 220 + s * (HALF_B - 12), y,
            g.z + t * SPAN / 2, 0x8a5a3c, 2.0);
        });
      }
      /* and the handrail they carry, without which seven posts are seven posts */
      [-1, 1].forEach((s) => {
        for (let i = 0; i < 6; i++) {
          const t0 = -1 + (i / 6) * 2, t1 = -1 + ((i + 1) / 6) * 2;
          const y0 = (1 - t0 * t0) * RISE, y1 = (1 - t1 * t1) * RISE;
          const z0 = t0 * SPAN / 2, z1 = t1 * SPAN / 2;
          const rg = new THREE.BoxGeometry(14, 14, Math.hypot(z1 - z0, y1 - y0) * 1.06);
          rg.rotateX(-Math.atan2(y1 - y0, z1 - z0));
          rg.translate(220 + s * (HALF_B - 12), GY + (y0 + y1) / 2 + 92, g.z + (z0 + z1) / 2);
          const c = new THREE.Color(0x8a5a3c);
          const col = [];
          for (let j = 0; j < rg.attributes.position.count; j++) col.push(c.r, c.g, c.b);
          rg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
          const m = new THREE.Mesh(rg, mat);
          m.name = 'handrail';
          grp.add(m);
          addOutline(m, 2.0);
        }
      });
    }
    /* 菖蒲 — irises at the water's edge, and a 雪見灯籠 on the island */
    for (let i = 0; i < 10; i++) {
      block('iris' + i, 90, 62, 70, -760 + i * 150, GY - 20, g.z - g.d / 2 + 150, 0x4d6a7a, 1.8);
    }
    plant('toro-post', -430, g.z + 90, 30, 96, 0x807b71, 2.4);
    block('toro-light', 130, 70, 130, -430, GY + 96, g.z + 90, 0x8d887d, 2.7);
    block('toro-cap', 168, 32, 168, -430, GY + 166, g.z + 90, 0x7a756c, 2.7);
  }

  /* ---- level two: the four path-heads ----
     A rank across the entrance court, each the mouth of the way round to its garden. The picks are
     HERE and not at the gardens themselves: a first stand-in put one in each corner of the
     compound and they measured 1,601 pixels apart, the whole frame width, which reads as an aerial
     photograph rather than as a garden anyone is standing in. It is also the wrong shape for the
     interaction — in a garden you do not survey four quarters and choose one, you stand near the
     entrance and choose a way to go. */
  const ACC = SECTION_ACCENT.STUDY[0];
  const tiles = ctx.tiles;
  /* the four, in the order the decks are declared, each aimed at the garden it opens onto */
  const Q = [['kana', -420, 0xd9a8b4, '東'], ['kanji', -140, WATER, '北'],
    ['goi', 140, MAPLE, '西'], ['bunpou', 420, SAND, '南']];
  const FW = 176, FH = 128, FT = 16;   /* the plaque */
  const PICK_Y = 176;                  /* how high it sits on its post */

  /* 駒札 — the plaque a Japanese garden actually names a scene with. Its own texture rather than
     `drawSign`, which is tuned landscape for the walk's placards: this one is a small upright
     board read at three metres, so the name carries it and everything else is a footnote. */
  function fudaTexture(jp, en, meta, tint) {
    const c = document.createElement('canvas');
    c.width = FW * 3; c.height = FH * 3;
    const g = c.getContext('2d');
    const W2 = c.width, H2 = c.height;
    g.fillStyle = '#efe3c8';
    g.fillRect(0, 0, W2, H2);
    /* the grain, which is what stops a painted board reading as a printed card */
    for (let i = 0; i < 16; i++) {
      g.strokeStyle = `rgba(122,96,60,${(0.03 + (i % 5) * 0.012).toFixed(3)})`;
      g.lineWidth = 1 + (i % 3);
      const y = (i + 0.5) * (H2 / 16);
      g.beginPath(); g.moveTo(0, y);
      g.bezierCurveTo(W2 * 0.4, y + 7, W2 * 0.7, y - 9, W2, y + 3); g.stroke();
    }
    /* the season's colour as a band down the hinge side: the plaque and the garden it opens onto
       are the same colour before either carries a word */
    g.fillStyle = '#' + tint.toString(16).padStart(6, '0');
    g.fillRect(0, 0, 26, H2);
    g.strokeStyle = 'rgba(70,50,30,0.5)'; g.lineWidth = 9; g.strokeRect(0, 0, W2, H2);

    g.textAlign = 'center';
    g.fillStyle = '#2b1c10';
    g.font = `700 ${jp.length > 2 ? 150 : 178}px "Yu Gothic UI", "Hiragino Kaku Gothic ProN", sans-serif`;
    g.fillText(jp, W2 / 2 + 13, H2 * 0.52, W2 - 90);
    g.fillStyle = ACC;
    g.fillRect(W2 * 0.28, H2 * 0.60, W2 * 0.44, 7);
    g.letterSpacing = '5px';
    g.fillStyle = 'rgba(43,28,16,0.72)';
    g.font = '900 46px "Arial Black", Arial, sans-serif';
    g.fillText(en, W2 / 2 + 13, H2 * 0.755, W2 - 80);
    g.letterSpacing = '0px';
    g.fillStyle = 'rgba(43,28,16,0.5)';
    g.font = '600 38px "Yu Gothic UI", sans-serif';
    g.fillText(meta, W2 / 2 + 13, H2 * 0.90, W2 - 60);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  }

  const picks = Q.map(([name, sd, tint, face], j) => {
    const [jp, en, meta] = tiles[j];
    const z = zOf(PICK_F);
    /* the opening: two hedge cheeks with the way through between them */
    [[-1], [1]].forEach(([s]) => {
      block('hedge-' + name + (s < 0 ? 'L' : 'R'), 84, 140, 160, sd + s * 108, 0, z, MOSS, 2.7);
    });
    block('post-' + name, 20, PICK_Y, 20, sd, 0, z + 74, TIMBER, 2.2);
    /* THE SEASON'S TREE OVER THE OPENING, AND IT HAS TO BE A CROWN. A box behind each plaque read
       as a coloured billboard — which is exactly what it was. Three overlapping masses give a
       silhouette with more than one bump in it, which is the difference between a tree and a
       lollipop, and it is the same trick `broadleafGeo` uses in the wood. */
    plant('tree-trunk-' + name, sd, z - 44, 22, 230, 0x4d3d31, 2.4);
    [[0, 262, 0, 104], [-64, 232, 26, 78], [58, 240, -22, 72]].forEach(([dx, dy, dz, r], k) => {
      const cg = new THREE.IcosahedronGeometry(r, 1);
      cg.scale(1.18, 0.82, 1.06);
      cg.translate(sd + dx, dy, z - 44 + dz);
      const cc = new THREE.Color(tint).offsetHSL(0, 0, k === 1 ? -0.05 : (k === 2 ? 0.04 : 0));
      const ccol = [];
      for (let i = 0; i < cg.attributes.position.count; i++) ccol.push(cc.r, cc.g, cc.b);
      cg.setAttribute('color', new THREE.Float32BufferAttribute(ccol, 3));
      const m = new THREE.Mesh(cg, mat);
      m.name = 'tree-' + name;
      grp.add(m);
      addOutline(m, 2.7);
    });

    /* ROOT HINGED AT THE POST TOP, NOT AT THE BOARD'S MIDDLE. `setHot` tweens `root.rotation.x`
       to -0.30, and a plaque spun about its own centre sinks its lower half into the post. Hung
       from the top edge it tips toward you like a signboard, which is what a fixed plaque can
       plausibly do. */
    const root = new THREE.Group();
    root.position.set(sd, PICK_Y + FH / 2, z + 74);
    grp.add(root);

    const bodyG = new THREE.BoxGeometry(FW, FH, FT);
    const bc = new THREE.Color(0xa08a63);
    const bcol = [];
    for (let i = 0; i < bodyG.attributes.position.count; i++) bcol.push(bc.r, bc.g, bc.b);
    bodyG.setAttribute('color', new THREE.Float32BufferAttribute(bcol, 3));
    const body = new THREE.Mesh(bodyG, mat);
    body.name = 'fuda-' + name;
    root.add(body);
    _marks['study-fuda-' + name] = body;
    {
      const o = new THREE.Mesh(outlineGeom(bodyG), outlineMaterial(2.6));
      o.frustumCulled = false;
      root.add(o);
    }

    const tex = fudaTexture(jp, en, meta, tint);
    const faceM = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), new THREE.MeshToonMaterial({
      map: tex, emissive: 0x8d8069, emissiveMap: tex, gradientMap: RAMP, transparent: true,
    }));
    faceM.position.set(0, 0, FT / 2 + 0.4);
    root.add(faceM);

    /* THE TARGET DOES NOT MOVE WITH THE PLAQUE. Raycasting the board itself means the hover tilt
       displaces the very thing the test is against, so the cursor falls off what it just picked
       and the two states chatter — the shrine's tablets learned this the expensive way. */
    const hit = new THREE.Mesh(new THREE.BoxGeometry(FW + 40, FH + 90, FT + FH * 0.5), hitMat);
    /* named so a raycast can report WHICH pick answered. The proxy is what the cursor actually
       finds, so an unnamed one makes every pick read as a miss from outside. */
    hit.name = 'pick-' + name;
    hit.position.set(sd, PICK_Y + FH / 2, z + 74);
    grp.add(hit);

    const el = worldPickEl(jp + ' — ' + en + ', ' + meta, () => pickWorldTile('STUDY', jp));
    /* READ THE REST VALUE, DO NOT RETYPE IT — the renderer stores linear, the literal is sRGB */
    return { root, body, face: faceM, hit, el, jp, tw: FW, th: FH,
      emRest: faceM.material.emissive.clone(),
      emHot: faceM.material.emissive.clone().multiplyScalar(1.8) };
  });
  _l2 = { picks };

  /* ---- 前庭 — the entrance court ----
     THE LARGEST THING IN THE ARRIVAL SHOT AND IT WAS BARE. The court is 1,400 deep because the
     flight makes it so, which means the lower half of the frame is its floor — and a flat slab of
     one colour there reads as an unfinished room, not as a garden. It gets the treatment a real
     forecourt gets: swept gravel, a stone path from the gate to the rank, and a 手水鉢 to stop at.
     The path runs from the GATE, which is off to one side, so it comes in at an angle and turns —
     which is the same reason the gate is offset in the first place. */
  {
    const cz0 = zOf(F_NEAR) - 40, cz1 = zOf(PICK_F) + 40;
    block('court-gravel', HALF_S * 2 - WALL_T * 2, GY, cz0 - cz1, 0, 0, (cz0 + cz1) / 2, GRAVEL, 2.4);
    /* the swept lines, running across the court the way a courtyard is raked — fewer and wider
       than the dry garden's, because this is a floor you walk on and that is a picture you do not */
    for (let i = 0; i < 9; i++) {
      block('sweep' + i, HALF_S * 2 - 260, 4, 12, 0, GY, cz1 + 70 + i * ((cz0 - cz1 - 140) / 8),
        0xb6ae9c, 1.5);
    }
    /* 延段 — the flagged path. From the gate it runs in on the slant, then squares up to the rank,
       so the walk to level two is a turn rather than a corridor. */
    const legs = [[GATE_X, F_NEAR + 120, GATE_X + 180, PICK_F - 760],
      [GATE_X + 180, PICK_F - 760, 0, PICK_F - 420]];
    legs.forEach(([x0, f0, x1, f1], li) => {
      const z0 = zOf(f0), z1 = zOf(f1);
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 132);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        block('flag' + li + '-' + i, 150, 12, 118, x0 + (x1 - x0) * t, GY, z0 + (z1 - z0) * t,
          0x8f8b80, 1.7);
      }
    });
    /* and the last of it, squared up and running at the middle of the rank */
    for (let i = 0; i < 3; i++) {
      block('flag-run' + i, 190, 12, 130, 0, GY, zOf(PICK_F - 380 + i * 120), 0x8f8b80, 1.7);
    }
    /* 手水鉢 — the water basin, set off the path where you would actually stop at one */
    const bz = zOf(PICK_F - 900);
    block('chozu-base', 150, 40, 150, -560, GY, bz, 0x6f6a63, 2.2);
    block('chozu-bowl', 118, 62, 118, -560, GY + 40, bz, 0x7d786f, 2.4);
    block('chozu-water', 84, 6, 84, -560, GY + 96, bz, 0x46606c, 1.8);
    /* two lanterns flanking the way in, which is what tells you the court has a direction */
    [-1, 1].forEach((s) => {
      const lx = s * 700, lz = zOf(PICK_F - 700);
      plant('court-toro-post' + (s < 0 ? 'W' : 'E'), lx, lz, 26, 104, 0x807b71, 2.2);
      block('court-toro-light' + (s < 0 ? 'W' : 'E'), 104, 60, 104, lx, GY + 104, lz, 0x8d887d, 2.4);
      block('court-toro-cap' + (s < 0 ? 'W' : 'E'), 138, 26, 138, lx, GY + 164, lz, 0x7a756c, 2.4);
    });
  }

  _marks['study'] = grp;
  blockAdd(foot.x, foot.z, Math.max(HALF_S, (F_FAR - F_NEAR) / 2) + 280,
    360 + (TOP - groundAt(foot.x, foot.z)));

  /* THE APPROACH IS CLEARED, NOT JUST THE FOOTPRINT. Everything between the camera and the subject
     is in shot, so the claim is a WEDGE widening from the standing point to the gate rather than a
     circle round the compound — which is how two of the pavilion's four bays came back blocked by
     a broadleaf. It stops at the far wall so the wood behind stays as a backdrop. */
  const CLEAR_F0 = PICK_F - SPEC.stand - 300;
  for (let f = CLEAR_F0; f <= F_FAR; f += 260) {
    const p = at3(f, 0);
    treeClaim(p.x, p.z, 260 + 900 * ((f - CLEAR_F0) / (F_FAR - CLEAR_F0)));
  }

  /* ---- where the camera stands, and what it looks at ----
     At the rank of path-heads, which is what level two is — so `stand` measures the distance that
     decides whether four picks are separable, the number the shot actually turns on.

     AND `eyeLift` IS COMPUTED, NOT CHOSEN, BECAUSE IT DOES NOT MEAN WHAT IT SAYS HERE. `standOff`
     sets the eye to `surfaceAt(camera) + eyeLift`, and `surfaceAt` reads the natural terrain — it
     knows nothing about the platform this compound is built on. The camera lands inside the walls,
     where the floor is the platform and the terrain is 350 units below it, so an eyeLift of 460
     put the eye only 162 above the court and 34 above the wall's coping: standing in a walled
     garden and peering over the top of it. Everything below 300 put the eye INSIDE the platform
     block, which is why the picks read 0/4 there.
     So the height is stated against the floor you are actually standing on and the lift is
     back-solved from the ground under the standing point. `EYE_H` is the real number. */
  const EYE_H = 135;                  /* how far the eye rides above the court's own floor */
  const focus = at3(PICK_F, 0);
  focus.y = TOP + 130;
  _focus = focus;
  {
    /* the standing point, derived the same way `standOff` derives it */
    const v = focus.clone().sub(HOME_EYE).setY(0);
    const len = v.length();
    const e = v.multiplyScalar(Math.max(len - SPEC.stand, 400) / len).add(HOME_EYE);
    _eyeLift = (TOP + EYE_H) - Math.max(groundAt(e.x, e.z), LAKE_Y);
  }

  const mass = {
    bearing: SPEC.bearing, dist: SPEC.dist, stand: SPEC.stand, flight: SPEC.dist - SPEC.stand,
    SITE, TOP: Math.round(TOP), F_NEAR, F_FAR, HALF_S, PICK_F, GATE_X,
    ridge: Math.round(124 + HALL.wall + HALL.roof), quarters: Q.map((q) => q[0]),
  };
  /* THE COMPOUND IS LIVE — the authored world does not model it — and the ground it stands on
     is claimed, or the authored wood grows straight through the court. The claim is the
     compound's own RECTANGLE (plus a margin), not discs: the authored festival's edge stands
     1,300 units from the compound's centreline, and a disc big enough to reach the corners
     reached the festival's stalls too — the first application of the claims quietly hid a
     yatai, three nobori and four takahari that were never this place's to take. A disc clears
     the forecourt outside the offset gate. */
  const cc = at3(MID_F, 0);
  const fc = at3(F_NEAR - 620, GATE_X);
  const claims = [
    { x: cc.x, z: cc.z, fx: fwd.x, fz: fwd.z, hf: (F_FAR - F_NEAR) / 2 + 260, hs: HALF_S + 240 },
    { x: fc.x, z: fc.z, r: 720 },
  ];
  return {
    probe: _probe, focus: _focus, eyeLift: _eyeLift, l2: _l2,
    marks: _marks, mass, live: 'all', claims,
  };
}
