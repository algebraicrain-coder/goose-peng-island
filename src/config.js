// 全局世界参数：岛屿尺度、光照、季节色调等集中在此，便于调参。
export const WORLD = {
  seed: 20261015,

  // 岛屿
  islandRadius: 660,      // 陆地半径（世界单位）
  terrainSize: 1900,      // 地形网格边长（要盖住岛屿 + 近岸海底）
  terrainSegments: 400,   // 网格分段（顶点数 = (n+1)^2）
  waterLevel: 0,

  // 环岛公路
  roadRadius: 372,
  roadWidth: 7.4,
  roadLift: 0.9,          // 路面相对地面的抬升，防止 z-fighting

  // 太阳 / 大气（金色黄昏）
  sunAzimuth: 2.32,       // 弧度
  sunElevation: 0.30,     // 弧度（约 17°）
  fogColor: 0xc6d2da,
  fogDensity: 0.00017,

  // 骑行
  cycleSpeed: 15.5,       // 沿曲线的世界单位/秒
  laps: 1,
};

export const PALETTE = {
  sand:      [0xe8d5a4, 0xf0e0bb],
  grassLow:  [0x6f9a4a, 0x86ab55],
  grassHigh: [0x4f7c3c, 0x628c44],
  rock:      [0x8a8375, 0x6f6a60],
  rockDark:  [0x5a554d, 0x46423c],
  snow:      [0xf4f7fb, 0xdfe7f0],
  soil:      [0x8a6a45, 0x6f5436],
};
