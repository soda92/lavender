/**
 * Engine-faithful stand (pose) resolution for one character invocation.
 *
 * In exstand.tjs the requested pose/diff/face are applied in order, and
 * when a diff or face is not declared for the CURRENT pose it does NOT
 * borrow layers from another pose: the ENTIRE stand switches to the first
 * pose (charinit.csv order) that declares it for the current dress
 * (`currentDiffNameMap` / `currentFaceNameMap` in setDiff/setFace), so
 * body and face always come from the same stand. Afterwards
 * checkDiffFace() defaults an invalid/omitted face to the stand's first
 * declared face (faceList[0]) — body sheets have a transparent face hole,
 * so a plate is mandatory.
 */

export interface StandOption {
  pose: string;
  base: string;
  dresses: ReadonlyArray<{ dress?: string; diff?: string }>;
  faces: ReadonlyArray<{ expression: string }>;
}

export interface StandRequest {
  pose?: string;
  dress?: string;
  diff?: string;
  face?: string;
}

export interface ResolvedStand {
  /** Index into the options array (charinit.csv enumeration order). */
  index: number;
  /** Face to actually display after checkDiffFace() defaulting. */
  face: string | undefined;
  /** Whether the stand switched away from the requested pose. */
  switched: boolean;
}

export function resolveStand(options: StandOption[], req: StandRequest): ResolvedStand {
  let i = Math.max(0, options.findIndex(o => o.pose === req.pose));
  if (!options.length) return { index: 0, face: undefined, switched: false };

  const hasDress = (o: StandOption) =>
    !req.dress || o.dresses.some(d => d.dress === req.dress);
  const hasDiff = (o: StandOption) =>
    !req.diff || o.dresses.some(d => (!req.dress || d.dress === req.dress) && d.diff === req.diff);
  const hasFace = (o: StandOption) =>
    !req.face || o.faces.some(f => f.expression === req.face);

  const requested = i;
  // setDress: poses that don't carry the dress at all.
  if (!hasDress(options[i])) {
    const j = options.findIndex(hasDress);
    if (j >= 0) i = j;
  }
  // setDiff: first pose declaring the diff for this dress.
  if (req.diff && !hasDiff(options[i])) {
    const j = options.findIndex(o => hasDress(o) && hasDiff(o));
    if (j >= 0) i = j;
  }
  // setFace: first pose declaring the face for this dress.
  if (req.face && !hasFace(options[i])) {
    const j = options.findIndex(o => hasDress(o) && hasFace(o));
    if (j >= 0) i = j;
  }

  // checkDiffFace(): an invalid/omitted face becomes faceList[0].
  const opt = options[i];
  const face =
    req.face && opt.faces.some(f => f.expression === req.face)
      ? req.face
      : opt.faces[0]?.expression;

  return { index: i, face, switched: i !== requested };
}
