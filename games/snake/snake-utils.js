export {
  getPTDateYYYYMMDD,
  validateUUID,
  generateUUID,
  getOrCreateAnonId,
  formatTime,
  createSeededRandom,
  hashString,
  normalizeWall
} from '../common/utils.js';

export const STORAGE_KEYS = {
  ANON_ID: 'dailygrid_anon_id',
  SNAKE_PROGRESS: 'dailygrid_snake_progress'
};
