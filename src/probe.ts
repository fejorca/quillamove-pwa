/** Cada cuánto reporta un dispositivo cuando el servidor no dice otra cosa. */
export const DEFAULT_INTERVAL_SECONDS = 300;

/** Tope de la variación aleatoria que evita que todos reporten a la vez. */
export const DEFAULT_JITTER_SECONDS = 120;

/** Precisión peor que esta no aporta al mapa: la celda mide unos 111 m. */
export const MAX_ACCURACY_METERS = 500;

export interface ProbeConfig {
  enabled: boolean;
  intervalSeconds: number;
  jitterSeconds: number;
}

/**
 * Lee de la configuración pública cada cuánto reportar. Si una clave falta o
 * viene mal, usa el valor de siempre en vez de inventar uno.
 */
export function probeConfig(config: Record<string, unknown> | null): ProbeConfig {
  return {
    enabled: config?.['location.enabled'] !== false,
    intervalSeconds: positiveNumber(config?.['location.report_interval_seconds'], DEFAULT_INTERVAL_SECONDS),
    jitterSeconds: nonNegativeNumber(config?.['location.jitter_seconds'], DEFAULT_JITTER_SECONDS),
  };
}

/** Milisegundos hasta el próximo reporte: el intervalo más una variación al azar. */
export function nextDelayMs(config: ProbeConfig, random: () => number = Math.random): number {
  const jitter = config.jitterSeconds > 0 ? random() * config.jitterSeconds : 0;
  return (config.intervalSeconds + jitter) * 1000;
}

export interface ProbeFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

/** Un fix demasiado burdo no se envía: ensucia el mapa sin aportar densidad. */
export function acceptableFix(fix: ProbeFix): boolean {
  return Number.isFinite(fix.accuracyMeters) && fix.accuracyMeters <= MAX_ACCURACY_METERS;
}

const DEVICE_KEY = 'quillamove.deviceId';

/** El identificador del dispositivo: se genera una vez y se reutiliza. */
export function deviceId(storage: Pick<Storage, 'getItem' | 'setItem'>): string {
  const stored = storage.getItem(DEVICE_KEY);
  if (stored && isUuid(stored)) return stored;
  const created = crypto.randomUUID();
  storage.setItem(DEVICE_KEY, created);
  return created;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
