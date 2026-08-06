/* ===================== REVIEW — 神社, the shrine precinct =====================
   THE FIRST PLACE TO BECOME ITS OWN FILE. The mockup had reached 6,400 lines with one place in
   it; five more at the same weight is well past twelve thousand, and the point at which that
   becomes expensive is the point at which a second place starts sharing scope with the first.
   So the shape is settled here, with one place built, rather than discovered later with two.

   THE CORE IS PASSED IN, NOT IMPORTED. An inline `<script type="module">` can import from a file
   but cannot be imported from, and the core lives inline in the page. So anything that genuinely
   belongs to the page — the scene, the renderer, the look state, the world's coordinate frame,
   the registries a place writes itself into — has to be handed over, and the context object is
   that. It is also a useful constraint: the 25 names below are the complete list of what a place
   may reach for, and adding to it is a decision somebody has to make on purpose.

   WHAT IS IMPORTED INSTEAD. Eight of those names used to be in the bag and are not any more:
   they depend on nothing but THREE and a canvas, so they live in `toolkit.js` and both this file
   and the page import them from there. The membership test was mechanical rather than aesthetic —
   see that file's header. `toriiGeo` was one of them, listed here for a long time as a thing
   deliberately left in the core; it turned out to be pure geometry and had no reason to be.

   What DOES stay behind: `buildEmaWall`, the ema-tablet text helpers and `L3_REVIEW`. All three
   are used only by this place today, and all three are the ones most likely to generalise once a
   third place exists — a wall of hanging labels and a queue's worth of deck data are not
   obviously shrine-shaped. Moving them now would be guessing at a boundary. */
import * as THREE from 'three';
import {
  beamSeg, broadleafGeo, cedarGeo, hash01, mergeParts, outlineGeom, signCanvas, toriiGeo,
} from './toolkit.js';

export function buildReview(ctx) {
  const {
    HOME_EYE, L3_REVIEW, RAMP, SECTION_ACCENT, addOutline, authored, backRenderer, backScene,
    blockAdd, buildEmaWall, destPlace, drawSign, groundAt, hengaku, instanced, outlineMaterial,
    standOff, treeClaim, walkAct, worldPickEl,
  } = ctx;
  /* WHAT THIS PLACE REGISTERS, GATHERED RATHER THAN SCATTERED. These used to be writes straight
     into the page's registries, which is what forced the call site to sit at an exact point in the
     module — the comment there read "it has to run HERE and not later". They are collected here
     and handed back instead, so installing them is the caller's decision and its timing is visible
     in the caller. */
  const _marks = {};
  const _ambient = [];
  const _noReflect = [];
  /* the shrine's costume is BAKED — the authored world models this whole precinct, richer than
     the analytic build, so the analytic one stays hidden under it. What stays live is what the
     bake cannot carry: the lettered tablets, the placards, and the level-four furniture. THE
     AUTHORED WORLD IS NEVER TOUCHED (Robbie's rule): live objects are additions, and where a
     live object would coincide with an authored one, the live object moves out of its way. */
  const _live = [];
  let _probe = null, _focus = null, _walk = null, _title = null, _l4 = null;


/* ================= REVIEW: 神社 — the shrine precinct =================
   A FULL AREA, AND DELIBERATELY OUT OF THE MENU'S SIGHT. At bearing 26° it sat inside the home
   camera's 31° half-cone and cluttered the one composition that works. Everything here is at
   105°, well behind the shoulder — you only ever see it by going there.

   Sizes are stated as ratios of the gate on purpose. The gate is a building; the ema wall is a
   piece of furniture standing in front of it. Left as absolute numbers the wall crept upward
   every time the tablets needed to be more readable, until it was 620 wide against a 590-wide
   gate — the same size as the landmark, which is the one thing it must never be. */
{
  const GATE_H = 470;
  /* SIZED AGAINST THE PAVING AS WELL AS AGAINST THE GATE. The approach is 360 wide, so a wall
     standing at side -110 with a half-width of 103 had its near end 70 units inside the paving —
     posts growing straight out of the stone. It is smaller and further off now: 207 wide at side
     -270, which puts its near edge six units clear of the kerb, and it stops being the largest
     object in the frame. */
  const WALL_W = GATE_H * 0.45;     /* 211 */
  const WALL_H = GATE_H * 0.345;
  /* how far the paving's surface stands above the ground it is laid on, and how far clear of it
     the wall then sits */
  const PAVE_RISE = 17;
  const WALL_LIFT = 8;
  const base = destPlace(105, 5200, 0);
  const fwd = new THREE.Vector3().copy(base).sub(HOME_EYE).setY(0).normalize();
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  /* approach coordinates: f down the axis, sd across it. Saying "forward and to the left of the
     gate" in world x and z means something different at every bearing, which is what had the
     wall and the gate growing through one another. */
  const at3 = (f, sd, lift = 0) => {
    const v = base.clone().addScaledVector(fwd, f).addScaledVector(side, sd);
    v.y = groundAt(v.x, v.z) + lift;
    return v;
  };
  const facing = (o, f, sd) => {
    const t = at3(f, sd);
    o.lookAt(t.x, o.position.y, t.z);
  };
  _probe = at3;

  /* ---- the authored tunnel, when there is one ----
     THE WALK FOLLOWS THE WORLD IT IS SEEN IN. The analytic axis runs from HOME toward the
     place; the authored shrine was laid out along the BEARING RADIAL from the world origin,
     and the two diverge 37° — measured, the walk was gliding through open meadow four hundred
     units to the side of the authored gates. So when the authored world is up, the corridor's
     line is read from the model itself: the 25 authored gates (spaced 268, the analytic
     spacing, which the artist matched), the Romon at one end and the Honden at the other.
     Everything the walk and level four place — placards, rails, cameras, the room — rides
     whichever line is real. Names drive the read; a re-bake that keeps the names keeps this
     working, which is exactly what models/README.md promises.
     (Declared ahead of everything that uses it — the hall as well as the walk. This module has
     now been bitten by its own TDZ nine times.) */
  const AUTH = (() => {
    if (!authored || !authored.ready) return null;
    const gates = authored.instances(/Landscape_Structures_ToriiExtra/);
    const romon = authored.meshes(/Torii_Buildings_Romon/)[0];
    const honden = authored.meshes(/Torii_Buildings_Honden/)[0];
    if (gates.length < 24 || !romon || !honden) return null;
    const len = Math.hypot(honden.x - romon.x, honden.z - romon.z);
    const fx = (honden.x - romon.x) / len, fz = (honden.z - romon.z) / len;
    const tOf = (p) => (p.x - romon.x) * fx + (p.z - romon.z) * fz;
    const atT = (t, sd = 0, lift = 0) => {
      const v = new THREE.Vector3(romon.x + fx * t - fz * sd, 0, romon.z + fz * t + fx * sd);
      v.y = groundAt(v.x, v.z) + lift;
      return v;
    };
    return {
      atT,
      yaw: Math.atan2(-fx, -fz),   /* points a plane's +Z back toward the Romon */
      gates: gates.map((g) => ({ y: g.y, t: tOf(g) })).sort((a, b) => a.t - b.t),
      tHonden: tOf(honden),
    };
  })();

  /* ---- the paving, and the courtyard let into it ----
     A 360-wide strip is a path, and a path is not somewhere anything can stand: the ema wall had
     one foot on the stone and one in the grass, and every attempt to fix that by sliding the wall
     sideways ran into the frame's left edge instead. What was missing was ground. The strip now
     opens into a level court between the outer gate and the main one — the ema wall on its left
     side, the water pavilion on its right — and closes again beyond it.

     THE COURT IS LEVEL AND THE PATH IS NOT. A paved court that follows a heightfield is not a
     paved court; one set to the average of the ground under it comes out buried at the high end.
     It is set above the HIGHEST point it covers and skirted 300 deep, so it is a made platform
     whatever the hill is doing, and everything standing on it can be placed from one number
     instead of from `groundAt` at its own station — which is the bug that hid the wall's plinth
     three times over. */
  /* the tunnel's measurements, needed here because the paving has to reach the end of it */
  /* long enough to hold the walk. The viewpoint for one placard has to stand clear of the one
     before it, so the sign spacing sets the tunnel's length, not the other way round. */
  const TUN_H = GATE_H * 0.86, TUN_STEP = 268, TUN_F0 = 640, TUN_N = 26;
  const TUN_END = TUN_F0 + (TUN_N - 1) * TUN_STEP;
  const CY = { f0: -1400, f1: -170, half: 470 };
  let CY_TOP = -Infinity;
  for (let f2 = CY.f0; f2 <= CY.f1; f2 += 110) {
    for (let sd = -CY.half; sd <= CY.half; sd += 110) CY_TOP = Math.max(CY_TOP, at3(f2, sd).y);
  }
  CY_TOP += PAVE_RISE;
  const onCourt = (f2) => f2 > CY.f0 - 40 && f2 < CY.f1 + 40;
  {
    const pv = [];
    /* ---- THE PATH IS ONE RIBBON, NOT A LINE OF BOXES ----
       Every 260-unit segment used to be levelled at the mean of its own two ground samples and
       rotated to point at the next one, so consecutive segments met at different heights AND
       different angles: a staircase of small steps with slivers of daylight between them. From
       the courtyard nobody could see it. Walking down the tunnel it is the floor, and it was the
       first thing you noticed. A ribbon shares its vertices at every join, so it cannot step and
       it cannot gap.

       It is also level ACROSS its width even where the hillside is not — a paved way is built up
       on the low side, it does not tilt — and it ramps onto the court instead of meeting the
       kerb at whatever height the ground happens to be doing there. */
    const courtBlend = (k, y) => {
      const d = k < CY.f0 ? CY.f0 - k : (k > CY.f1 ? k - CY.f1 : 0);
      if (d > 560) return y;
      const t = 1 - d / 560;
      return y + (CY_TOP - y) * t * t * (3 - 2 * t);
    };
    const ribbon = (from, to, halfW, rise, skirt) => {
      const STEP = 90;
      const pos = [], col = [], idx = [];
      const cA = new THREE.Color(0x7d776c), cB = new THREE.Color(0x746e64);
      let n = 0;
      for (let k = from; k <= to; k += STEP) {
        const l = at3(k, -halfW), r = at3(k, halfW), m2 = at3(k, 0);
        const y = courtBlend(k, Math.max(l.y, r.y, m2.y) + rise);
        pos.push(l.x, y, l.z, r.x, y, r.z, l.x, y - skirt, l.z, r.x, y - skirt, r.z);
        const c = (Math.floor(k / 540) % 2) ? cA : cB;
        for (let v = 0; v < 4; v++) col.push(c.r, c.g, c.b);
        n++;
      }
      for (let i = 0; i < n - 1; i++) {
        const a = i * 4, b = a + 1, c = a + 2, d = a + 3;
        const a2 = a + 4, b2 = a + 5, c2 = a + 6, d2 = a + 7;
        idx.push(a, b, b2, a, b2, a2);       /* the surface */
        idx.push(a, a2, c2, a, c2, c);       /* the left kerb */
        idx.push(b, d, d2, b, d2, b2);       /* and the right */
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      /* ITS OWN MESH, NOT MERGED. `mergeParts` writes one flat colour over every vertex of each
         part it is handed — which is exactly what it is for, and exactly wrong for a ribbon that
         carries its courses in its own colour attribute. Merged in, the whole path came out
         white. */
      backScene.add(new THREE.Mesh(g, new THREE.MeshToonMaterial({
        vertexColors: true, gradientMap: RAMP, flatShading: true,
      })));
    };
    ribbon(-2560, CY.f0 + 40, 180, PAVE_RISE, 34);
    ribbon(CY.f1 - 40, TUN_END + 860, 180, PAVE_RISE, 34);
    /* the court: one slab and a kerb course standing just proud of it */
    const slab = (halfW, top, depth, colour, over) => {
      const a = at3(CY.f0 - over, 0), b = at3(CY.f1 + over, 0);
      const g = new THREE.BoxGeometry(halfW * 2, depth, a.distanceTo(b));
      const m = new THREE.Mesh(g, null);
      m.position.copy(a).lerp(b, 0.5);
      m.position.y = top - depth / 2;
      m.lookAt(b.x, m.position.y, b.z);
      m.updateMatrix();
      pv.push({ geo: g.clone().applyMatrix4(m.matrix), color: colour });
    };
    slab(CY.half + 26, CY_TOP - 9, 300, 0x6a655c, 26);   /* the kerb, a step down and out */
    /* and the court in courses rather than as one sheet. Nine hundred by twelve hundred of a
       single tone is the least convincing surface in the frame; the joints cost nothing, and the
       segments butt exactly because the approach is a straight line, so there is no seam to
       z-fight over. */
    {
      const N = 9, step = (CY.f1 - CY.f0) / N;
      for (let i = 0; i < N; i++) {
        const a = at3(CY.f0 + step * i, 0), b = at3(CY.f0 + step * (i + 1), 0);
        const g = new THREE.BoxGeometry(CY.half * 2, 290, a.distanceTo(b));
        const m = new THREE.Mesh(g, null);
        m.position.copy(a).lerp(b, 0.5);
        m.position.y = CY_TOP - 145;
        m.lookAt(b.x, m.position.y, b.z);
        m.updateMatrix();
        pv.push({ geo: g.clone().applyMatrix4(m.matrix), color: i % 2 ? 0x7d776c : 0x746e64 });
      }
    }
    const paving = new THREE.Mesh(mergeParts(pv), new THREE.MeshToonMaterial({
      vertexColors: true, gradientMap: RAMP, flatShading: true,
    }));
    backScene.add(paving);
  }

  /* 一の鳥居 — the outer gate, and the only one the camera goes THROUGH rather than up to. It
     stands on the line the flight actually travels (home to the standing point is a straight
     line, and the standing point is on the approach axis), far enough back that it is behind you
     on arrival: it is the entrance, not part of the composition. Larger than the main gate, which
     is how a first torii usually is, and large enough that the camera passes well under its tie
     beam rather than shaving it. */
  {
    const outerMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP, flatShading: true });
    const o = new THREE.Mesh(toriiGeo(GATE_H * 1.16), outerMat);
    o.position.copy(at3(-2100, 0));
    facing(o, -2101, 0);
    backScene.add(o);
    addOutline(o, 3.5);
  }

  const gateMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP, flatShading: true });
  const gate = new THREE.Mesh(toriiGeo(GATE_H), gateMat);
  gate.position.copy(at3(0, 0));
  facing(gate, -1, 0);
  backScene.add(gate);
  addOutline(gate, 3.7);
  /* THE AIM POINT IS THE FRAME'S CENTRE, so it says two things at once: `sd` decides what sits
     on the middle vertical, and `lift` decides the pitch. Held on the gate's own axis the gate
     centres; raised to half its height the camera tips UP at it and the horizon drops, which is
     what makes a gate read as something you stand under rather than something you look at. It
     cannot go much higher than this — the wall is close and low, and every degree of up-pitch
     drives it toward the bottom edge twice as fast as it lifts the gate. */
  _focus = at3(-430, 18, GATE_H * 0.46);

  /* ---- 千本鳥居 — the tunnel ----
     UNIFORM NOW, AND THAT IS NOT A STYLE CHOICE. Each gate smaller and nearer than the last was
     a cheap way to fake depth from one fixed viewpoint, and it worked perfectly until level three
     sent the camera down it — at which point it is a corridor that closes to a point you cannot
     fit through, with a tie beam at 114 units and a camera at 182. A real senbon-torii is uniform
     anyway; the depth comes from there being a great many of them, which is also cheaper: one
     instanced mesh and one outline twin instead of eleven of each. */
  instanced(toriiGeo(TUN_H), gateMat, TUN_N, (i) => ({
    pos: at3(TUN_F0 + i * TUN_STEP, 0),
    rot: gate.rotation.y,
    scale: new THREE.Vector3(1, 1, 1),
  }), 3.5);

  /* ================= the hall at the end of it — and LEVEL FOUR =================
     THE ROOM THE PRACTICE HAPPENS IN, and the first L4 in the project. The hall used to be
     scenery: a closed red mass whose whole job was to give twenty-six converging gates something
     to converge ON. That job is unchanged, and so is the reasoning that sized and coloured it:
     from the standing point the tunnel's far opening is a 54 x 64 pixel window, nothing about a
     SHAPE survives that distance, and vermilion is the one hue that means "shrine" and appears
     nowhere in the ground — so the walls stay lacquer red, the roof dark and the plinth stone.
     The silhouette is deliberately kept too: same footprint, same roof line. What changed is
     that the front bay is now a doorway with two sliding panels in it, and behind them is a
     room — floor, altar, mirror, hanging lanterns, and a card standing on an easel, which is
     where the queue you chose at level three actually runs.

     THE DESCENT IS THE REST OF THE CORRIDOR. The walk already points at the hall; choosing the
     placard you are beside rides the remaining bays, the doors part as you close, and the light
     comes up inside — the room was dark until you were expected, which is what makes an interior
     read as entered rather than as switched on. The camera stops just past the tunnel mouth,
     at the foot of the steps: the doorway fills a 16:9 frame edge to edge there, so the arrival
     reads as standing at the threshold with the room around you, while wider frames keep the
     door posts as a proscenium.

     ONE EMISSIVE DRIVES THE ROOM. Every interior surface shares one material whose emissive is
     the room's light; the lanterns, the door paper and the card each carry their own so they can
     sit brighter in the same dark. Enter tweens all four up, leave tweens them home — nothing
     appears or vanishes, which is the rule everything here lives by. */
  let haidenL4 = null;
  {
    /* BEFORE THE AUTHORED HONDEN when there is one — IN FRONT OF IT, NEVER IN PLACE OF IT.
       The authored hall is the artist's and stays exactly as modelled; level four ADDS
       furniture: a mat, an easel and the lettered card, set on the court before the hall's
       doors, and the camera frames the card against the Honden itself. In the generated
       fallback world there is no authored hall, so the full analytic room — shell, sliding
       doors, interior, lanterns — is built as before; there it only ever replaces this
       module's own old scenery hall, nobody else's. */
    const HF = TUN_END + 700;
    /* MEASURED BEFORE PLACING, twice, because the authored precinct is layered: a gate
       building spans t 8,996-9,960 on the axis, the covered worship hall 9,535-10,659 (its
       aisle railed — a camera inside it stands in a fence), the offering box under the hall's
       far eave, the Honden behind. The one open ground on the axis is the strip between the
       LAST TUNNEL GATE (t 8,644) and the gate building's face — so that is where the card
       waits, 1,949 short of the Honden's centre: the arrival is framed by the final torii,
       with the gate building, the sacred cedar and the halls stacking behind the easel. */
    const hallAt = AUTH ? (() => {
      const v = AUTH.atT(AUTH.tHonden - 1949);
      /* the furniture stands on the authored court's own surface, not the terrain under it */
      const court = authored.meshes(/Torii_Surfaces_ToriiCourtGround/)[0];
      if (court) v.y = Math.max(v.y, court.y + 2);
      return v;
    })() : at3(HF, 0);
    /* the floor the furniture rests on: the shell's raised floor in the analytic room, the
       court itself in the authored world */
    const FLR = AUTH ? 2 : 106;
    const grp = new THREE.Group();
    grp.position.copy(hallAt);
    if (AUTH) {
      const b = AUTH.atT(AUTH.tHonden - 2100);
      grp.lookAt(b.x, hallAt.y, b.z);   /* local +Z looks back down the authored tunnel */
    } else {
      facing(grp, TUN_END, 0);          /* or back down the analytic one */
    }
    backScene.add(grp);
    _live.push(grp);

    const VERM = 0xb03a2a, VERM_D = 0x8a3626, ROOF = 0x3b332a, RIDGE = 0x332c25,
      STONE = 0x6c6459, FLOOR = 0x6b5744, FLOOR_D = 0x5d4b3a, DARK = 0x3a2b20,
      PAPER = 0xe6dcc4;
    const ext = [], inn = [];
    const box = (arr, w, h, d, x, y, z, c) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      arr.push({ geo: g, color: c });
    };

    const intMat = new THREE.MeshToonMaterial({
      vertexColors: true, emissive: 0x14100b, gradientMap: RAMP, flatShading: true,
    });
    let matGold = null;
    if (!AUTH) {
      /* the shell: plinth, steps up the front, columns, walls with the front bay open */
      box(ext, 1160, 92, 760, 0, 46, 0, STONE);
      for (let i = 0; i < 3; i++) {
        const h = 72 - i * 24;
        box(ext, 430 - i * 24, h, 62, 0, h / 2, 411 + i * 62, STONE);
      }
      for (const sx of [-1, 1]) for (const cz of [-287, 0, 287]) {
        const g = new THREE.CylinderGeometry(22, 26, 420, 8);
        g.translate(sx * 468, 302, cz);
        ext.push({ geo: g, color: VERM_D });
      }
      for (const sx of [-1, 1]) {
        const g = new THREE.CylinderGeometry(20, 24, 420, 8);
        g.translate(sx * 205, 302, 287);
        ext.push({ geo: g, color: VERM_D });
      }
      box(ext, 962, 394, 26, 0, 303, -300, VERM);        /* back wall */
      for (const sx of [-1, 1]) {
        box(ext, 26, 394, 626, sx * 481, 303, 0, VERM);  /* side walls */
        box(ext, 282, 394, 26, sx * 331, 303, 300, VERM); /* front flanks either side of the bay */
      }
      box(ext, 440, 70, 30, 0, 465, 300, VERM_D);        /* lintel over the opening */
      box(ext, 440, 14, 40, 0, 106, 300, FLOOR_D);       /* the threshold beam */
      /* the roof, kept from the scenery hall so the silhouette every distant shot was tuned
         against does not move */
      box(ext, 1300, 39, 832, 0, 520, 0, 0x4a3d2f);
      for (const sx of [-1, 1]) {
        const g = new THREE.BoxGeometry(780, 47, 960);
        g.rotateZ(-sx * 0.46);
        g.translate(sx * 340, 622, 0);
        ext.push({ geo: g, color: ROOF });
      }
      box(ext, 60, 55, 960, 0, 750, 0, RIDGE);

      const extMesh = new THREE.Mesh(mergeParts(ext), new THREE.MeshToonMaterial({
        vertexColors: true, gradientMap: RAMP, flatShading: true,
      }));
      extMesh.name = 'haiden';
      grp.add(extMesh);
      addOutline(extMesh, 3.5);

      /* the room: everything on one material so one emissive is the room's light */
      for (let i = 0; i < 5; i++) {
        box(inn, 188, 14, 600, -376 + i * 188, 99, 0, i % 2 ? FLOOR_D : FLOOR);
      }
      box(inn, 940, 394, 10, 0, 303, -284, DARK);        /* interior face of the back wall */
      for (const sx of [-1, 1]) box(inn, 10, 394, 600, sx * 463, 303, 0, DARK);
      for (const sx of [-1, 1]) box(inn, 282, 394, 8, sx * 331, 303, 288, DARK);
      box(inn, 560, 40, 150, 0, 126, -230, FLOOR_D);     /* the altar dais */
      box(inn, 18, 96, 18, 0, 194, -232, DARK);          /* the mirror's stand */
      for (const sx of [-1, 1]) {                        /* 御幣 flanking it */
        box(inn, 10, 80, 10, sx * 140, 186, -228, DARK);
        box(inn, 30, 46, 6, sx * 140, 240, -222, PAPER);
        box(inn, 22, 34, 6, sx * 140 + (sx < 0 ? -14 : 14), 228, -220, PAPER);
      }
      for (const sx of [-1, 1]) box(inn, 6, 60, 6, sx * 330, 465, -40, DARK); /* lantern cords */
      const innMesh = new THREE.Mesh(mergeParts(inn), intMat);
      innMesh.name = 'haiden-interior';
      grp.add(innMesh);

      /* 神鏡 — the mirror, the one pale thing at the back of the dark */
      {
        const g = new THREE.CylinderGeometry(60, 60, 8, 14);
        g.rotateX(Math.PI / 2);
        const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({
          color: 0xcfdadb, emissive: 0x3d4a4c, gradientMap: RAMP, flatShading: true,
        }));
        m.position.set(0, 286, -236);
        m.name = 'haiden-mirror';
        grp.add(m);
      }
      /* the hanging lanterns, one either side — the room's stated light source */
      matGold = new THREE.MeshToonMaterial({
        color: 0xe8c47c, emissive: 0x2a1f10, gradientMap: RAMP, flatShading: true,
      });
      for (const sx of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(54, 70, 54), matGold);
        m.position.set(sx * 330, 400, -40);
        m.name = 'haiden-lantern';
        grp.add(m);
      }
    }
    _marks.haiden = grp;

    /* the furniture — the part that exists in BOTH worlds, resting on FLR */
    const furn = [];
    box(furn, 380, 10, 280, 0, FLR + 5, 40, 0x7e2f22);   /* the mat the easel stands on */
    box(furn, 240, 26, 170, 0, FLR + 23, 30, DARK);      /* the easel's foot */
    const furnMesh = new THREE.Mesh(mergeParts(furn), intMat);
    furnMesh.name = 'l4-furniture';
    grp.add(furnMesh);

    /* the easel and the card. The card is the game surface: it is lettered for the queue and
       deck that were chosen, so the room is never dressed with a placeholder. */
    const boardGrp = new THREE.Group();
    boardGrp.position.set(0, FLR + 118, 30);
    boardGrp.rotation.x = -0.34;
    grp.add(boardGrp);
    const boardGeo = new THREE.BoxGeometry(175, 210, 12);
    {
      const c = new THREE.Color(0x4a3626);
      const col = [];
      for (let i = 0; i < boardGeo.attributes.position.count; i++) col.push(c.r, c.g, c.b);
      boardGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(boardGeo, intMat);
      m.name = 'l4-easel';
      boardGrp.add(m);
      const o = new THREE.Mesh(outlineGeom(boardGeo), outlineMaterial(3.0));
      o.frustumCulled = false;
      boardGrp.add(o);
    }
    const cardCanvas = document.createElement('canvas');
    cardCanvas.width = 360; cardCanvas.height = 456;
    const cardTex = new THREE.CanvasTexture(cardCanvas);
    cardTex.colorSpace = THREE.SRGBColorSpace;
    cardTex.anisotropy = backRenderer.capabilities.getMaxAnisotropy();
    const matCard = new THREE.MeshToonMaterial({
      map: cardTex, emissiveMap: cardTex, emissive: new THREE.Color(0x4a443c),
      gradientMap: RAMP,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const cardFace = new THREE.Mesh(new THREE.PlaneGeometry(150, 190), matCard);
    cardFace.position.z = 6 + 2;
    cardFace.name = 'l4-card';
    boardGrp.add(cardFace);

    /* one representative card per deck, so what is on the easel is always the deck you chose */
    const L4_SAMPLE = {
      '漢字 N5': ['水', 'みず · water'],
      '語彙': ['食べる', 'たべる · to eat'],
      '文法': ['〜ている', 'ongoing state'],
      'カタカナ': ['ア', 'a'],
      '聴解': ['音', 'listen and answer'],
      'ひらがな': ['あ', 'a'],
    };
    function drawCard(queueJp, deckJp, n, pct) {
      const g = cardCanvas.getContext('2d');
      const W2 = cardCanvas.width, H2 = cardCanvas.height;
      g.fillStyle = '#ece1c8';
      g.fillRect(0, 0, W2, H2);
      g.strokeStyle = 'rgba(70,50,30,0.55)';
      g.lineWidth = 8;
      g.strokeRect(7, 7, W2 - 14, H2 - 14);
      g.textAlign = 'center';
      g.fillStyle = 'rgba(43,28,16,0.62)';
      g.font = '600 26px "Yu Gothic UI", sans-serif';
      g.fillText(queueJp + ' — ' + deckJp, W2 / 2, 56, W2 - 50);
      const [glyph, gloss] = L4_SAMPLE[deckJp] || ['問', ''];
      g.fillStyle = '#241809';
      g.font = `700 ${glyph.length > 2 ? 100 : 180}px "Yu Gothic UI", "Hiragino Kaku Gothic ProN", sans-serif`;
      g.fillText(glyph, W2 / 2, H2 * 0.56, W2 - 50);
      g.fillStyle = SECTION_ACCENT.REVIEW[1];
      g.fillRect(W2 * 0.3, H2 * 0.655, W2 * 0.4, 5);
      g.fillStyle = 'rgba(43,28,16,0.66)';
      g.font = '600 30px "Yu Gothic UI", sans-serif';
      g.fillText(gloss, W2 / 2, H2 * 0.775, W2 - 46);
      g.fillStyle = 'rgba(43,28,16,0.5)';
      g.font = '800 24px "Arial Black", Arial, sans-serif';
      g.fillText(`${n} ${L3_REVIEW.unit.toUpperCase()} · ${pct}%`, W2 / 2, H2 * 0.9, W2 - 46);
    }
    drawCard('総復習', '漢字 N5', 96, 74);
    cardTex.needsUpdate = true;

    /* the doors: two sliding panels, each a timber frame with a paper field that takes the
       room's light. They rest closed — from the tunnel the hall is the same red mass it always
       was — and part as the level-four ride closes on them. The track sits just inside the
       front wall so an open panel stows behind the flank instead of fighting it. */
    const DOOR_REST = 95, DOOR_OPEN = 286;
    let matPaper = null;
    /* only the analytic room has doors; before the authored Honden there is nothing to slide */
    const doors = AUTH ? [] : [-1, 1].map((sx) => {
      matPaper = matPaper || new THREE.MeshToonMaterial({
        color: PAPER, emissive: 0x241c12, gradientMap: RAMP, flatShading: true,
      });
      const d2 = new THREE.Group();
      d2.position.set(sx * DOOR_REST, 268, 278);
      grp.add(d2);
      const bodyGeo = new THREE.BoxGeometry(190, 324, 14);
      const body = new THREE.Mesh(bodyGeo, new THREE.MeshToonMaterial({
        color: 0x6e3b23, gradientMap: RAMP, flatShading: true,
      }));
      body.name = 'haiden-door' + (sx < 0 ? 'L' : 'R');
      d2.add(body);
      const paper = new THREE.Mesh(new THREE.BoxGeometry(150, 260, 6), matPaper);
      paper.position.z = 6;
      d2.add(paper);
      const o = new THREE.Mesh(outlineGeom(bodyGeo), outlineMaterial(3.0));
      o.frustumCulled = false;
      d2.add(o);
      return d2;
    });

    /* the room's light, as one dial. Rest values are READ from the materials, not retyped.
       Only materials that were built take part — before the authored Honden that is the
       furniture and the card. */
    const LIT = [
      [intMat, 0x4a3823], [matGold, 0x9a7434], [matPaper, 0x8a6f45], [matCard, 0xcfc5ae],
    ].filter(([m]) => m).map(([m, hot]) => ({ m, rest: m.emissive.clone(), hot: new THREE.Color(hot) }));
    const glow = (on) => LIT.forEach(({ m, rest, hot }) => {
      const c = on ? hot : rest;
      gsap.to(m.emissive, {
        r: c.r, g: c.g, b: c.b, duration: 1.3, delay: on ? 0.9 : 0.1, overwrite: true,
      });
    });

    haidenL4 = {
      enter(tileJp, k) {
        const [jp2, en2] = L3_REVIEW.decks[k];
        const q = (L3_REVIEW.queues[tileJp] || L3_REVIEW.queues['総復習'])[k];
        drawCard(tileJp, jp2, q[0], q[1]);
        cardTex.needsUpdate = true;
        doors.forEach((d2, i) => {
          gsap.killTweensOf(d2.position);
          gsap.to(d2.position, {
            x: (i ? 1 : -1) * DOOR_OPEN, duration: 1.2, delay: 0.85, ease: 'power2.inOut',
          });
        });
        glow(1);
        return { jp: jp2, en: en2, meta: `${q[0]} ${L3_REVIEW.unit} · ${q[1]}%` };
      },
      leave() {
        doors.forEach((d2, i) => {
          gsap.killTweensOf(d2.position);
          gsap.to(d2.position, {
            x: (i ? 1 : -1) * DOOR_REST, duration: 1.0, delay: 0.35, ease: 'power2.inOut',
          });
        });
        glow(0);
      },
      /* the shot: past the tunnel mouth, looking onto the easel — with the authored Honden
         itself as the backdrop when the world is up */
      eye: () => {
        const v = AUTH ? AUTH.atT(AUTH.tHonden - 2489) : at3(HF - 560, 0);
        v.y = hallAt.y + FLR + 156;
        return v;
      },
      tgt: () => {
        const v = AUTH ? AUTH.atT(AUTH.tHonden - 1979) : at3(HF - 30, 0);
        v.y = hallAt.y + FLR + 118;
        return v;
      },
    };
    _l4 = haidenL4;
  }

  /* lanterns flanking the way in */
  const lanternMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP, flatShading: true });
  const lg = lanternGeo(190);
  /* the near pair sits at -980, which is behind the wall and still in front of the camera. At
     -1220 it was 70 units short of the eye — a lantern you arrive standing inside. */
  [[-1240, 402], [-1240, -402], [-260, 402], [-260, -402], [420, 250], [420, -250]]
    .forEach(([lf, ls], i) => {
      const m = new THREE.Mesh(lg, lanternMat);
      m.position.copy(at3(lf, ls));
      /* anything inside the court stands on the court — the whole point of a level platform is
         that nothing on it has to ask the hillside where it is */
      if (onCourt(lf)) m.position.y = CY_TOP;
      m.rotation.y = hash01(i, 11) * 6.28;
      backScene.add(m);
      if (i < 4) addOutline(m, 3.2);
    });

  /* ---- level three's placards ----
     A corridor cannot show a list all at once. Anything standing in it converges on the vanishing
     point, so the only way to separate N signs on screen is to have their offsets grow with their
     distance — which means a widening corridor, which is not a corridor. Every arrangement that
     keeps the camera still ends with the third sign hiding behind the first. So the camera moves,
     and the list is something you WALK: one placard beside you, the next ahead of you, the rest
     receding, and a counter to say where in it you are. That is what "a path you travel down"
     turns out to require rather than merely permit.

     The placards are PERMANENT, like everything else here — hung from the tie beams of alternate
     gates, which is where a senbon-torii carries its donors' names. Choosing a queue re-letters
     them; it does not conjure them. */
  /* every fourth gate. At every second the viewpoints are 536 apart and the stand-off is 620,
     so each one lands 84 units SHORT of the previous placard — the camera flies into the back of
     the sign it has just left. The rule is simply that the spacing must exceed the stand-off, and
     it wants to exceed it by enough that the last sign is behind you rather than beside you. */
  /* AND THE STAND-OFF HAS TO LAND MID-BAY. At 620 the eye came to rest 50 units past a gate —
     inside it, near enough — and every viewpoint had a post filling the frame's edge. In a
     regular colonnade the camera's distance is not a free number: it has to be a whole count of
     bays plus a half, measured from the placard's own offset. 804 is three bays back from the
     gate the sign hangs half a bay in front of. */
  const L3_SLOTS = 6, L3_STEP = 4, L3_STAND = 3.5 * 268 - 134;
  const L3_SIGNS = [];
  /* the corridor's frame, chosen once: the authored gates when the world is up, the analytic
     tunnel otherwise. Same interface either way, so the walk below is written once. */
  const AX = AUTH ? {
    at: (t, sd = 0, lift = 0) => AUTH.atT(t, sd, lift),
    yaw: AUTH.yaw,
    stationT: (gi) => AUTH.gates[gi].t - TUN_STEP / 2,
    hangBase: (gi) => AUTH.gates[gi].y,
  } : {
    at: (t, sd = 0, lift = 0) => at3(t, sd, lift),
    yaw: 0,   /* filled below once the gate exists — see the assignment after `gate` */
    stationT: (gi) => TUN_F0 + gi * TUN_STEP - TUN_STEP / 2,
    hangBase: (gi) => at3(TUN_F0 + gi * TUN_STEP - TUN_STEP / 2, 0).y,
  };
  if (!AUTH) AX.yaw = gate.rotation.y;
  {
    /* A SIZE DOWN, AND THE TYPE FILLS MORE OF IT. Everything about a placard derives from these
       three — the rail, the cords, the hinge, the hang height and the outline — so the whole
       family comes down together. Losing 13% of the board and giving the type 30 more units of
       line length is the same move made twice: the sign gets smaller and its contents get larger
       inside it, which is what stops "smaller" reading as "further away". */
    const SW = 146, SH = 89, STH = 7;
    const board = new THREE.BoxGeometry(SW, SH, STH);
    const woodMat = new THREE.MeshToonMaterial({ color: 0x6b5744, gradientMap: RAMP, flatShading: true });
    for (let k = 0; k < L3_SLOTS; k++) {
      /* BETWEEN THE GATES, NOT ON ONE. Hung at a gate's own plane the placard is turned toward
         the reader, and turning it swings its outer edge 34 units BACK — straight into the post
         it is hanging beside, which cuts the first letter off every line. Half a bay forward it
         has the whole opening to itself, and the rail it then needs is a better answer anyway:
         a beam across the corridor is what you would actually hang a sign from. */
      const gi = 2 + k * L3_STEP;
      const f2 = AX.stationT(gi);
      /* INSIDE THE SIGHT LINE PAST THE NEAREST POST. The placard and the posts sit at similar
         distances from the axis, so from three bays back the post two bays ahead subtends a
         slightly WIDER angle than the sign's outer edge does — and shaves the first character off
         every line. It is not a depth-sorting problem and no amount of moving the sign along the
         corridor fixes it; the offset has to come in until the sign fits inside the opening the
         nearer gate leaves. */
      const sd = (k % 2 ? 1 : -1) * 92;
      const hangY = AX.hangBase(gi) + TUN_H * 0.60;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(TUN_H * 0.88, 10, 12),
        new THREE.MeshToonMaterial({ color: 0x46372a, gradientMap: RAMP, flatShading: true }));
      rail.position.copy(AX.at(f2, 0));
      rail.position.y = hangY;
      rail.rotation.y = AX.yaw;
      backScene.add(rail);
      _live.push(rail);
      const root = new THREE.Group();
      root.position.copy(AX.at(f2, sd));
      root.position.y = hangY - SH * 0.62 - 34;
      /* SQUARE TO THE CORRIDOR, AND IT STAYS SQUARE. The cant was borrowed from a shop sign in
         an alley, where it earns its keep because you walk PAST the sign; here you walk toward
         it down a straight line, so all it did was hold every placard at an angle and then need
         a second rotation to undo when you arrived. Two moving parts to arrive at the thing it
         should have been doing all along. The sign is offset to one side of the axis, which at
         this stand-off already gives it six degrees of obliquity — enough that it reads as an
         object in the world rather than a decal, and not enough to cost a letter.

         NO HALF-TURN EITHER. `facing` already points the gates back down the approach, so the
         gate's own +Z is the direction a reader comes from — adding pi sent every placard's
         written face down the tunnel and left the back of the board toward the camera, which
         renders as a plain brown rectangle and looks exactly like a texture that failed. */
      root.rotation.y = AX.yaw;
      backScene.add(root);
      _live.push(root);
      /* THE HINGE IS THE TOP EDGE, not the board's middle. `flip` sits up on the cord line and
         `hold` puts the board back below it, so at zero the geometry is exactly where it was and
         any rotation about x is the board swinging on its hinge — which is the only motion a
         board hung from a rail can actually make. */
      const flip = new THREE.Group();
      flip.position.y = SH / 2;
      root.add(flip);
      const hold = new THREE.Group();
      hold.position.y = -SH / 2;
      flip.add(hold);
      const body = new THREE.Mesh(board, woodMat);
      hold.add(body);
      /* the cords it hangs by */
      [-1, 1].forEach((sx) => {
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(5, 40, 5),
          new THREE.MeshToonMaterial({ color: 0x3d3128, gradientMap: RAMP }));
        c2.position.set(sx * SW * 0.36, SH * 0.5 + 20, 0);
        root.add(c2);
      });
      const o = new THREE.Mesh(outlineGeom(board), outlineMaterial(3.2));
      o.frustumCulled = false;
      hold.add(o);
      /* lettered NOW, with the whole collection, so the tunnel is never a row of blank boards.
         A queue only changes the numbers on it. */
      const canvas = signCanvas();
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = backRenderer.capabilities.getMaxAnisotropy();
      /* THE FLICKER WAS Z-FIGHTING, NOT THE SHADER REBUILD. The face sat four tenths of a unit
         proud of a board seen from between 800 and 4,000 away, in a depth buffer stretched from 1
         to 60,000 — far below what it can resolve, so the two surfaces traded places from frame
         to frame. Two units of clearance and a polygon offset settle it outright.

         And it is OPAQUE now. `transparent: true` was there only so the dimming could be done
         with opacity, and it bought a per-frame depth sort and a second render pass for a surface
         that has no transparency in it at all. The dimming moves to the emissive, which is what
         is actually lighting these things in the dark. */
      const face = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshToonMaterial({
        map: tex, emissiveMap: tex, emissive: new THREE.Color(0x6a6459),
        gradientMap: RAMP,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      }));
      face.position.z = STH / 2 + 2;
      hold.add(face);
      /* raised, and stopped there. Nothing is readable until it is let down. */
      flip.rotation.x = -Math.PI / 2;
      /* the sign turns to meet you when you stop beside it, and sits back when you move on */
      /* the placard is the control. Picking one from across the corridor is how you navigate
         with the screen rather than with the keyboard, so it carries a transparent twin for
         focus and Enter exactly as the ema tablets do. */
      /* through the page's own dispatcher: a different placard is a move, this one is the way
         down to level four. (It used to call `walkGo` directly, which is a page function this
         module cannot see — the button threw on every activation and nobody noticed, because
         the raycast path is what a mouse actually exercises.) */
      const el = worldPickEl('', () => walkAct(k));
      el.classList.add('walk-pick');
      L3_SIGNS.push({ root, flip, hold, face, canvas, tex, el, idx: k, f: f2, sd });
    }
    _walk = {
      signs: L3_SIGNS,
      rows: L3_SLOTS,
      /* the decks never change, only the numbers the chosen queue puts against them */
      /* redraw one placard where it stands */
      write(k, tileJp) {
        const q = L3_REVIEW.queues[tileJp] || L3_REVIEW.queues['総復習'];
        const [jp2, en2] = L3_REVIEW.decks[k];
        const [n, pct] = q[k];
        drawSign(L3_SIGNS[k].canvas, jp2, en2, n, L3_REVIEW.unit, pct, SECTION_ACCENT.REVIEW[1]);
        L3_SIGNS[k].tex.needsUpdate = true;
        L3_SIGNS[k].el.textContent = `${en2} — ${jp2}, ${n} ${L3_REVIEW.unit}, ${pct}%`;
      },
      /* THE BOARD TURNS OVER AND COMES BACK LETTERED. Swapping the face in place meant watching a
         sign fill in, which is the one thing signage must never do — a sign is a thing that was
         already there. A full turn about its own horizontal axis hides the swap completely: the
         board is edge-on a quarter of the way round and its back is toward you for half of it, so
         the new face is simply what is there when it comes back. Staggered down the corridor,
         because a departure board turning over in sequence is the reference, and because six of
         them going at once is a flicker rather than an event. */
      /* THEY ARE LET DOWN, NOT SPUN. A board hung from a rail cannot turn a full circle, and
         watching six of them do it was the thing that read as a graphical fault rather than as a
         gesture. Raised, they sit at a quarter turn with their backs to the corridor — nothing
         readable, so the lettering happens up there unseen. Then each is let down onto its cords
         in sequence, and settles. It is the motion a hinged sign actually makes, and the swap it
         hides is now hidden by being ABOVE you rather than by being fast. */
      letter(tileJp, turn = true) {
        this.rows = Math.min(L3_SLOTS, L3_REVIEW.decks.length);
        L3_SIGNS.forEach((s2, k) => {
          if (k >= this.rows) return;
          this.write(k, tileJp);
          if (!turn) { s2.flip.rotation.x = -Math.PI / 2; return; }
          gsap.killTweensOf(s2.flip.rotation);
          s2.flip.rotation.x = -Math.PI / 2;
          gsap.to(s2.flip.rotation, {
            x: 0, duration: 1.05, delay: 0.12 + k * 0.13,
            ease: 'back.out(1.5)', overwrite: true,
          });
        });
      },
      /* and raised again on the way out, so the corridor is the same corridor you found */
      raise() {
        L3_SIGNS.forEach((s2, k) => {
          gsap.to(s2.flip.rotation, {
            x: -Math.PI / 2, duration: 0.6, delay: k * 0.05, ease: 'power2.in', overwrite: true,
          });
        });
      },
      /* a sign you have just chosen sways on its cords and settles — the whole of the feedback,
         because a hanging thing that has been touched is the only thing it could do */
      sway(k) {
        const s2 = L3_SIGNS[k];
        if (!s2) return;
        gsap.fromTo(s2.flip.rotation, { x: 0.2 },
          { x: 0, duration: 1.5, ease: 'elastic.out(1, 0.26)', overwrite: true });
      },
      /* stand short of the placard and look past it down the corridor, so the one you are reading
         is beside you and the rest of the walk is still ahead */
      /* 112 UNITS, NOT 200. The gate is 470 for a torii that would be nine metres, which puts a
         unit at about twenty millimetres — so the 182 the courtyard camera rides at is a viewer
         three and a half metres tall. Outdoors nobody notices; inside a corridor whose tie beams
         are at 242 it means the beams cross at eye level and there is no corridor to see down.
         112 is a shade over two metres and the tunnel opens up. */
      eyeAt: (s2) => { const v = AX.at(s2.f - L3_STAND, 0); v.y += 112; return v; },
      /* and they are lettered before anyone has ever been down here */
      tgtAt: (s2) => { const v = AX.at(s2.f + 620, s2.sd * 0.34); v.y += 150; return v; },
    };
    _walk.letter('総復習', false);
  }

  /* AND THE WALL. Small, and standing much nearer the camera than the gate does — that is the
     whole trick: perspective gives the tablets the frame they need while the gate stays the
     larger structure in the world. At 235 wide and 530 from the eye they read at 108px; the
     gate, 590 wide but 1,430 away, still towers over them.

     It is aimed at the camera's actual standing point, not at HOME_EYE. The eye is derived from
     the focus, so it has to be computed here rather than guessed — pointing the wall at the
     wrong place is what had it presenting its back. */
  const eye = standOff(_focus, 855, 182);
  /* FURTHER DOWN THE APPROACH THAN IT LOOKS. Aiming the camera at the gate swings anything
     standing beside the eye hard to the left, and at 490 units from a camera 855 short of its
     focus the wall was both the biggest thing in the frame and cut off by its edge. Moved along
     to -700 and in to -110 it is 600 away, its tablets still read at 80px, and its far edge
     clears the frame with room to spare. Distance is the right lever here: scale is not, because
     the wall's size relative to the gate is the one thing about it that must not move. */
  /* IT STANDS ON THE COURT, and that is the whole reason the court exists. Before there was one,
     the wall's floor had to be guessed from `groundAt` at its own station — 215 units off the
     axis, where the hillside has fallen far enough that a plinth referenced to it came out below
     a path referenced to the axis, which is why the plinth was invisible three builds running. A
     level platform replaces the guess with a number. */
  const wallPlace = at3(-690, -215);
  wallPlace.y = CY_TOP + WALL_LIFT;
  let CHOZUYA = null;
  const wall = buildEmaWall('REVIEW', wallPlace, eye, WALL_W, WALL_H);
  const wallGrp = wall.grp;
  /* and then turned toward the PATH, which is the direction the sign was wrong in before: the
     wall stands to the left of the axis, so facing the way in means turning its face to its own
     right and letting its left edge come forward. After `lookAt`, the group's local +X is the
     approach's `side` vector and a positive rotateY carries the face from the camera toward it,
     so the sign of this number is not a matter of taste — negative turns it out into the empty
     ground behind, which is exactly what it was doing.

     A board square to the camera is a poster; a board angled along the way in is something that
     was put there for people walking past it. 0.62 rad is about 36°, enough to read as addressed
     to the path while still showing the tablets nearly full width (cos 36° = 0.81). */
  wallGrp.rotateY(0.62);
  wall.pickGrp.rotateY(0.62);
  _marks.wall = wallGrp;
  /* THE FOUR TABLETS ARE THE INTERFACE, so they stay live over the baked wall — the bake
     carries the structure and the crowd, but a lettered canvas and a hover swing cannot be
     baked. The authored wall hangs four blank stand-ins about thirty units in FRONT of where
     these four rest, which buried the live ones behind them. The blanks are the artist's and
     they stay; the LIVE rack slides fifty-five units toward the eye instead, so the lettered
     four hang just proud of the blanks and the blanks read as the crowd behind them. */
  {
    const out = eye.clone().sub(wallPlace).setY(0).normalize();
    wall.pickGrp.position.addScaledVector(out, 55);
  }
  _live.push(wall.pickGrp);

  /* 手水舎 — the water pavilion, facing the wall across the court. A courtyard with one thing in
     it is a yard with a thing in it; the second structure is what makes the space between them
     read as a place. It is the shrine's own answer to what belongs there, it carries roughly the
     ema wall's mass so neither side wins, and it is open on all four sides so it never becomes a
     second board competing for the eye. */
  {
    /* BROUGHT FORWARD TO HOLD THE GROUND THE GUARDIANS LEFT. It sat at f -430 while they stood
       at -710, in front of it; with the pair moved up to the gate that near-right ground went
       empty again, so the pavilion takes it. At -660 it is 230 nearer the eye and reads about a
       fifth larger, which is what "compensate" has to mean when the thing you removed was the
       nearest object on that side.

       (The first version of this was much nearer still — side 258, 650 from the eye — where it
       out-massed the ema wall it is meant to answer and had its roof cut by the top edge. -660
       at side 300 is forward of that station in depth but well outboard of it, which keeps the
       roof clear and the mass matched.) */
    const ch = new THREE.Mesh(chozuyaGeo(178, 168, 238), new THREE.MeshToonMaterial({
      vertexColors: true, gradientMap: RAMP, flatShading: true,
    }));
    ch.position.copy(at3(-640, 310));
    ch.position.y = CY_TOP;
    facing(ch, -640, 0);
    backScene.add(ch);
    addOutline(ch, 3.2);
    CHOZUYA = ch;
    _marks.chozuya = ch;
  }

  /* ---- 狛犬 — the guardians, on the court in front of the pavilion ----
     STATION CHOSEN BY PROBE, NOT BY EYE. `NAV.probe` projects a whole grid of (f, sd) in one page
     load, so where a thing lands and how many pixels a world unit is worth there are both
     answered before anything is built rather than after it is looked at.

     The pair sits at the near edge of the court because that is where a pair belongs: they mark
     the point where the approach becomes the precinct, and the camera happens to stand just short
     of it.

     AT THE GATE, WHICH IS WHERE A PAIR ACTUALLY STANDS. Out on the near court they were the
     largest thing on that side and they crowded the pavilion they were supposed to be beside.
     A komainu pair marks a threshold; the threshold here is the torii, and at f -200 they sit on
     the last of the concrete just short of it, one outside each pillar. Being 500 further off
     they come down to about two thirds of the size they had, which is the point — they stop
     competing with the buildings and start belonging to the gate.

     Facing straight down the approach. The three-quarter turn earned its keep when they were the
     near object and you passed between them; from the gate they are seen head-on from the axis,
     and a pair square to the way in is what reads as a gate being guarded. */
  {
    [[250, true], [-250, false]].forEach(([sd, open]) => {
      const m = new THREE.Mesh(komainuGeo(175, open), new THREE.MeshToonMaterial({
        vertexColors: true, gradientMap: RAMP, flatShading: true,
      }));
      m.position.copy(at3(-200, sd));
      m.position.y = CY_TOP;
      facing(m, -3000, sd);
      backScene.add(m);
      addOutline(m, 3.2);
      if (sd > 0) _marks.komainu = m;
    });
  }

  /* OUTSIDE THE COURT, WHICH IS WHY IT IS NOT SET TO CY_TOP. `onCourt` only tests f — it knows
     nothing about how far across the court reaches — so out here the platform has run out and
     asking for its height would leave the tree standing on air. It takes the hillside, like the
     wood it belongs to.

     PAST THE PAVILION AND WELL OUTBOARD OF IT. The first placement put it at f -150, sd 560,
     which is nearer the eye than the pavilion is: the trunk went behind the roof, the crown ran
     off the top of the frame, and what was left was a green mass in the corner with a scatter of
     white papers under it and nothing holding them up. A landmark has to be far enough away to
     be seen whole — the trunk is most of what says "tree", and it is the first thing a near
     placement loses.

     AT THE FAR END, BEHIND THE HALL. Four stations on the right of the court taught the same
     lesson — the pavilion owns that side and everything put near it ends up behind it — but the
     real problem was that the tunnel had nothing to arrive at. Twenty-six gates converging on a
     pale wash is a corridor to nowhere, and the hall standing there is 520 tall against a tunnel
     404 tall, so it never clears the last few bays.

     AND IT IS THE REWARD FOR WALKING, NOT A MARK ON THE HORIZON. Three stations at the far end
     were probed before this was clear: from the standing point the tunnel's far opening is 54
     pixels wide, and a trunk in it is 25 pixels of dark among the darks of twenty-six sets of
     posts. Nothing shaped survives that distance — which is why the hall is what changed colour
     and the tree is what moved BACK. Set behind and outboard of the hall it is hidden at the
     start and rises over the roof as the walk closes on it.

     It also stops fighting the pavilion for the right of the frame, which is the second thing
     that side did not need. */
  {
    const t = shinbokuGeo(1250);
    const m = new THREE.Mesh(t, new THREE.MeshToonMaterial({
      vertexColors: true, gradientMap: RAMP, flatShading: true,
    }));
    m.position.copy(at3(TUN_END + 1320, 300, -12));
    m.rotation.y = 2.1;
    backScene.add(m);
    addOutline(m, 3.2);
    _marks.tree = m;
    /* claim it in the global wood registry too, or the valley's own planting grows through it */
    treeClaim(m.position.x, m.position.z, 480);
  }

  /* ---- 手水 — the one thing here you can touch ----
     A place you can only look at is a diorama. The basin is the obvious candidate: it is the one
     object in the courtyard whose whole purpose is to be used, it is on the side away from the
     interface so playing with it cannot be mistaken for choosing something, and water is the only
     material in the scene that is supposed to move.

     Everything is allocated once and rests at zero scale — the rule that nothing in this world
     appears or vanishes applies to effects too; what an effect may do is start and finish. */
  {
    const at2 = at3(-640, 310);
    const cx = at2.x, cz = at2.z, cy = CY_TOP + 238 * 0.235;
    const ripples = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(1, 1.16, 40), new THREE.MeshBasicMaterial({
        color: 0xd8ecf0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, cy + 1.5, cz);
      m.scale.setScalar(0.01);
      backScene.add(m);
      _noReflect.push(m);
      return m;
    });
    const dropGeo = new THREE.IcosahedronGeometry(3.4, 0);
    const dropMat = new THREE.MeshToonMaterial({ color: 0xbfe0e6, emissive: 0x5d8b93, gradientMap: RAMP, flatShading: true });
    const drops = Array.from({ length: 14 }, () => {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.position.set(cx, cy, cz);
      m.scale.setScalar(0);
      backScene.add(m);
      _noReflect.push(m);
      return m;
    });
    const hitMat2 = new THREE.MeshBasicMaterial();
    hitMat2.visible = false;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(120, 86, 116), hitMat2);
    hit.position.set(cx, cy - 18, cz);
    backScene.add(hit);
    _ambient.push({
      hit,
      /* three rings leaving at a stagger, and a scatter of drops thrown up and pulled back —
         a stone into water, which is what a ladle sounds like when you cannot hear it */
      go() {
        ripples.forEach((m, i) => {
          gsap.killTweensOf([m.scale, m.material]);
          m.scale.setScalar(0.01);
          gsap.to(m.scale, { x: 46 + i * 16, y: 46 + i * 16, z: 46 + i * 16,
            duration: 1.5 + i * 0.25, delay: i * 0.16, ease: 'power2.out', overwrite: true });
          gsap.fromTo(m.material, { opacity: 0.62 - i * 0.13 },
            { opacity: 0, duration: 1.5 + i * 0.25, delay: i * 0.16, ease: 'power1.in', overwrite: true });
        });
        drops.forEach((m, i) => {
          const a = hash01(i, 907) * 6.283, r = 12 + hash01(i, 911) * 26;
          const up = 46 + hash01(i, 919) * 54, t = 0.62 + hash01(i, 929) * 0.34;
          gsap.killTweensOf([m.position, m.scale]);
          m.position.set(cx, cy, cz);
          m.scale.setScalar(0.55 + hash01(i, 937) * 0.7);
          gsap.to(m.position, { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r,
            duration: t, ease: 'power1.out', overwrite: true });
          gsap.timeline({ overwrite: true })
            .to(m.position, { y: cy + up, duration: t * 0.42, ease: 'power2.out' })
            .to(m.position, { y: cy - 4, duration: t * 0.58, ease: 'power2.in' })
            .to(m.scale, { x: 0, y: 0, z: 0, duration: 0.14 }, '>-0.1');
        });
      },
    });
  }

  /* ---- the name-board, in three places ----
     Only one is built. Each is sized and mounted against the structure it belongs to rather than
     to a common number, because a board that fits the gate does not fit the pavilion's gable and
     a board sized to be readable from the standing point is not a board at all — it is a poster
     leaning on a shrine. */
  {
    /* On the gakuzuka — the short strut between the tie beam and the lintel. Sized to sit inside
       that opening with the gate's own timber showing round it on all four sides: a board that
       fills the gap reads as a panel let into the structure, and the thing that makes it a hung
       board is the margin. */
    const b = hengaku('復習', 'REVIEW', GATE_H * 0.365, GATE_H * 0.237);
    b.position.copy(at3(0, 0));
    b.position.y += GATE_H * 0.705;
    b.rotation.y = gate.rotation.y;
    b.translateZ(GATE_H * 0.055);
    backScene.add(b);
    _title = b;
  }

  /* ---- planting ----
     The corridor blockers strip the wood out of a 1,500-unit band and leave a lawn, and a lawn
     reads as a golf course. The first attempt at putting it back failed on two counts, both
     visible in one glance: it was too THIN — 184 shrubs over four and a half thousand units of
     approach is one every 160 units, which is dotting rather than planting — and it was
     UNIFORMLY RANDOM, which is the one distribution that never occurs outdoors. Undergrowth
     grows in clumps, around whatever seeded it.

     So: clumps. A handful of centres per species, members packed around each with a sqrt falloff
     so they crowd toward the middle, and enough of them that the ground between the paving and
     the treeline is covered. Density can then vary freely without any of it wandering onto the
     approach, because the corridor is a keep-out stated in the same approach coordinates as
     everything else. Anything landing inside it is REFLECTED back out rather than dropped —
     dropping thins the very edge you most want planted, which is the join between the clearing
     and the wood. */
  {
    /* clear of the paving (180) and of the gates' footings, whose outer edge is at 236. It used
       to have to clear the LANTERNS too, at 250 with a 45-unit base, which pushed the first bush
       130 units out into mown grass — the spacing registry knows where the lanterns are now, so
       the verge only has to answer for the things that are not in it. */
    const VERGE = 260;
    /* and the hall, whose plinth is 713 wide — wider than the corridor it stands at the end of */
    const KEEP = [[TUN_END + 700, 0, 560]];
    /* the court is a rectangle, not a disc, so it gets its own clause: inside its length nothing
       plants closer than its edge plus a verge */
    const clear = (f2, sd) => {
      const min = f2 > CY.f0 - 120 && f2 < CY.f1 + 120 ? CY.half + 90 : VERGE;
      let t = Math.abs(sd) < min ? Math.sign(sd || 1) * (2 * min - Math.abs(sd)) : sd;
      for (let k = 0; k < KEEP.length; k++) {
        const dx = f2 - KEEP[k][0], dz = t - KEEP[k][1], d = Math.hypot(dx, dz) || 1;
        if (d < KEEP[k][2]) { const m = KEEP[k][2] / d; f2 = KEEP[k][0] + dx * m; t = KEEP[k][1] + dz * m; }
      }
      return [f2, t];
    };
    /* one clump member: `n` centres drawn off the seed, then a point around the chosen centre.
       `a` is the attempt number — it re-rolls the offset within the clump WITHOUT changing which
       clump this one belongs to, so a rejected position is retried nearby rather than thrown
       across the map. */
    const clump = (i, a, seed, n, fLo, fHi, sLo, sHi, rad) => {
      const c = i % n;
      const cf = fLo + hash01(c, 101 + seed) * (fHi - fLo);
      const cs = (hash01(c, 113 + seed) < 0.5 ? -1 : 1) * (sLo + hash01(c, 127 + seed) * (sHi - sLo));
      const j = i + a * 977;
      const ang = hash01(j, 151 + seed) * 6.283;
      const r = Math.sqrt(hash01(j, 163 + seed)) * rad;
      return clear(cf + Math.cos(ang) * r, cs + Math.sin(ang) * r);
    };

    /* ---- spacing ----
       Clumping got the DISTRIBUTION right and said nothing about whether two plants may occupy
       the same ground — so at a hundred and eighty units per bush they simply grew through one
       another, and at this camera distance an intersection is not a texture, it is a fault.

       Every plant registers a footprint and every candidate is tested against the ones already
       standing. Two radii, not one, because clipping is a question about height as much as about
       plan: a bush beside a cedar is a bush at the foot of a cedar, which is correct and normal,
       while two canopies at the same height are a graft. `rLo` is what occupies the ground, `rHi`
       what occupies the air; a shrub has no `rHi` at all, so it is free to sit under anything.

       Rejected candidates are retried within their own clump a dozen times and then given up on.
       A gap where a clump has run out of room is the honest outcome — the alternative is exactly
       the intersection this exists to prevent. */
    const PLANTED = [];
    const fits = (f2, sd, rLo, rHi) => {
      for (let k = 0; k < PLANTED.length; k++) {
        const q = PLANTED[k];
        const d = Math.hypot(f2 - q[0], sd - q[1]);
        if (d < rLo + q[2]) return false;
        if (rHi > 0 && q[3] > 0 && d < rHi + q[3]) return false;
      }
      return true;
    };
    const grow = (i, seed, n, fLo, fHi, sLo, sHi, rad, rLo, rHi) => {
      for (let a = 0; a < 12; a++) {
        const q = clump(i, a, seed, n, fLo, fHi, sLo, sHi, rad);
        if (fits(q[0], q[1], rLo, rHi)) { PLANTED.push([q[0], q[1], rLo, rHi]); return q; }
      }
      return null;
    };
    /* the built things go in first, so nothing can grow through them either */
    PLANTED.push([-690, -215, 155, 155]);   /* the ema wall */
    PLANTED.push([-640, 310, 150, 150]);    /* the water pavilion */
    PLANTED.push([TUN_END + 1320, 300, 380, 480]);  /* the sacred tree, canopy and all */
    PLANTED.push([-200, 250, 95, 95]);      /* the guardians */
    PLANTED.push([-200, -250, 95, 95]);
    PLANTED.push([-2100, 0, 340, 340]);     /* the outer gate */
    [[-1240, 402], [-1240, -402], [-260, 402], [-260, -402], [420, 250], [420, -250]]
      .forEach(([lf, ls]) => PLANTED.push([lf, ls, 78, 78]));

    /* THE TREES GO DOWN FIRST. They are fewer, larger, and their placement is what the eye reads
       as the shape of the clearing; letting six hundred bushes take the ground first and then
       asking a cedar to find a gap gets that backwards. Instanced with a shared outline twin like
       the rest of the wood, so the whole treeline is four draw calls. */
    const woodM = () => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP, flatShading: true });
    instanced(broadleafGeo(), woodM(), 96, (i) => {
      const k = 1.0 + hash01(i, 19) * 0.5;
      const q = grow(i, 211, 22, -1100, 8700, 520, 1300, 340, 34 * k, 128 * k);
      if (!q) return null;
      const w = at3(q[0], q[1]);
      treeClaim(w.x, w.z, 132 * k);
      return { pos: at3(q[0], q[1], -14), rot: hash01(i, 7) * 6.28, scale: new THREE.Vector3(k, k, k) };
    }, 2.4);
    /* cedars are 480 tall and the camera stands at f -1290, so they start well forward of it:
       a stand of them beside the eye would be a wall across the frame rather than a treeline */
    instanced(cedarGeo(), woodM(), 92, (i) => {
      const k = 0.85 + hash01(i, 23) * 0.5;
      const q = grow(i, 307, 20, -300, 8800, 640, 1500, 360, 28 * k, 62 * k);
      if (!q) return null;
      const w = at3(q[0], q[1]);
      treeClaim(w.x, w.z, 64 * k);
      return { pos: at3(q[0], q[1], -14), rot: hash01(i, 29) * 6.28, scale: new THREE.Vector3(k, k, k) };
    }, 2.1);
    /* the undergrowth: five bands, low and near the path through to tall and back at the
       treeline, so the planting has a section rather than being one height everywhere. The first
       is deliberately tiny and numerous — the strip between the paving and the first bushes was
       130 units of mown lawn, which is the thing this whole block exists to get rid of.

       Nothing goes past 730 out: that is where the corridor blockers stop clearing the valley's
       own wood, and a bush placed beyond it is a bush placed where a cedar the shrine has never
       heard of is about to stand. */
    const shrubGeo = new THREE.IcosahedronGeometry(46, 1);
    shrubGeo.scale(1.25, 0.82, 1.1);
    /* THE ANSWER TO A THIN RESULT IS MORE CANDIDATES, NOT LOOSER SPACING. Once a rejection can
       only ever cost a gap, throwing twice as many at the ground is free of risk and fills it;
       slackening the radius to force them in would put the intersections straight back. The
       `sep` column is a per-band radius multiplier. It was 0.72 for the ground cover on the
       theory that a carpet of small leaf masses may knit; measuring it said otherwise — an
       audit of the shrine's own ground found eighty-six intersections and every one of them was
       two of these, up to 85% of a radius deep, which is not knitting, it is one mound inside
       another. Held just under 1.0 they touch and stop, and the density that costs is bought
       back with more candidates instead. */
    /* AND THE RANGES GO TO THE END OF THE TUNNEL. They stopped at 4,300 because that is where
       the world stopped when they were written; the tunnel now runs to 7,340 and the hall to
       8,040, so the last third of the walk was down a corridor with mown grass either side. The
       counts go up with the length — the density is what was right, not the number. */
    [[0x4d6338, 260, 520, 0.24, 0.62, 760, 44, 250, 0.95], [0x40592f, 300, 700, 0.5, 1.25, 400, 28, 340, 0.95],
      [0x4c6636, 360, 730, 0.55, 1.3, 400, 28, 340, 0.95],
      [0x37502b, 430, 730, 0.85, 1.7, 380, 28, 340, 1.0], [0x556f3c, 470, 730, 0.9, 1.8, 380, 28, 340, 1.0]]
      .forEach(([c, sLo, sHi, kLo, kHi, n, cl, rad, sep], t) => {
        const m = new THREE.MeshToonMaterial({ color: c, gradientMap: RAMP, flatShading: true });
        _noReflect.push(instanced(shrubGeo, m, n, (i) => {
          const k = kLo + hash01(i, 41 + t) * (kHi - kLo);
          const q = grow(i, t * 17, cl, -2000, 8700, sLo, sHi, rad, 56 * k * sep, 0);
          if (!q) return null;
          return {
            pos: at3(q[0], q[1], -6),
            rot: hash01(i, 53 + t) * 6.28,
            scale: new THREE.Vector3(k, k * (0.62 + hash01(i, 67 + t) * 0.5), k),
          };
        }));
      });
  }

  /* a clearing the shape of the thing it clears — a line along the axis, and a second down the
     wall's side, because the corridor is measured from the axis while the wall stands off it */
  /* 1000, not 760: at 760 the valley's wood resumed 585 out from the axis, which is inside the
     band the shrine plants — so the two were placing trees into each other with neither aware of
     the other. The corridor now clears to 769 and the shrine owns everything inside that. */
  for (let k = -1700; k <= TUN_END + 900; k += 320) {
    const q = at3(k, 0);
    blockAdd(q.x, q.z, 1000, 520);
  }
  for (let k = -900; k <= -100; k += 220) {
    const q = at3(k, -560);
    blockAdd(q.x, q.z, 460, 520);
  }
}

/* 灯籠 — a stone lantern. Small, repeated, and the thing that turns a path into an approach. */
function lanternGeo(H) {
  const parts = [];
  const S = 0x77736a, D = 0x625f57;
  const add = (g, c) => parts.push({ geo: g, color: c });
  /* every section overlaps its neighbour rather than meeting it. Butt-jointed low-poly parts
     show a seam wherever the silhouettes disagree, and a stone lantern is stacked masonry —
     overlap is what it actually looks like. Segment counts match (8 for the round parts, 6 for
     the box and its roof) so the facets line up instead of interleaving. */
  let g = new THREE.CylinderGeometry(H * 0.19, H * 0.235, H * 0.12, 8); g.translate(0, H * 0.055, 0); add(g, D);
  g = new THREE.CylinderGeometry(H * 0.08, H * 0.095, H * 0.46, 8); g.translate(0, H * 0.32, 0); add(g, S);
  g = new THREE.CylinderGeometry(H * 0.175, H * 0.145, H * 0.09, 8); g.translate(0, H * 0.55, 0); add(g, D);
  g = new THREE.CylinderGeometry(H * 0.15, H * 0.15, H * 0.22, 6); g.translate(0, H * 0.68, 0); add(g, 0xe8d9b4);
  g = new THREE.CylinderGeometry(H * 0.03, H * 0.27, H * 0.17, 6); g.translate(0, H * 0.855, 0); add(g, D);
  g = new THREE.SphereGeometry(H * 0.055, 6, 4); g.translate(0, H * 0.955, 0); add(g, S);
  return mergeParts(parts);
}
/* 御神木 — the sacred tree, and the only thing on this side of the court that is alive.
   The right of the precinct had the water pavilion, which is low and wide, and a treeline behind
   it, which is scenery: mass at knee height and nothing above it. What that side wants is not
   more furniture — there are already lanterns over there, and they are hidden behind the pavilion
   for exactly the reason the side reads as empty. It wants the thing a shrine is usually built
   around.

   IT IS A BROADLEAF AMONG CEDARS ON PURPOSE. A bigger cedar in a cedar wood is a bigger cedar. A
   different crown at half again the height reads as the one that was left standing, which is what
   makes a tree a shrine tree — and the rope and the low fence are only the shrine agreeing.

   Tree, rope, papers and fence are one merged geometry, so the whole thing is one draw call and
   one outline that wraps the lot instead of six that can drift apart. */
function shinbokuGeo(H) {
  const parts = [];
  const add = (g, c) => parts.push({ geo: g, color: c });
  const BARK = 0x4b3a2c, BARK2 = 0x574334;
  let g;
  /* the root flare and two trunk sections. An old tree thickens toward the ground; one evenly
     tapered cylinder is a telegraph pole however tall you make it. */
  g = new THREE.CylinderGeometry(H * 0.072, H * 0.125, H * 0.10, 9); g.translate(0, H * 0.05, 0); add(g, BARK);
  g = new THREE.CylinderGeometry(H * 0.050, H * 0.076, H * 0.30, 9); g.translate(0, H * 0.24, 0); add(g, BARK2);
  g = new THREE.CylinderGeometry(H * 0.034, H * 0.053, H * 0.24, 9); g.translate(0, H * 0.50, 0); add(g, BARK);
  /* two limbs, built from the base so they start inside the wood rather than beside it */
  [[0.62, H * 0.48, H * 0.30], [-0.52, H * 0.56, H * 0.26]].forEach(([rz, atY, len]) => {
    const b = new THREE.CylinderGeometry(H * 0.014, H * 0.030, len, 6);
    b.translate(0, len / 2, 0); b.rotateZ(rz); b.translate(0, atY, 0);
    add(b, BARK2);
  });
  /* five canopy masses, none of them centred on the trunk */
  /* THE CANOPY IS THE REASON IT COULD NOT BE SEEN, AND IT IS NOT A PLACEMENT PROBLEM.
     Its first five colours were 0x4c6a30, 0x415c2a, 0x577535, 0x466428, 0x50702f — which are, to
     within a few points each, the four colours of the ordinary broadleaves in the wood behind it.
     A tree the same green as a wall of trees is invisible however large it is and wherever it
     stands, and the geometry proves there is nowhere else to put it: the pavilion occupies
     x 1205..1801 of a 1920 frame, and a crown far enough right to clear it and still fit inside
     the frame edge works out at under a hundred pixels across. Colour is the only lever left, and
     it is the right one anyway — an old tree kept when the wood round it was cleared IS a
     different tree. Yellow-gold catching the last of the light, which also answers the placard. */
  [[0, 0.80, 0, 0.250, 0x9aa347], [-0.20, 0.70, 0.08, 0.190, 0x8b9440], [0.22, 0.72, -0.07, 0.180, 0xa8ae53],
    [0.03, 0.94, -0.04, 0.150, 0x7f8a3a], [-0.10, 0.86, -0.13, 0.130, 0x969e46]]
    .forEach(([x, y, z, r, c]) => {
      const b = new THREE.IcosahedronGeometry(H * r, 1);
      b.scale(1.14, 0.88, 1.05);
      b.translate(H * x, H * y, H * z);
      add(b, c);
    });
  /* 注連縄 — the rope. Twelve-sided rather than round: everything else here is faceted, and a
     smooth torus in a flat-shaded scene reads as a different material, not a different object. */
  const ropeY = H * 0.30, ropeR = H * 0.088;
  g = new THREE.TorusGeometry(ropeR, H * 0.022, 5, 12);
  g.rotateX(Math.PI / 2); g.translate(0, ropeY, 0); add(g, 0xd6c69a);
  /* 紙垂 — the papers. Three, not five, and narrow rather than square.

     THE WATER PAVILION IS OPEN ON EVERY SIDE, so everything behind it shows THROUGH it. Five
     zigzags ringing the trunk, each a stack of square white blobs, read through that opening as
     litter blowing about inside the bay — the one place in the scene where a bright small thing
     is guaranteed to be seen against shade. Three at 120° puts one facing the approach and turns
     the others edge-on, which is what a rope with papers on it actually looks like from any
     single viewpoint, and a strip clearly taller than it is wide reads as one hanging thing
     instead of as three dots. */
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const cx = Math.cos(a) * ropeR, cz = Math.sin(a) * ropeR;
    const ox = -Math.sin(a), oz = Math.cos(a);
    for (let k = 0; k < 3; k++) {
      g = new THREE.BoxGeometry(H * 0.021, H * 0.036, H * 0.006);
      g.rotateY(-a);
      g.translate(cx + Math.cos(a) * H * 0.004 + ox * (k % 2 ? 1 : -1) * H * 0.010,
        ropeY - H * 0.042 - k * H * 0.030, cz + Math.sin(a) * H * 0.004 + oz * (k % 2 ? 1 : -1) * H * 0.010);
      add(g, k === 0 ? 0xf2ece0 : 0xe6dccb);
    }
  }
  /* 瑞垣 — the low fence that makes the ground round the trunk somewhere you do not walk */
  const fenceR = H * 0.30;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g = new THREE.BoxGeometry(H * 0.018, H * 0.115, H * 0.018);
    g.rotateY(-a);
    g.translate(Math.cos(a) * fenceR, H * 0.055, Math.sin(a) * fenceR);
    add(g, 0x7d6a4e);
  }
  g = new THREE.TorusGeometry(fenceR, H * 0.010, 4, 12);
  g.rotateX(Math.PI / 2); g.translate(0, H * 0.104, 0); add(g, 0x6d5c42);
  return mergeParts(parts);
}
/* 狛犬 — the guardian pair, seated on plinths at the front of the court.
   The right of the precinct kept reading as empty, and the two things put there to fix it both
   failed the same way: the lanterns and then the sacred tree were both BEHIND the water pavilion,
   which is a wide low building sitting across that whole side. Anything behind it is either
   hidden or, in the tree's case, reduced to a green crown in a frame edged with green crowns.
   What the side needs is something in FRONT of the pavilion, standing on the court where nothing
   can occlude it, built rather than grown, and pale rather than green so it cannot be mistaken
   for more treeline.

   A komainu is also the only thing in this scene with a FACE. Everything else here is
   architecture — beams, boards, roofs, a tunnel — and a creature reads differently at a glance
   from any amount of joinery.

   `open` is 阿 and 吽: the right-hand one's mouth is open, the left-hand one's is shut. It is a
   detail nobody has to notice, and it is the reason there are two of them rather than one. */
function komainuGeo(T, open) {
  const parts = [];
  const add = (g, c) => parts.push({ geo: g, color: c });
  const STONE = 0x968f80, STONE2 = 0x878071, PLINTH = 0x6f6a5e, PLINTH2 = 0x625d53;
  const PH = T * 0.30, S = T * 0.70;
  /* the plinth first: two courses, the lower one proud, so it reads as set rather than dropped */
  let g = new THREE.BoxGeometry(S * 0.80, PH * 0.30, S * 0.90); g.translate(0, PH * 0.15, 0); add(g, PLINTH2);
  g = new THREE.BoxGeometry(S * 0.66, PH * 0.72, S * 0.76); g.translate(0, PH * 0.64, 0); add(g, PLINTH);
  /* everything above is in statue units, lifted onto the plinth */
  const at = (geo, x, y, z, c) => { geo.translate(S * x, PH + S * y, S * z); add(geo, c); };
  const blob = (r, det = 1) => new THREE.IcosahedronGeometry(S * r, det);
  /* haunches at the back, chest at the front — a seated animal is two masses, not one */
  let b = blob(0.26); b.scale(1.00, 0.95, 1.15); at(b, 0, 0.28, -0.16, STONE);
  b = blob(0.22); b.scale(1.02, 1.18, 0.92); at(b, 0, 0.44, 0.09, STONE);
  /* front legs standing straight down, rear paws tucked */
  for (const sx of [-1, 1]) {
    at(new THREE.BoxGeometry(S * 0.095, S * 0.42, S * 0.11), sx * 0.135, 0.21, 0.20, STONE2);
    at(new THREE.BoxGeometry(S * 0.115, S * 0.075, S * 0.18), sx * 0.135, 0.037, 0.255, STONE);
    at(new THREE.BoxGeometry(S * 0.13, S * 0.09, S * 0.15), sx * 0.185, 0.045, -0.10, STONE2);
  }
  /* neck, head, muzzle */
  at(new THREE.BoxGeometry(S * 0.17, S * 0.15, S * 0.15), 0, 0.60, 0.13, STONE2);
  b = blob(0.16); b.scale(1.00, 0.94, 1.06); at(b, 0, 0.73, 0.17, STONE);
  at(new THREE.BoxGeometry(S * 0.115, S * 0.095, S * 0.13), 0, 0.695, 0.29, STONE2);
  if (open) at(new THREE.BoxGeometry(S * 0.075, S * 0.035, S * 0.05), 0, 0.672, 0.335, 0x3a352d);
  for (const sx of [-1, 1]) {
    at(new THREE.BoxGeometry(S * 0.05, S * 0.075, S * 0.045), sx * 0.105, 0.855, 0.13, STONE2);
  }
  /* the mane, four lumps round the skull — this is most of what says lion rather than dog */
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5;
    b = blob(0.085, 0);
    at(b, Math.cos(a) * 0.185, 0.72 + Math.sin(a) * 0.10, 0.04, i % 2 ? STONE : STONE2);
  }
  /* the tail, standing up behind like a flame */
  [[0.52, -0.30, 0.105], [0.70, -0.345, 0.095], [0.86, -0.315, 0.075]].forEach(([y, z, r], i) => {
    at(blob(r, 0), 0, y, z, i % 2 ? STONE2 : STONE);
  });
  return mergeParts(parts);
}
/* 手水舎 — the water pavilion: a roof on four posts over a stone basin, open on every side. The
   openness is the point. It has to hold its half of the court against the ema wall without
   becoming a second board, and a structure you can see straight through does that — it has mass
   in silhouette and none in the middle of the frame. */
function chozuyaGeo(W, D, H) {
  const parts = [];
  const add = (g, c) => parts.push({ geo: g, color: c });
  /* the stone footing, matching the wall's opposite */
  let g = new THREE.BoxGeometry(W * 1.14, H * 0.07, D * 1.14); g.translate(0, H * 0.035, 0); add(g, 0x6b6459);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g = new THREE.CylinderGeometry(W * 0.036, W * 0.044, H * 0.60, 7);
    g.translate(sx * W * 0.43, H * 0.37, sz * D * 0.43); add(g, 0x54422f);
  }
  /* the tie beams, both ways, so the four posts read as a frame rather than as four sticks */
  add(beamSeg(W * 1.0, H * 0.045, D * 0.055, 0, H * 0.63, 0), 0x46372a);
  g = new THREE.BoxGeometry(W * 0.055, H * 0.045, D * 1.0); g.translate(0, H * 0.63, 0); add(g, 0x46372a);
  /* two slopes and a ridge — the same roof the hall has, at a quarter the size */
  for (const sx of [-1, 1]) {
    g = new THREE.BoxGeometry(W * 0.82, H * 0.055, D * 1.42);
    g.rotateZ(-sx * 0.46); g.translate(sx * W * 0.35, H * 0.80, 0); add(g, 0x3b332a);
  }
  g = new THREE.BoxGeometry(W * 0.075, H * 0.06, D * 1.42); g.translate(0, H * 0.96, 0); add(g, 0x332c25);
  /* the basin, and the water in it — the one bright thing under all that shade */
  g = new THREE.BoxGeometry(W * 0.5, H * 0.17, D * 0.5); g.translate(0, H * 0.15, 0); add(g, 0x6f6960);
  g = new THREE.BoxGeometry(W * 0.4, H * 0.02, D * 0.4); g.translate(0, H * 0.235, 0); add(g, 0x9dbfc2);
  return mergeParts(parts);
}
/* The 本殿-colour note lives with the hall build now — see LEVEL FOUR above. The old
   `shrineHallGeo` (a closed box costume) went with it: the hall is a room, and a room cannot be
   a single merged solid because its doors move and its light changes. */

  return {
    probe: _probe, focus: _focus, walk: _walk, title: _title, l4: _l4,
    marks: _marks, ambient: _ambient, noReflect: _noReflect,
    live: _live,
  };
}
