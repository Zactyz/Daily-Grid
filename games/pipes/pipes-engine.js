import { createSeededRandom } from '../common/utils.js';
import { DIR_MASKS, OPPOSITE_DIR, rotateMaskSteps, DIR_SEQUENCE } from './pipes-utils.js';

const MASK_TO_DIR = {
  [DIR_MASKS.N]: 'N',
  [DIR_MASKS.E]: 'E',
  [DIR_MASKS.S]: 'S',
  [DIR_MASKS.W]: 'W'
};

const DIRECTION_DELTAS = {
  N: { dr: -1, dc: 0 },
  E: { dr: 0, dc: 1 },
  S: { dr: 1, dc: 0 },
  W: { dr: 0, dc: -1 }
};

export class PipesEngine {
  constructor(descriptor) {
    this.descriptor = descriptor;
    this.width = descriptor.width;
    this.height = descriptor.height;
    this.totalCells = this.width * this.height;
    this.random = createSeededRandom(descriptor.seed + 1);
    this.reset();
  }

  reset() {
    this.cells = this.descriptor.solutionCells.map((solution, index) => {
      const isLocked = !!solution.isPrefill;
      const rotation = isLocked ? 0 : Math.floor(this.random() * 4);
      const playerMask = rotateMaskSteps(solution.connections, rotation);
      return {
        index,
        r: solution.r,
        c: solution.c,
        solutionMask: solution.connections,
        pipeType: solution.pipeType,
        isPrefill: isLocked,
        flowPressure: solution.flowPressure,
        rotation,
        playerMask,
        status: 'unknown'
      };
    });
    this._buildEntrySet();
    this._evaluateStatuses();
  }

  _buildEntrySet() {
    this.entrySet = new Set();
    if (Array.isArray(this.descriptor.entryPoints)) {
      this.descriptor.entryPoints.forEach(({ r, c, dir }) => {
        this.entrySet.add(`${r}-${c}-${dir}`);
      });
    }
  }

  rotateCell(index) {
    const cell = this.cells[index];
    if (!cell || cell.isPrefill) return false;
    cell.rotation = (cell.rotation + 1) % 4;
    cell.playerMask = rotateMaskSteps(cell.solutionMask, cell.rotation);
    this._evaluateStatuses();
    return true;
  }

  _evaluateStatuses() {
    for (let cell of this.cells) {
      cell.status = 'valid';
      const mask = cell.playerMask;
      const { r, c } = cell;
      let broken = false;

      for (let dir of DIR_SEQUENCE) {
        const maskFlag = DIR_MASKS[dir];
        const hasConnection = Boolean(mask & maskFlag);
        const adjacent = this._getNeighbor(r, c, dir);
        const needed = this._hasEntry(r, c, dir);
        if (hasConnection) {
          if (adjacent) {
            if (!(adjacent.playerMask & DIR_MASKS[OPPOSITE_DIR[dir]])) {
              broken = true;
              break;
            }
          } else if (!needed) {
            broken = true;
            break;
          }
        } else if (adjacent) {
          if (adjacent.playerMask & DIR_MASKS[OPPOSITE_DIR[dir]]) {
            broken = true;
            break;
          }
        }
      }

      cell.status = broken ? 'broken' : 'valid';
    }
  }

  _getNeighbor(r, c, dir) {
    const delta = DIRECTION_DELTAS[dir];
    if (!delta) return null;
    const nr = r + delta.dr;
    const nc = c + delta.dc;
    if (nr < 0 || nr >= this.height || nc < 0 || nc >= this.width) return null;
    return this.cells[nr * this.width + nc];
  }

  _hasEntry(r, c, dir) {
    return this.entrySet?.has(`${r}-${c}-${dir}`) || false;
  }

  getCells() {
    return this.cells;
  }

  getDescriptor() {
    return this.descriptor;
  }

  getCompletionCount() {
    return this.cells.filter((cell) => cell.playerMask === cell.solutionMask).length;
  }

  isSolved() {
    return this.getCompletionCount() === this.totalCells;
  }
}
