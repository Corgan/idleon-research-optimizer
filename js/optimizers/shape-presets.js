// Built-in shape presets retain strict Above-tier priorities, not a joint goal optimizer.
import { gridCoord, RES_GRID_RAW } from '../game-data.js';
import { mineheadShapePriority } from '../stats/systems/w7/minehead.js';
import { menagerieLumiShapePriority } from '../stats/systems/w7/menagerie.js';

function _sharedPoolPriority(S, nodes) {
  return nodes.filter(i => Number(S.gridLevels[i]) > 0)
    .sort((a, b) => RES_GRID_RAW[b][2] * Number(S.gridLevels[b])
      - RES_GRID_RAW[a][2] * Number(S.gridLevels[a]));
}

export const SHAPE_PRESETS = [
  { id: '_none', name: 'Res EXP', data: '|' },
  { id: '_minehead', name: 'Minehead', data: 'J6,I5,H5,G4,F6,H4,G5|', build: mineheadShapePriority },
  { id: '_dr', name: 'DR', data: 'N4,M4,I4|' },
  { id: '_daily', name: 'Daily', data: 'K5,L5|' },
  { id: '_classexp', name: 'Class EXP', data: 'K6,L6,M6,M5|',
    build: S => _sharedPoolPriority(S, [130, 131, 132, 152]) },
  { id: '_insight', name: 'Insight', data: 'M8,L8|',
    build: S => _sharedPoolPriority(S, [92, 91]) },
  { id: '_lumi', name: 'Lumi/hr', data: 'F4,E4|', build: menagerieLumiShapePriority },
  { id: '_jelly', name: 'Jelly operations', data: 'F3,H3|' },
  { id: '_sushi', name: 'Sushi income', data: 'J3,F6|' },
  { id: '_artifacts', name: 'Artifact hunting', data: 'G7,J7,F6|' },
  { id: '_megacrops', name: 'Megacrop farming', data: 'H9,I8|' },
  { id: '_gaming', name: 'Gaming', data: 'H8,I7|' },
  { id: '_construction', name: 'Construction', data: 'J9,J8|' },
  { id: '_cookingmastery', name: 'Cooking Mastery', data: 'K3|' },
  { id: '_equinox', name: 'Equinox', data: 'G8|' },
  { id: '_dailyworship', name: 'Daily Worship', data: 'K4|' },
];

export function shapePresetData(preset, S) {
  if (!preset.build || !S.gridLevels?.some(lv => Number(lv) > 0)) return preset.data;
  return preset.build(S).map(gridCoord).join(',') + '|';
}
