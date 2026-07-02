/**
 * Bilingual position labels (PT/EN) for FUT cards.
 */

/** @type {Record<string, string>} */
export const POSITION_LABELS = {
  GK: 'GOL/GK',
  SW: 'LÍB/SW',
  RWB: 'LDI/RWB',
  RB: 'LD/RB',
  RCB: 'ZAG-D/RCB',
  CB: 'ZAG/CB',
  LCB: 'ZAG-E/LCB',
  LB: 'LE/LB',
  LWB: 'LEI/LWB',
  RDM: 'VOL-D/RDM',
  CDM: 'VOL/CDM',
  LDM: 'VOL-E/LDM',
  RM: 'MD-D/RM',
  RCM: 'MEI-D/RCM',
  CM: 'MEI/CM',
  LCM: 'MEI-E/LCM',
  LM: 'MEI-E/LM',
  RAM: 'MEI-AD/RAM',
  CAM: 'MEI-OF/CAM',
  LAM: 'MEI-AE/LAM',
  RF: 'PD/RF',
  CF: 'SA/CF',
  LF: 'PE/LF',
  RW: 'AD/RW',
  RS: 'ATA-D/RS',
  ST: 'ATA/ST',
  LS: 'ATA-E/LS',
  LW: 'AE/LW',
};

/**
 * @param {string|null|undefined} code
 * @returns {string}
 */
export function formatPosition(code) {
  if (!code) return '—';
  const upper = String(code).toUpperCase();
  return POSITION_LABELS[upper] || upper;
}
