export {
  getPTDateYYYYMMDD,
  validateUUID,
  generateUUID,
  getOrCreateAnonId,
  formatTime,
  createSeededRandom,
  hashString
} from '../common/utils.js';

export const STORAGE_KEYS = {
  ANON_ID: 'dailygrid_anon_id',
  PATHWAYS_PROGRESS: 'dailygrid_pathways_progress'
};
