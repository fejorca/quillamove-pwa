import * as L from 'leaflet';

import { ProbeFix, acceptableFix, deviceId, nextDelayMs, probeConfig } from './probe';

const API_URL = 'https://qmapi-stg.emw.pw';
const CENTER: L.LatLngExpression = [10.96854, -74.78132];
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const status = document.querySelector<HTMLElement>('#status')!;
const consent = document.querySelector<HTMLElement>('#consent')!;

const map = L.map('map').setView(CENTER, 13);
L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);

const places = L.layerGroup().addTo(map);
let me: L.CircleMarker | null = null;
let timer = 0;

if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('sw.js');
}

const allow = consent.querySelector('button')!;

const standalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

if (standalone) {
  allow.disabled = true;
  setStatus('Ábrela en Safari, no desde el ícono: iOS no pide la ubicación en la app de inicio.');
}

allow.addEventListener('click', () => {
  if (standalone) return;
  if (!navigator.geolocation) {
    setStatus('Este navegador no entrega la ubicación.');
    return;
  }
  if (!window.isSecureContext) {
    setStatus('La ubicación solo se pide por HTTPS.');
    return;
  }
  allow.disabled = true;
  setStatus('Pidiendo permiso de ubicación…');
  // La llamada tiene que estar escrita aquí, dentro del toque, sin pasar por
  // otra función. Safari de iOS solo muestra el permiso si getCurrentPosition
  // se invoca de forma síncrona en el manejador del gesto; si llega a través de
  // un await o de una indirección, lo descarta en silencio.
  navigator.geolocation.getCurrentPosition(
    (position) => {
      consent.hidden = true;
      void start(position);
    },
    denied,
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
});

/** El permiso no llegó: el botón vuelve a quedar listo y se explica por qué. */
function denied(error: GeolocationPositionError): void {
  allow.disabled = false;
  const reason =
    error.code === error.PERMISSION_DENIED
      ? 'permiso denegado'
      : error.code === error.POSITION_UNAVAILABLE
        ? 'ubicación apagada'
        : error.code === error.TIMEOUT
          ? 'el teléfono no respondió a tiempo'
          : `error ${error.code}`;
  setStatus(`No se obtuvo la ubicación (${reason}). En Safari: aA → Configuración del sitio → Ubicación → Permitir.`);
}

/** Abre la sesión del dispositivo y empieza a reportar desde la posición ya obtenida. */
async function start(position: GeolocationPosition): Promise<void> {
  const config = probeConfig(await loadConfig());
  if (!config.enabled) {
    setStatus('El reporte de ubicación está apagado.');
    return;
  }

  const id = deviceId(localStorage);
  const token = await openSession(id);
  if (!token) {
    setStatus('No se pudo abrir la sesión del dispositivo.');
    return;
  }

  setStatus(`Reportando como ${id.slice(0, 8).toUpperCase()}. Deja esta pantalla abierta.`);
  await report(token, toFix(position));
  schedule(token, config);
}

function schedule(token: string, config: ReturnType<typeof probeConfig>): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(async () => {
    try {
      await report(token, toFix(await locate()));
    } catch {
      // Un fallo puntual no detiene el ciclo: se reintenta en el próximo turno.
    }
    schedule(token, config);
  }, nextDelayMs(config));
}

async function report(token: string, fix: ProbeFix): Promise<void> {
  showMe(fix);
  void showPlaces(fix);
  if (!acceptableFix(fix)) return;
  await fetch(`${API_URL}/v1/location-ping`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fix),
  });
}

/** Dibuja al usuario y la precisión de su fix. */
function showMe(fix: ProbeFix): void {
  me?.remove();
  me = L.circleMarker([fix.latitude, fix.longitude], {
    radius: 8,
    color: '#1b3a52',
    weight: 2,
    fillColor: '#d4af37',
    fillOpacity: 1,
  }).addTo(map);
  map.setView([fix.latitude, fix.longitude], 15);
}

/** Pide los puntos de interés cercanos y los marca en el mapa. */
async function showPlaces(fix: ProbeFix): Promise<void> {
  const response = await fetch(
    `${API_URL}/v1/content/pois?lat=${fix.latitude}&lng=${fix.longitude}&radiusKm=2`,
  );
  if (!response.ok) return;
  const body = (await response.json()) as { data?: Place[] };
  places.clearLayers();
  for (const place of body.data ?? []) {
    const point = place.location;
    if (!point) continue;
    L.marker([point.latitude, point.longitude]).bindTooltip(place.name).addTo(places);
  }
}

async function openSession(id: string): Promise<string | null> {
  const response = await fetch(`${API_URL}/v1/location/device-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: id }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: { accessToken?: string } };
  return body.data?.accessToken ?? null;
}

async function loadConfig(): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${API_URL}/v1/config`);
    const body = (await response.json()) as { data?: { config?: Record<string, unknown> } };
    return body.data?.config ?? null;
  } catch {
    return null;
  }
}

/** Pide la posición para los reportes siguientes, cuando el permiso ya está dado. */
function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

function toFix(position: GeolocationPosition): ProbeFix {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
  };
}

function setStatus(text: string): void {
  status.textContent = text;
}

interface Place {
  name: string;
  location?: { latitude: number; longitude: number };
}
