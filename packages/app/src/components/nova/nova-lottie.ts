/**
 * Nova 共读形象的 Lottie 动画生成器。
 *
 * 表情图片是位图，这里在运行时把图片嵌进 Lottie 的 image 图层，
 * 再叠加矢量装饰（思考气泡、星星、爱心、Zz 等）和关键帧动效。
 * 纯函数、无依赖，便于测试；图片 URL 由调用方传入。
 */

export type NovaMood =
  | "idle"
  | "greet"
  | "thinking"
  | "talking"
  | "found"
  | "silent"
  | "error"
  | "sleep"
  | "paused"
  | "pet";

export const NOVA_MOODS: readonly NovaMood[] = [
  "idle",
  "greet",
  "thinking",
  "talking",
  "found",
  "silent",
  "error",
  "sleep",
  "paused",
  "pet",
];

/** 只播放一次的状态；其余状态循环播放。 */
export const NOVA_ONE_SHOT_MOODS: ReadonlySet<NovaMood> = new Set(["greet", "pet"]);

export const NOVA_CANVAS_SIZE = 280;
export const NOVA_IMAGE_SIZE = 192;
const FPS = 30;
const CX = 140;
const CY = 160;
const HALF = NOVA_IMAGE_SIZE / 2;

type Vec = number[];
type Rgb = [number, number, number];

interface StaticProp {
  a: 0;
  k: number | Vec | PathShape;
}
interface AnimatedKeyframe {
  t: number;
  s: Vec;
  i?: { x: Vec; y: Vec };
  o?: { x: Vec; y: Vec };
}
interface AnimatedProp {
  a: 1;
  k: AnimatedKeyframe[];
}
type Prop = StaticProp | AnimatedProp;

interface PathShape {
  i: Vec[];
  o: Vec[];
  v: Vec[];
  c: boolean;
}

export interface NovaLottieLayer {
  ddd: 0;
  ind: number;
  ty: 2 | 4;
  nm: string;
  sr: 1;
  ks: Record<"o" | "r" | "p" | "a" | "s", Prop>;
  ao: 0;
  ip: number;
  op: number;
  st: 0;
  bm: 0;
  refId?: string;
  parent?: number;
  shapes?: unknown[];
}

export interface NovaAnimationData {
  v: string;
  fr: number;
  ip: 0;
  op: number;
  w: number;
  h: number;
  nm: string;
  ddd: 0;
  assets: { id: string; w: number; h: number; u: string; p: string; e: 1 }[];
  layers: NovaLottieLayer[];
}

// ---------- 基础构件 ----------

const fixed = (k: number | Vec | PathShape): StaticProp => ({ a: 0, k });

/** 关键帧：[帧, 值]。值可以是数字（旋转、透明度）或数组。 */
function anim(frames: [number, number | Vec][]): AnimatedProp {
  return {
    a: 1,
    k: frames.map(([t, value], index) => {
      const s = Array.isArray(value) ? value : [value];
      if (index === frames.length - 1) return { t, s };
      return {
        t,
        s,
        i: { x: s.map(() => 0.58), y: s.map(() => 1) },
        o: { x: s.map(() => 0.42), y: s.map(() => 0) },
      };
    }),
  };
}

function transform(t: Partial<Record<"o" | "r" | "p" | "a" | "s", Prop>>) {
  return {
    o: t.o ?? fixed(100),
    r: t.r ?? fixed(0),
    p: t.p ?? fixed([0, 0, 0]),
    a: t.a ?? fixed([0, 0, 0]),
    s: t.s ?? fixed([100, 100, 100]),
  };
}

const groupTransform = () => ({
  ty: "tr",
  p: fixed([0, 0]),
  a: fixed([0, 0]),
  s: fixed([100, 100]),
  r: fixed(0),
  o: fixed(100),
  sk: fixed(0),
  sa: fixed(0),
});

const group = (...items: unknown[]) => ({
  ty: "gr",
  it: [...items, groupTransform()],
});
const ellipse = (w: number, h: number, x = 0, y = 0) => ({
  ty: "el",
  d: 1,
  p: fixed([x, y]),
  s: fixed([w, h]),
});
const rect = (w: number, h: number, x: number, y: number, r: number) => ({
  ty: "rc",
  d: 1,
  p: fixed([x, y]),
  s: fixed([w, h]),
  r: fixed(r),
});
const star = (outer: number, inner: number, points = 4) => ({
  ty: "sr",
  sy: 1,
  d: 1,
  pt: fixed(points),
  p: fixed([0, 0]),
  r: fixed(0),
  ir: fixed(inner),
  is: fixed(0),
  or: fixed(outer),
  os: fixed(0),
});
const path = (shape: PathShape) => ({ ty: "sh", d: 1, ks: fixed(shape) });
const fill = (c: Rgb, opacity = 100) => ({
  ty: "fl",
  c: fixed([...c, 1]),
  o: fixed(opacity),
  r: 1,
});
const stroke = (c: Rgb, width: number, opacity = 100) => ({
  ty: "st",
  c: fixed([...c, 1]),
  o: fixed(opacity),
  w: fixed(width),
  lc: 2,
  lj: 2,
});

const zeros = (n: number) => Array.from({ length: n }, () => [0, 0]);
const polyline = (v: Vec[], closed = false): PathShape => ({
  i: zeros(v.length),
  o: zeros(v.length),
  v,
  c: closed,
});

const HEART: PathShape = {
  v: [
    [0, -4],
    [0, 10],
  ],
  i: [
    [4, -8],
    [-14, -8],
  ],
  o: [
    [-4, -8],
    [14, -8],
  ],
  c: true,
};
const DROP: PathShape = {
  v: [
    [0, -10],
    [0, 8],
  ],
  i: [
    [3, 6],
    [-7, 0],
  ],
  o: [
    [-3, 6],
    [7, 0],
  ],
  c: true,
};
const zigzag = (size: number) =>
  polyline([
    [-size, -size],
    [size, -size],
    [-size, size],
    [size, size],
  ]);

const COLORS = {
  white: [1, 1, 1] as Rgb,
  ink: [0.24, 0.26, 0.32] as Rgb,
  gold: [1, 0.8, 0.22] as Rgb,
  pink: [1, 0.5, 0.7] as Rgb,
  sky: [0.45, 0.72, 1] as Rgb,
  lavender: [0.66, 0.6, 1] as Rgb,
  mint: [0.5, 0.85, 0.7] as Rgb,
};

const RING: Record<NovaMood, Rgb> = {
  idle: [0.36, 0.82, 0.84],
  greet: [1, 0.72, 0.3],
  thinking: [0.5, 0.56, 1],
  talking: [0.36, 0.82, 0.84],
  found: [1, 0.8, 0.22],
  silent: [0.5, 0.8, 0.62],
  error: [1, 0.45, 0.45],
  sleep: [0.68, 0.62, 1],
  paused: [0.62, 0.63, 0.68],
  pet: [1, 0.55, 0.75],
};

const DURATION: Record<NovaMood, number> = {
  idle: 120,
  greet: 75,
  thinking: 90,
  talking: 60,
  found: 60,
  silent: 90,
  error: 150,
  sleep: 150,
  paused: 120,
  pet: 45,
};

interface Motion {
  p?: Prop;
  r?: Prop;
  s?: Prop;
  o?: Prop;
}

// ---------- 各状态的头像动效 ----------

function avatarMotion(mood: NovaMood): Motion {
  const at = (dx = 0, dy = 0): Vec => [CX + dx, CY + dy, 0];
  switch (mood) {
    case "idle":
      return {
        p: anim([
          [0, at()],
          [60, at(0, -3)],
          [120, at()],
        ]),
      };
    case "greet":
      return {
        s: anim([
          [0, [0, 0, 100]],
          [14, [112, 112, 100]],
          [22, [95, 95, 100]],
          [30, [102, 102, 100]],
          [40, [100, 100, 100]],
          [75, [100, 100, 100]],
        ]),
        r: anim([
          [40, 0],
          [48, -8],
          [56, 8],
          [64, -4],
          [72, 0],
        ]),
      };
    case "thinking":
      return {
        p: anim([
          [0, at()],
          [45, at(0, -3)],
          [90, at()],
        ]),
      };
    case "talking":
      return {
        p: anim([
          [0, at()],
          [15, at(0, -4)],
          [30, at()],
          [45, at(0, -2)],
          [60, at()],
        ]),
      };
    case "found":
      return {
        s: anim([
          [0, [100, 100, 100]],
          [8, [116, 116, 100]],
          [16, [96, 96, 100]],
          [24, [104, 104, 100]],
          [30, [100, 100, 100]],
          [60, [100, 100, 100]],
        ]),
        p: anim([
          [0, at()],
          [8, at(0, -8)],
          [16, at()],
          [60, at()],
        ]),
      };
    case "silent":
      return {
        p: anim([
          [0, at()],
          [45, at(0, -2)],
          [90, at()],
        ]),
      };
    case "error":
      return {
        p: anim([
          [0, at()],
          [4, at(-5)],
          [8, at(5)],
          [12, at(-3)],
          [16, at(3)],
          [20, at()],
          [150, at()],
        ]),
      };
    case "sleep":
      return {
        r: fixed(-6),
        p: anim([
          [0, at()],
          [75, at(0, 3)],
          [150, at()],
        ]),
      };
    case "paused":
      return {
        o: fixed(88),
      };
    case "pet":
      return {
        s: anim([
          [0, [100, 100, 100]],
          [6, [108, 92, 100]],
          [12, [94, 106, 100]],
          [18, [103, 97, 100]],
          [24, [100, 100, 100]],
          [45, [100, 100, 100]],
        ]),
        r: anim([
          [0, 0],
          [10, -6],
          [20, 6],
          [30, 0],
        ]),
      };
  }
}

// ---------- 装饰图层 ----------

interface Decoration {
  nm: string;
  shapes: unknown[];
  motion: Motion;
}

/** 在 [start, start+life] 内淡入淡出、位移并缩放的一次性装饰。 */
function burst(start: number, life: number, from: Vec, to: Vec, scale: [number, number] = [60, 110], spin = 0): Motion {
  const mid = start + Math.round(life * 0.25);
  const late = start + Math.round(life * 0.75);
  const end = start + life;
  return {
    p: anim([
      [start, [...from, 0]],
      [end, [...to, 0]],
    ]),
    o: anim([
      [start, 0],
      [mid, 100],
      [late, 100],
      [end, 0],
    ]),
    s: anim([
      [start, [scale[0], scale[0], 100]],
      [mid, [scale[1], scale[1], 100]],
      [end, [scale[0], scale[0], 100]],
    ]),
    r: spin
      ? anim([
          [start, 0],
          [end, spin],
        ])
      : undefined,
  };
}

const sparkle = (color: Rgb, outer = 9) => group(star(outer, outer * 0.36), fill(color));

function decorations(mood: NovaMood): Decoration[] {
  switch (mood) {
    case "idle":
      return [
        {
          nm: "sparkle",
          shapes: [sparkle(COLORS.gold, 13)],
          motion: burst(70, 30, [214, 70], [218, 64], [30, 110], 90),
        },
      ];
    case "greet":
      return [
        [8, [60, 96], [44, 76]],
        [14, [222, 70], [238, 50]],
        [20, [230, 170], [250, 164]],
      ].map(([start, from, to], index) => ({
        nm: `sparkle-${index}`,
        shapes: [sparkle(index === 1 ? COLORS.pink : COLORS.gold, 14)],
        motion: burst(start as number, 34, from as Vec, to as Vec, [20, 120], 120),
      }));
    case "thinking": {
      const cloud: Decoration = {
        nm: "cloud",
        shapes: [
          group(
            ellipse(78, 42, 214, 48),
            ellipse(12, 12, 182, 84),
            ellipse(7, 7, 172, 100),
            fill(COLORS.white),
            stroke(COLORS.ink, 2, 55),
          ),
        ],
        motion: {},
      };
      const dots = [196, 214, 232].map((x, index) => ({
        nm: `dot-${index}`,
        shapes: [group(ellipse(9, 9), fill(COLORS.ink))],
        motion: {
          p: anim([
            [index * 8, [x, 50, 0]],
            [index * 8 + 10, [x, 43, 0]],
            [index * 8 + 20, [x, 50, 0]],
            [60, [x, 50, 0]],
          ]),
          o: anim([
            [index * 8, 35],
            [index * 8 + 10, 100],
            [index * 8 + 20, 35],
            [60, 35],
          ]),
        },
      }));
      return [...dots, cloud];
    }
    case "talking":
      return [
        [
          [212, 62],
          [222, 44],
        ],
        [
          [224, 84],
          [242, 72],
        ],
        [
          [230, 106],
          [250, 104],
        ],
      ].map((line, index) => ({
        nm: `line-${index}`,
        shapes: [group(path(polyline(line)), stroke(RING.talking, 5.5))],
        motion: {
          o: anim([
            [index * 4, 0],
            [index * 4 + 8, 100],
            [index * 4 + 18, 0],
            [36, 0],
          ]),
        },
      }));
    case "found": {
      const mark: Decoration = {
        nm: "exclaim",
        shapes: [group(rect(12, 32, 0, -10, 6), ellipse(12, 12, 0, 17), fill(COLORS.gold), stroke(COLORS.white, 2))],
        motion: {
          p: fixed([66, 58, 0]),
          s: anim([
            [0, [0, 0, 100]],
            [10, [125, 125, 100]],
            [16, [100, 100, 100]],
            [60, [100, 100, 100]],
          ]),
          r: anim([
            [16, 0],
            [22, -12],
            [28, 10],
            [34, 0],
          ]),
        },
      };
      const stars = [
        [0, [44, 118], [30, 104]],
        [8, [226, 56], [244, 40]],
        [16, [246, 162], [262, 158]],
      ].map(([start, from, to], index) => ({
        nm: `star-${index}`,
        shapes: [group(star(17, 7.5, 5), fill(COLORS.gold), stroke(COLORS.white, 2))],
        motion: burst(start as number, 36, from as Vec, to as Vec, [0, 120], 180),
      }));
      return [mark, ...stars];
    }
    case "silent":
      return [
        [0, [206, 96], [214, 44]],
        [30, [226, 118], [236, 66]],
        [60, [196, 120], [202, 70]],
      ].map(([start, from, to], index) => ({
        nm: `bubble-${index}`,
        shapes: [group(ellipse(15, 15), stroke(COLORS.mint, 3), fill(COLORS.white, 60))],
        motion: burst(start as number, 30, from as Vec, to as Vec, [60, 100]),
      }));
    case "error":
      return [
        [0, [208, 70], [212, 100]],
        [22, [222, 88], [226, 116]],
      ].map(([start, from, to], index) => ({
        nm: `drop-${index}`,
        shapes: [group(path(DROP), fill(COLORS.sky), stroke(COLORS.white, 1.5))],
        motion: burst(start as number, 26, from as Vec, to as Vec, [130, 170]),
      }));
    case "sleep":
      return [
        [0, 9],
        [40, 12],
        [80, 15],
      ].map(([start, size], index) => ({
        nm: `z-${index}`,
        shapes: [group(path(zigzag(size)), stroke(COLORS.lavender, 4.5))],
        motion: burst(start, 70, [204, 80], [236 + index * 6, 24], [60, 110]),
      }));
    case "paused":
      return [
        {
          nm: "pause",
          shapes: [group(rect(9, 28, -8, 0, 4), rect(9, 28, 8, 0, 4), fill(RING.paused))],
          motion: {
            p: fixed([222, 60, 0]),
            o: anim([
              [0, 30],
              [60, 90],
              [120, 30],
            ]),
          },
        },
      ];
    case "pet":
      return [
        [0, [182, 106], [196, 58]],
        [8, [102, 90], [88, 48]],
        [16, [214, 146], [236, 110]],
      ].map(([start, from, to], index) => ({
        nm: `heart-${index}`,
        shapes: [group(path(HEART), fill(COLORS.pink), stroke(COLORS.white, 1.5))],
        motion: burst(start as number, 28, from as Vec, to as Vec, [90, 190]),
      }));
  }
}

// ---------- 组装 ----------

export function buildNovaAnimation(mood: NovaMood, imageUrl: string): NovaAnimationData {
  const op = DURATION[mood];
  const layers: NovaLottieLayer[] = [];
  let ind = 1;
  const base = { ddd: 0 as const, sr: 1 as const, ao: 0 as const, ip: 0, op, st: 0 as const, bm: 0 as const };

  for (const deco of decorations(mood)) {
    layers.push({
      ...base,
      ind: ind++,
      ty: 4,
      nm: deco.nm,
      ks: transform(deco.motion),
      shapes: deco.shapes,
    });
  }

  const avatarInd = ind + 1;
  // 头像描边环：挂在头像图层下，跟着一起动。
  layers.push({
    ...base,
    ind: ind++,
    ty: 4,
    nm: "ring",
    parent: avatarInd,
    ks: transform({}),
    shapes: [
      group(ellipse(NOVA_IMAGE_SIZE - 2, NOVA_IMAGE_SIZE - 2, HALF, HALF), stroke(COLORS.white, 5)),
      group(ellipse(NOVA_IMAGE_SIZE + 6, NOVA_IMAGE_SIZE + 6, HALF, HALF), stroke(RING[mood], 5)),
    ],
  });
  const motion = avatarMotion(mood);
  layers.push({
    ...base,
    ind: ind++,
    ty: 2,
    nm: "nova",
    refId: "nova_img",
    ks: transform({
      p: motion.p ?? fixed([CX, CY, 0]),
      a: fixed([HALF, HALF, 0]),
      r: motion.r,
      s: motion.s,
      o: motion.o,
    }),
  });
  // 头像背后的柔光。
  layers.push({
    ...base,
    ind: ind++,
    ty: 4,
    nm: "glow",
    ks: transform({ p: fixed([CX, CY, 0]) }),
    shapes: [group(ellipse(NOVA_IMAGE_SIZE + 22, NOVA_IMAGE_SIZE + 22), fill(RING[mood], 22))],
  });

  return {
    v: "5.7.4",
    fr: FPS,
    ip: 0,
    op,
    w: NOVA_CANVAS_SIZE,
    h: NOVA_CANVAS_SIZE,
    nm: `nova-${mood}`,
    ddd: 0,
    assets: [
      {
        id: "nova_img",
        w: NOVA_IMAGE_SIZE,
        h: NOVA_IMAGE_SIZE,
        u: "",
        p: imageUrl,
        e: 1,
      },
    ],
    layers,
  };
}
