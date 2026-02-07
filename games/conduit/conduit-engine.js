import { createSeededRandom } from '../common/utils.js';
import { DIR_MASKS, OPPOSITE_DIR, rotateMaskSteps, DIR_SEQUENCE } from './conduit-utils.js';

const DIRECTION_DELTAS = {
  N: { dr: -1, dc: 0 },
  E: { dr: 0, dc: 1 },
  S: { dr: 1, dc: 0 },
  W: { dr: 0, dc: -1 }
};

export class ConduitEngine {
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
      const isBlocked = !!solution.isBlocked;
      const isActive = !!solution.isActive;
      const isLocked = !!solution.isPrefill || isBlocked || !isActive;
      const rotation = isLocked ? 0 : Math.floor(this.random() * 4);
      const playerMask = isActive ? rotateMaskSteps(solution.connections, rotation) : 0;
      return {
        index,
        r: solution.r,
        c: solution.c,
        solutionMask: solution.connections,
        segmentType: solution.segmentType,
        isPrefill: !!solution.isPrefill,
        isBlocked,
        isActive,
        rotation,
        playerMask,
        powered: false,
        status: 'inactive'
      };
    });
    this.activeCount = this.cells.filter((cell) => cell.isActive).length;
    this._buildEntrySet();
    this._evaluateStatuses();
  }

  _buildEntrySet() {
    this.entrySet = new Set();
    this.sourceEntry = null;
    this.exitEntries = [];
    const entries = Array.isArray(this.descriptor.entryPoints) ? this.descriptor.entryPoints : [];
    entries.forEach(({ r, c, dir, role }) => {
      this.entrySet.add(`${r}-${c}-${dir}`);
      if (role === 'source' && !this.sourceEntry) {
        this.sourceEntry = { r, c, dir, role };
      } else if (role === 'exit') {
        this.exitEntries.push({ r, c, dir, role });
      }
    });
    if (!this.sourceEntry && entries.length) {
      const fallback = entries[0];
      this.sourceEntry = { r: fallback.r, c: fallback.c, dir: fallback.dir, role: 'source' };
    }
  }

  rotateCell(index) {
    const cell = this.cells[index];
    if (!cell || cell.isPrefill || cell.isBlocked || !cell.isActive) return false;
    cell.rotation = (cell.rotation + 1) % 4;
    cell.playerMask = rotateMaskSteps(cell.solutionMask, cell.rotation);
    this._evaluateStatuses();
    return true;
  }

  _evaluateStatuses() {
    let brokenCount = 0;
    for (let cell of this.cells) {
      if (cell.isBlocked) {
        cell.status = 'blocked';
        cell.powered = false;
        continue;
      }
      if (!cell.isActive) {
        cell.status = 'inactive';
        cell.powered = false;
        continue;
      }

      const mask = cell.playerMask;
      const { r, c } = cell;
      let broken = false;

      for (let dir of DIR_SEQUENCE) {
        const maskFlag = DIR_MASKS[dir];
        const hasConnection = Boolean(mask & maskFlag);
        const adjacent = this._getNeighbor(r, c, dir);
        const needed = this._hasEntry(r, c, dir);

        if (hasConnection) {
          if (adjacent && adjacent.isActive) {
            if (!(adjacent.playerMask & DIR_MASKS[OPPOSITE_DIR[dir]])) {
              broken = true;
              break;
            }
          } else if (!needed) {
            broken = true;
            break;
          }
        } else {
          if (adjacent && adjacent.isActive && (adjacent.playerMask & DIR_MASKS[OPPOSITE_DIR[dir]])) {
            broken = true;
            break;
          }
          if (needed) {
            broken = true;
            break;
          }
        }
      }

      cell.status = broken ? 'broken' : 'valid';
      if (broken) brokenCount += 1;
    }

    this.brokenCount = brokenCount;
    this._evaluatePower();
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

  _evaluatePower() {
    this.poweredSet = new Set();
    this.exitPoweredCount = 0;
    const source = this.sourceEntry;
    if (!source) {
      this.cells.forEach((cell) => {
        cell.powered = false;
        if (cell.status === 'valid') cell.status = 'valid';
      });
      return;
    }

    const start = this.cells[source.r * this.width + source.c];
    if (!start || !start.isActive || !(start.playerMask & DIR_MASKS[source.dir])) {
      this.cells.forEach((cell) => {
        cell.powered = false;
        if (cell.status === 'valid') cell.status = 'valid';
      });
      return;
    }

    const queue = [start];
    this.poweredSet.add(start.index);

    while (queue.length) {
      const cell = queue.shift();
      for (let dir of DIR_SEQUENCE) {
        if (!(cell.playerMask & DIR_MASKS[dir])) continue;
        const neighbor = this._getNeighbor(cell.r, cell.c, dir);
        if (!neighbor || !neighbor.isActive) continue;
        if (!(neighbor.playerMask & DIR_MASKS[OPPOSITE_DIR[dir]])) continue;
        if (this.poweredSet.has(neighbor.index)) continue;
        this.poweredSet.add(neighbor.index);
        queue.push(neighbor);
      }
    }

    this.cells.forEach((cell) => {
      cell.powered = this.poweredSet.has(cell.index);
      if (cell.status === 'valid' && cell.powered) {
        cell.status = 'powered';
      } else if (cell.status === 'powered' && !cell.powered) {
        cell.status = 'valid';
      }
    });

    if (this.exitEntries.length) {
      this.exitPoweredCount = this.exitEntries.filter((entry) => {
        const cell = this.cells[entry.r * this.width + entry.c];
        return cell?.isActive && cell.powered && (cell.playerMask & DIR_MASKS[entry.dir]);
      }).length;
    }
  }

  getCells() {
    return this.cells;
  }

  getDescriptor() {
    return this.descriptor;
  }

  getCompletionCount() {
    return this.poweredSet?.size || 0;
  }

  getActiveCount() {
    return this.activeCount || 0;
  }

  getExitCount() {
    return this.exitEntries?.length || 0;
  }

  getExitPoweredCount() {
    return this.exitPoweredCount || 0;
  }

  isSolved() {
    if (!this.activeCount) return false;
    if (this.brokenCount > 0) return false;
    if ((this.poweredSet?.size || 0) !== this.activeCount) return false;
    if (this.exitEntries?.length && this.exitPoweredCount !== this.exitEntries.length) return false;
    return true;
  }
}
