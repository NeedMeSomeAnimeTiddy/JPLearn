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

export function buildStudy(ctx) {
  const {
    DEST_SPECS, HOME_EYE, LAKE_Y, MARKS, PROBE, RAMP,
    addOutline, backScene, blockAdd, destPlace, groundAt, treeClaim,
  } = ctx;

  /* ---- the site, and its own coordinates ----
     f down the axis away from home, sd across it, positive to the right. The bearing is READ from
     the spec rather than repeated here — written out twice it is two numbers kept equal by hand. */
  const SPEC = DEST_SPECS[0];
  const base = destPlace(SPEC.bearing, SPEC.dist, 0);
  const fwd = new THREE.Vector3().copy(base).sub(HOME_EYE).setY(0).normalize();
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const at3 = (f, sd, lift = 0) => {
    const v = base.clone().addScaledVector(fwd, f).addScaledVector(side, sd);
    v.y = groundAt(v.x, v.z) + lift;
    return v;
  };
  PROBE.STUDY = at3;

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
  const WALL_H = 100, WALL_T = 54, COPE = 28;
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
    MARKS['study-' + name] = m;
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
    MARKS['study-hall-roof'] = m;
  }

  /* ---- the four gardens, as bare ground ----
     Step three plants them. What they have to prove now is that each face has room for a garden
     and that the four are separable from the entrance, so each is one coloured slab of its own
     character: gravel south, moss east, water north, maple leaf west. The pond and its bridge are
     stood in because the bridge is the one element with a fixed place in the brief. */
  const GY = 8;                       /* the gardens sit a little below the hall's plinth */
  const innerS = HALL.w / 2 + HALL.veranda, innerF = HALL.d / 2 + HALL.veranda;
  block('garden-south', HALF_S * 2 - WALL_T * 2, GY, GARDEN, 0, 0, zOf(-innerF - GARDEN / 2), SAND, 2.4);
  block('garden-north', HALF_S * 2 - WALL_T * 2, GY, GARDEN, 0, 0, zOf(innerF + GARDEN / 2), MOSS, 2.4);
  block('garden-east', GARDEN, GY, innerF * 2, innerS + GARDEN / 2, 0, 0, MOSS, 2.4);
  block('garden-west', GARDEN, GY, innerF * 2, -(innerS + GARDEN / 2), 0, 0, MAPLE, 2.4);
  /* 池 and 反橋 — the pond on the north face and the arched bridge over it */
  block('pond', 1180, 40, 520, 0, -40, zOf(innerF + GARDEN / 2), WATER, 2.4);
  block('bridge', 150, 40, 620, -180, 40, zOf(innerF + GARDEN / 2), TIMBER, 2.9);

  /* ---- level two: the four path-heads ----
     A rank across the entrance court, each the mouth of the way round to its garden. The picks are
     HERE and not at the gardens themselves: a first stand-in put one in each corner of the
     compound and they measured 1,601 pixels apart, the whole frame width, which reads as an aerial
     photograph rather than as a garden anyone is standing in. It is also the wrong shape for the
     interaction — in a garden you do not survey four quarters and choose one, you stand near the
     entrance and choose a way to go. */
  const Q = [['kana', -420, MOSS], ['kanji', -140, WATER], ['goi', 140, MAPLE], ['bunpou', 420, SAND]];
  Q.forEach(([name, sd, tint]) => {
    const z = zOf(PICK_F);
    [[-1], [1]].forEach(([s]) => {
      block('hedge-' + name + (s < 0 ? 'L' : 'R'), 84, 140, 160, sd + s * 88, 0, z, MOSS, 2.7);
    });
    /* the 駒札 — the wooden name-plaque a Japanese garden actually names a scene with */
    block('post-' + name, 18, 160, 18, sd, 0, z + 66, TIMBER, 2.2);
    block('fuda-' + name, 104, 72, 14, sd, 160, z + 66, TIMBER, 2.4);
    /* the season's tree over the opening, tinted to its garden so the pick and its destination
       are the same colour before either carries a word */
    block('tree-' + name, 200, 64, 200, sd, 250, z - 44, tint, 2.9);
  });

  MARKS['study'] = grp;
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

  /* ---- where the camera looks ----
     At the rank of path-heads, which is what level two is — so `stand` measures the distance that
     decides whether four picks are separable, the number the shot actually turns on. */
  const focus = at3(PICK_F, 0);
  focus.y = TOP + 130;
  DEST_SPECS[0].focus = focus;

  ctx.STUDY_MASS = {
    bearing: SPEC.bearing, dist: SPEC.dist, stand: SPEC.stand, flight: SPEC.dist - SPEC.stand,
    SITE, TOP: Math.round(TOP), F_NEAR, F_FAR, HALF_S, PICK_F, GATE_X,
    ridge: Math.round(124 + HALL.wall + HALL.roof), quarters: Q.map((q) => q[0]),
  };
  return ctx.STUDY_MASS;
}
