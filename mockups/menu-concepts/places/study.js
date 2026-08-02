/* ===================== STUDY — 楼閣, the pavilion on the west shore =====================
   STEP ZERO: A STAND-IN, NOT THE BUILDING. Everything here is boxes, and that is the point.
   Two of the previous session's expensive failures were "build it, then look at it" — a sacred
   tree modelled in full and then discovered to be behind the water pavilion, and four separate
   attempts at the tunnel's far end aimed at a window nothing was ever visible through. Both cost
   what they cost because the question ("can this be seen from where the camera stands?") was
   asked after the geometry existed rather than before.

   So the massing goes up first, in the intended size and proportions, and the three numbers that
   decide the shot — `stand`, `eyeLift` and where the camera looks — get settled against it while
   changing them is free. Step one replaces these boxes with the real pavilion at whatever
   dimensions this pass leaves behind.

   Every part is a separately named mesh rather than one merged geometry, which is also
   deliberate and also temporary: `NAV.hit` reports the name of what a ray struck, so "is the
   ground storey's veranda visible from the arrival camera, or has the eave above swallowed it?"
   is a question with a one-word answer. Step one merges each storey into a single draw call. */
import * as THREE from 'three';

export function buildStudy(ctx) {
  const {
    DEST_SPECS, HOME_EYE, LAKE_Y, MARKS, PROBE, RAMP,
    addOutline, backScene, blockAdd, destPlace, groundAt, treeClaim,
  } = ctx;

  /* ---- the site, and its own coordinates ----
     Same (f, sd) frame REVIEW uses: f down the axis away from home, sd across it, positive to
     the right. Saying "the near-left corner of the veranda" in world x and z means something
     different at every bearing, and that is what had the shrine's wall and gate growing through
     one another for three attempts.

     The bearing is READ from the spec rather than repeated here. Written out twice it is two
     numbers that have to be kept equal by hand, and the one thing this file changed during step
     zero was exactly that number. */
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

  /* ---- the massing ----
     Sized against the landscape rather than against a metre. A near cedar is a 478-unit model at
     0.85–2.8, so the wood stands 400–1,340; the shrine's main hall is 780 and reads as a
     one-storey building. A three-storey pavilion that is both a landmark from the menu and the
     container for two levels of interface wants to sit at the top of that range without leaving
     it — 1,040 to the ridge. */
  const SP = 250;                     /* floor to floor */
  const BASE_H = 90;                  /* the stone base, above the platform line */
  const DECK = 110;                   /* how far the veranda steps out past the wall */
  const DECK_T = 24, EAVE_T = 34;
  /* each storey draws in, which is what stops a stack of boxes reading as a stack of boxes:
     width, depth, wall height, eave oversail. THE OVERSAIL HAS TO TAPER TOO — the first pass
     drew the walls in but held the eave at 190 throughout, so the three eaves came out 1000,
     940 and 870 wide and the silhouette read as a stack of identical trays. The eave is the
     only part of a storey with a hard edge against the sky, so it is the part that carries the
     taper, and holding it constant cancels the taper everywhere it could have been seen. */
  const CORE = [[640, 540, 200, 195], [540, 450, 185, 165], [430, 350, 170, 135]];
  const ROOF_H = 200, ROOF_R = 560;   /* four-sided hip; the radius is the half-diagonal */
  /* TURNED OFF THE SIGHT LINE. Square-on, a building is a facade and the level-two veranda is a
     line of bays seen edge-first. At 17° you get the front and one flank, which is the oblique
     the veranda needs to be legible — and it widens the silhouette, so it is a framing question
     too, which is why it is set before the frame is measured rather than after. */
  const YAW = 0.30;

  /* THE PLATFORM IS LEVEL AND THE SHORE IS NOT. Same rule the shrine's court had to learn: a
     footprint set to the average of the ground under it comes out buried at the high end. This
     takes the highest point it covers — over water, the water counts as the ground, since a
     pavilion at the lake's edge stands ON the lake rather than on its bed 330 units down. */
  const HALF_F = 560, HALF_S = 620;
  let TOP = -Infinity, LOW = Infinity, WET = 0, N = 0;
  for (let f = -HALF_F; f <= HALF_F; f += 80) {
    for (let sd = -HALF_S; sd <= HALF_S; sd += 80) {
      const y = at3(f, sd).y;
      TOP = Math.max(TOP, Math.max(y, LAKE_Y));
      LOW = Math.min(LOW, y);
      if (y < LAKE_Y) WET++;
      N++;
    }
  }
  /* what the ground under the footprint is doing, for the step-zero report */
  const SITE = { top: Math.round(TOP), low: Math.round(LOW), fall: Math.round(TOP - LOW), wet: +(WET / N).toFixed(2) };

  const grp = new THREE.Group();
  const foot = at3(0, 0);
  grp.position.set(foot.x, TOP, foot.z);
  /* a plain Object3D points its LOCAL +Z at the lookAt target (a camera points -Z), so after
     this local +Z is "toward home" and local +X is the veranda's run */
  grp.lookAt(HOME_EYE.x, TOP, HOME_EYE.z);
  grp.rotateY(YAW);
  backScene.add(grp);

  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP, flatShading: true });
  const STONE = 0x6f6a63, TIMBER = 0x8a7256, PLASTER = 0xd9cdb4, TILE = 0x4d5257;

  function block(name, w, h, d, y, color, px) {
    const g = new THREE.BoxGeometry(w, h, d);
    const c = new THREE.Color(color);
    const col = [];
    for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.translate(0, y + h / 2, 0);
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    grp.add(m);
    addOutline(m, px);
    MARKS['study-' + name] = m;
    return m;
  }

  /* the stone base, carried well below the platform line so the skirt buries itself in whatever
     the shore is doing rather than floating over the low corner. SIZED OFF THE VERANDA, NOT THE
     EAVE: run out to the eave's footprint it came to 1,140 wide against a 1,020 eave, so the
     widest thing in the silhouette was the plinth — a building standing on a bigger building. */
  block('base', CORE[0][0] + 2 * DECK + 120, BASE_H + 260, CORE[0][1] + 2 * DECK + 120, -260, STONE, 3.5);

  for (let i = 0; i < 3; i++) {
    const [w, d, h, eave] = CORE[i];
    const y0 = BASE_H + i * SP;
    block('deck' + (i + 1), w + 2 * DECK, DECK_T, d + 2 * DECK, y0, TIMBER, 2.9);
    block('core' + (i + 1), w, h, d, y0 + DECK_T, PLASTER, 3.2);
    /* the eave sits directly under the next floor, which is what makes the storey read as a
       storey rather than as a band of colour */
    block('eave' + (i + 1), w + 2 * eave, EAVE_T, d + 2 * eave, y0 + SP - EAVE_T, TILE, 3.5);
  }

  {
    const y0 = BASE_H + 3 * SP;
    const g = new THREE.ConeGeometry(ROOF_R, ROOF_H, 4);
    g.rotateY(Math.PI / 4);
    g.translate(0, y0 + ROOF_H / 2, 0);
    const c = new THREE.Color(TILE);
    const col = [];
    for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, mat);
    m.name = 'roof';
    grp.add(m);
    addOutline(m, 3.5);
    MARKS['study-roof'] = m;
  }

  MARKS['study'] = grp;
  const RIDGE = BASE_H + 3 * SP + ROOF_H;
  blockAdd(foot.x, foot.z, 900, RIDGE + (TOP - groundAt(foot.x, foot.z)));

  /* THE APPROACH IS CLEARED, NOT JUST THE FOOTPRINT. A claim circle round the building keeps
     trees out of the building and does nothing about the 2,700 units between it and the camera,
     where a tree 900 off the axis stands squarely across the facade — which is how two of the
     four ground-storey bays came back BLOCKED on the first measured shot, by a broadleaf, not by
     an eave. Ground distance is not screen distance; that is the mistake the sacred tree made
     three times before `rectOf` existed. So the claim is a WEDGE widening from the standing
     point to the building, which removes exactly what would come between the two and leaves the
     flanking trees that frame the shot. It stops just past the building so the wood behind stays
     as a backdrop. */
  const STAND = 2700;
  for (let f = -STAND - 200; f <= 260; f += 260) {
    const p = at3(f, 0);
    treeClaim(p.x, p.z, 200 + 700 * ((f + STAND + 200) / (STAND + 460)));
  }

  /* ---- where the camera looks ----
     Not at the feet. A destination's target is the point the arrival flight settles on, and
     aiming it at ground level puts two thirds of the building above the frame's centre and the
     roof out of it. Held partway up, which is the number step zero is here to settle. */
  const focus = at3(0, 0);
  focus.y = TOP + 430;
  DEST_SPECS[0].focus = focus;

  /* what step zero needs to read back out */
  ctx.STUDY_MASS = { bearing: SPEC.bearing, dist: SPEC.dist, SITE, TOP: Math.round(TOP), RIDGE, SP, BASE_H, DECK, CORE, YAW };
  return ctx.STUDY_MASS;
}
