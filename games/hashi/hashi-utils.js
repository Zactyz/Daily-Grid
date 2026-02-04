import {
  getPTDateYYYYMMDD,
  createSeededRandom,
  hashString,
  formatTime,
  getOrCreateAnonId
} from '../common/utils.js';

export {
  getPTDateYYYYMMDD,
  createSeededRandom,
  hashString,
  formatTime,
  getOrCreateAnonId
};

export function sortedPair(idA, idB) {
  return idA < idB ? [idA, idB] : [idB, idA];
}

export function edgeIdFromIslands(idA, idB) {
  const [first, second] = sortedPair(idA, idB);
  return `${first}--${second}`;
}
