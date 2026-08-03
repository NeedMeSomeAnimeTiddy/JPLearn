/* ===================== STUDY — 回遊式庭園, the stroll garden =====================
   A STAND-IN, NOT THE GARDEN. Everything here is boxes and that is the point: the numbers that
   decide the shot get settled against something the right size and shape before anything is
   modelled, because the two most expensive failures in this project were both "build it, then
   look at it".

   Every part is a separately named mesh rather than one merged geometry, which is deliberate and
   temporary: `NAV.hit` reports the name of what a ray struck, so "can you see all four picks from
   the standing point, or is one behind the gate" has a one-word answer. The real build merges.

   WHAT REPLACED THE PAVILION, AND WHY. This file held a three-storey 楼閣 until the costume table
   was re-planned (see PLAN-places.md). It was one of three stacked-roof timber buildings in a set
   of six, and it had nowhere to put L4 — the room the minigame plays in. A stroll garden is the
   one Japanese form designed as a sequence of framed scenes you walk between, so L3 is what it is
   FOR rather than something imposed on it, and there is a 茶室 at the end of every path. */
import * as THREE from 'three';

export function buildStudy(ctx) {
  const {
    DEST_SPECS, HOME_EYE, LAKE_Y, MARKS, PROBE, RAMP,
    addOutline, backScene, blockAdd, destPlace, groundAt, treeClaim,
  } = ctx;

  /* ---- the site, and its own coordinates ----
     Same (f, sd) frame REVIEW uses: f down the axis away from home, sd across it, positive to the
     right. The bearing is READ from the spec rather than repeated here — written out twice it is
     two numbers that have to be kept equal by hand. */
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

  /* ---- the enclosure ----
     DEEP RATHER THAN SQUARE, and the depth is a measurement rather than a taste. Arriving has to
     put the camera INSIDE the garden — outside it, the near wall stands 500 units off the eye and
     fills the bottom third of the frame, and the threshold you have supposedly just crossed is
     still in front of you. But an interior camera is close to everything, and the four level-two
     picks were then 2,000 pixels apart: past the frame edges.

     Both are fixed by the same number. The garden runs 2,400 deep against 1,700 across, the
     camera stands 200 inside the gate, and the picks sit 950 further on — far enough to gather
     into 950 pixels of spread, near enough to be arrived at. A stroll garden being longer than it
     is wide is also simply what one is: the circuit needs a there and a back. */
  const F0 = -900, F1 = 1500;         /* near and far walls, in approach coordinates */
  const HALF = 850;                   /* and half its width */
  const WALL_H = 90, WALL_T = 50;     /* 築地塀: an earthen wall is chest height, not a rampart */
  const COPE = 26;                    /* the tile coping that gives it a line against the trees */
  const GATE_W = 300, GATE_H = 210, GATE_X = -450;
  const PICK_F = 250;                 /* the rank of path-heads */
  const POND = { f0: 620, f1: 1340, half: 620, drop: 46 };
  const HOUSE = { w: 230, d: 210, h: 170, roof: 60 };

  /* THE GARDEN MAKES ITS OWN GROUND. Same rule the shrine's court had to learn: a platform set to
     the average of the ground under it comes out buried at the high end. Take the highest point it
     covers, and over water count the water — a garden at the lake's edge is built up to the
     waterline, not sunk to the bed 330 units down. */
  let TOP = -Infinity, LOW = Infinity, WET = 0, N = 0;
  for (let f = F0; f <= F1; f += 90) {
    for (let sd = -HALF; sd <= HALF; sd += 90) {
      const y = at3(f, sd).y;
      TOP = Math.max(TOP, Math.max(y, LAKE_Y));
      LOW = Math.min(LOW, y);
      if (y < LAKE_Y) WET++;
      N++;
    }
  }
  TOP += 26;                          /* the platform stands a little proud of the shore */
  const SITE = { top: Math.round(TOP), low: Math.round(LOW), fall: Math.round(TOP - LOW), wet: +(WET / N).toFixed(2) };

  const grp = new THREE.Group();
  const foot = at3((F0 + F1) / 2, 0);
  grp.position.set(foot.x, TOP, foot.z);
  /* a plain Object3D points its LOCAL +Z at the lookAt target (a camera points -Z), so local +Z is
     "toward home" and local z is the NEGATIVE of f, measured from the enclosure's centre */
  grp.lookAt(HOME_EYE.x, TOP, HOME_EYE.z);
  backScene.add(grp);
  const MID = (F0 + F1) / 2;
  const zOf = (f) => MID - f;

  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP, flatShading: true });
  const EARTH = 0x8a7f6b, TILE = 0x4d5257, TIMBER = 0x8a7256, WATER = 0x3c4c55,
    MOSS = 0x5c6e42, STONE = 0x6f6a63;

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

  /* the made ground, carried below the platform line so the skirt buries itself in the shore
     rather than floating over the low corner. Depth is READ, not assumed — the fall across this
     site would be a different number anywhere else. */
  const SINK = Math.max(240, TOP - LOW + 80);
  block('court', HALF * 2, SINK, F1 - F0, 0, -SINK, 0, MOSS, 3.2);

  /* ---- the wall, and the gate that is deliberately NOT on the axis ----
     THE GATE IS OFFSET BECAUSE A ROOF ON THE SIGHT LINE CANNOT BE MADE TO WORK. With it centred,
     the four picks measured 4/4 visible at an eye of 200, 0/4 at 320, 4/4 at 460 and 0/4 again at
     1,400/460 — the sight line passes UNDER the gate roof from low down and OVER it from high up,
     and between those is a band where the slab cuts exactly through the name-plaques. Widening the
     opening does not fix it and raising the roof only moves the band. Any roofed threshold
     standing between the eye and level two has that failure somewhere in its range.

     Offsetting it removes the whole class of problem and is what a Japanese garden does anyway:
     entrances are deliberately not axial — you turn to come in, so the garden is disclosed rather
     than presented. With the gate off the axis the picks read 4/4 at every stand-off and every eye
     height measured. */
  [[-HALF, GATE_X - GATE_W / 2, 'L'], [GATE_X + GATE_W / 2, HALF, 'R']].forEach(([a, b, k]) => {
    const run = b - a, cx = (a + b) / 2;
    block('wall-near' + k, run, WALL_H, WALL_T, cx, 0, zOf(F0) - WALL_T / 2, EARTH, 2.9);
    block('cope-near' + k, run + 18, COPE, WALL_T + 18, cx, WALL_H, zOf(F0) - WALL_T / 2, TILE, 2.9);
  });
  [[-1, 'W'], [1, 'E']].forEach(([s, k]) => {
    block('wall-' + k, WALL_T, WALL_H, F1 - F0, s * (HALF - WALL_T / 2), 0, 0, EARTH, 2.9);
    block('cope-' + k, WALL_T + 18, COPE, F1 - F0 + 18, s * (HALF - WALL_T / 2), WALL_H, 0, TILE, 2.9);
  });
  block('wall-far', HALF * 2, WALL_H, WALL_T, 0, 0, zOf(F1) + WALL_T / 2, EARTH, 2.9);
  block('cope-far', HALF * 2 + 18, COPE, WALL_T + 18, 0, WALL_H, zOf(F1) + WALL_T / 2, TILE, 2.9);

  /* 棟門 — the gate. The one place the low wall is allowed a roof, so the enclosure has something
     to be recognised by from outside without becoming a building. Off the axis, so it frames the
     approach rather than the interface. */
  block('gate-post-L', 40, GATE_H, 46, GATE_X - GATE_W / 2 + 20, 0, zOf(F0) - WALL_T / 2, TIMBER, 3.2);
  block('gate-post-R', 40, GATE_H, 46, GATE_X + GATE_W / 2 - 20, 0, zOf(F0) - WALL_T / 2, TIMBER, 3.2);
  block('gate-roof', GATE_W + 120, 44, 150, GATE_X, GATE_H, zOf(F0) - WALL_T / 2, TILE, 3.5);

  /* ---- the pond ----
     In the far half, opening toward the lake — which is 78% of this site's far side, so the
     garden's water and the world's meet instead of the pond being a puddle inside a wall with a
     lake behind it. */
  block('pond', POND.half * 2, POND.drop, POND.f1 - POND.f0, 0, -POND.drop, zOf((POND.f0 + POND.f1) / 2), WATER, 2.4);
  block('island', 260, 70, 200, -140, -POND.drop + 10, zOf(1000), MOSS, 2.7);
  /* 反橋 — the arched bridge, flat for now; the arch is a modelling question, not a framing one */
  block('bridge', 120, 34, 420, 250, 40, zOf(900), TIMBER, 2.9);

  /* ---- level two: the four path-heads ----
     THE PICKS ARE AT THE ENTRANCE, NOT AT THE CORNERS. The first stand-in put a 茶室 in each corner
     of the enclosure and measured them 1,601 pixels apart on screen — the whole frame width — with
     the pond a dark slab between them. It read as an aerial photograph of a compound rather than a
     garden anyone was standing in, and no stand-off fixed it: pulling back far enough to gather
     four corners costs the flight, and a big enclosure seen whole is a plan drawing either way.

     Which is the wrong shape for the interaction anyway. In a stroll garden you do not survey four
     quarters and choose one; you stand near the entrance and choose a WAY TO GO. So the four picks
     are a rank of path-heads across the court, each an opening in a hedge with its season's tree
     over it, a lantern beside it and a 駒札 name-plaque on a post. The quarter itself is what level
     three walks into, and the tea house at its end is level four. */
  const Q = [['spring', -300], ['summer', -100], ['autumn', 100], ['winter', 300]];
  Q.forEach(([name, sd]) => {
    const z = zOf(PICK_F);
    [[-1], [1]].forEach(([s]) => {
      block('hedge-' + name + (s < 0 ? 'L' : 'R'), 74, 130, 150, sd + s * 78, 0, z, MOSS, 2.7);
    });
    /* the 駒札 — the wooden name-plaque a Japanese garden actually names a scene with */
    block('fuda-' + name, 96, 66, 12, sd, 150, z + 60, TIMBER, 2.4);
    block('post-' + name, 16, 150, 16, sd, 0, z + 60, TIMBER, 2.2);
    /* the season's tree over the opening, and the lantern that marks the station */
    block('tree-' + name, 190, 60, 190, sd, 240, z - 40, MOSS, 2.9);
    block('lantern-' + name, 40, 120, 40, sd + 130, 0, z + 30, STONE, 2.5);
  });

  /* ---- level four's room, one of four ----
     The 茶室 the chosen quarter's path ends at. Only one is stood in: what it has to prove is that
     a room deep in the garden is reachable and framable, not that four of them are. */
  block('house-summer', HOUSE.w, HOUSE.h, HOUSE.d, -560, 0, zOf(1150), TIMBER, 3.0);
  block('roof-summer', HOUSE.w + 130, HOUSE.roof, HOUSE.d + 130, -560, HOUSE.h, zOf(1150), TILE, 3.2);

  MARKS['study'] = grp;
  blockAdd(foot.x, foot.z, Math.max(HALF, (F1 - F0) / 2) + 260, 300 + (TOP - groundAt(foot.x, foot.z)));

  /* THE APPROACH IS CLEARED, NOT JUST THE FOOTPRINT. Everything between the camera and the subject
     is in shot, so the claim is a WEDGE widening from the standing point to the gate rather than a
     circle round the garden — which is how two of the pavilion's four bays came back blocked by a
     broadleaf. It stops at the far wall so the wood behind stays as a backdrop, and the garden's
     own planting will be placed by hand rather than scattered. */
  const STAND = SPEC.stand;
  const CLEAR_F0 = PICK_F - STAND - 300;
  for (let f = CLEAR_F0; f <= F1; f += 240) {
    const p = at3(f, 0);
    treeClaim(p.x, p.z, 240 + 820 * ((f - CLEAR_F0) / (F1 - CLEAR_F0)));
  }

  /* ---- where the camera looks ----
     At the rank of path-heads, which is what level two is. The target sits on them rather than on
     the pond beyond, so `stand` measures the distance that decides whether four picks are
     separable — the number the shot actually turns on. */
  const focus = at3(PICK_F, 0);
  focus.y = TOP + 120;
  DEST_SPECS[0].focus = focus;

  ctx.STUDY_MASS = {
    bearing: SPEC.bearing, dist: SPEC.dist, SITE, TOP: Math.round(TOP),
    F0, F1, HALF, WALL_H, GATE_H, GATE_X, PICK_F, POND, quarters: Q.map((q) => q[0]),
  };
  return ctx.STUDY_MASS;
}
