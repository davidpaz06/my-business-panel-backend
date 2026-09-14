import { JOURNEY_LIMITS } from './journey-limits.interface';

/** Ventana diurna (Art. 173): 5:00 a.m. - 7:00 p.m. */
const DIURNAL_START_MIN = 5 * 60;
const DIURNAL_END_MIN = 19 * 60;

function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function overlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export interface JourneyClassificationResult {
  totalHours: number;
  diurnalHours: number;
  nocturnalHours: number;
  effectiveJourney: 'diurna' | 'nocturna' | 'mixta';
  maxDaily: number;
  reason?: string;
}

/**
 * Clasifica un turno segun sus horas de inicio/fin (Art. 173).
 * Si la jornada mixta tiene un periodo nocturno mayor a 4 horas, se
 * reputa NOCTURNA en su totalidad.
 */
export function classifyJourney(
  startTime: string,
  endTime: string,
): JourneyClassificationResult {
  const start = parseHHMM(startTime);
  let end = parseHHMM(endTime);
  if (end <= start) end += 24 * 60; // cruza medianoche

  const totalMinutes = end - start;

  // Ventana nocturna en la linea de tiempo extendida (puede cubrir dos dias).
  const nightSeg1Start = DIURNAL_END_MIN; // 19:00 dia 0
  const nightSeg1End = 24 * 60; // 24:00 dia 0
  const nightSeg2Start = 24 * 60; // 00:00 dia 1
  const nightSeg2End = 24 * 60 + DIURNAL_START_MIN; // 05:00 dia 1

  const nocturnalMinutes =
    overlap(start, end, nightSeg1Start, nightSeg1End) +
    overlap(start, end, nightSeg2Start, nightSeg2End);
  const diurnalMinutes = totalMinutes - nocturnalMinutes;

  const totalHours = totalMinutes / 60;
  const diurnalHours = diurnalMinutes / 60;
  const nocturnalHours = nocturnalMinutes / 60;

  if (nocturnalHours === 0) {
    return {
      totalHours,
      diurnalHours,
      nocturnalHours,
      effectiveJourney: 'diurna',
      maxDaily: JOURNEY_LIMITS.diurna.maxDaily,
    };
  }

  if (diurnalHours === 0) {
    return {
      totalHours,
      diurnalHours,
      nocturnalHours,
      effectiveJourney: 'nocturna',
      maxDaily: JOURNEY_LIMITS.nocturna.maxDaily,
    };
  }

  // Mixta: si el tramo nocturno supera 4 horas, se reputa nocturna
  // en su totalidad (Art. 173).
  if (nocturnalHours > 4) {
    return {
      totalHours,
      diurnalHours,
      nocturnalHours,
      effectiveJourney: 'nocturna',
      maxDaily: JOURNEY_LIMITS.nocturna.maxDaily,
      reason: 'periodo nocturno mayor a 4 horas (Art. 173)',
    };
  }

  return {
    totalHours,
    diurnalHours,
    nocturnalHours,
    effectiveJourney: 'mixta',
    maxDaily: JOURNEY_LIMITS.mixta.maxDaily,
  };
}
