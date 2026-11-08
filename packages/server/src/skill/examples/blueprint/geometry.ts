// The bridge as numbers, in the drawing's own units (viewBox 0 0 800 480). Pure data: the drawing reads it.
export const GROUND = 420, DECK = 330, TOP = 110;
export const TOWERS = [230, 570];
export const ANCHORS = [40, 760];

/** The main cable between the towers: a parabola, lowest at mid-span, well clear of the deck and what's on it. */
export const LOW = DECK - 72;
export function cableY(x: number): number {
  const [a, b] = TOWERS;
  const mid = (a + b) / 2, sag = LOW - TOP;
  const u = (x - mid) / ((b - a) / 2);
  return TOP + sag * (1 - u * u);
}

export const CABLE = `M${ANCHORS[0]} ${DECK + 20} L${TOWERS[0]} ${TOP} Q${(TOWERS[0] + TOWERS[1]) / 2} ${2 * LOW - TOP} ${TOWERS[1]} ${TOP} L${ANCHORS[1]} ${DECK + 20}`;
export const HANGERS = Array.from({ length: 11 }, (_, i) => TOWERS[0] + 30 + i * ((TOWERS[1] - TOWERS[0] - 60) / 10));

/** When each part is drawn: it starts at `from` and is complete at `to`, in story steps (0 = the first step). */
export const BUILD = { towers: [-1, 0], cable: [0.2, 1], hangers: [1.2, 2], deck: [2.2, 3], load: [3.2, 4] } as const;
