import { MAINTENANCE_LEVELS, MAINTENANCE_NAMES, type MaintenanceLevel } from '../sim/ratings';
import { yearOf } from '../sim/calendar';
import { BUILDINGS, BUILDING_KINDS, PATH_COST, QUALITY_NAMES, RATING_CATEGORIES, RATING_NAMES, type BuildingKind, type RatingCategory } from '../sim/buildings';
import { nodeFor } from '../sim/research';
import { WISHES, type Wish } from '../sim/match';
import { BRANCHES, GATE_COUNT, type NodeStatus, type ResearchNode } from '../sim/research';
import { GUEST_TYPES, PATIENCE_SECONDS, type Guest } from '../sim/sim';

export type TrayItem = BuildingKind | 'path' | 'land';

export interface HudHandlers {
  /** Maintenance level picked in the ratings popover (Pass 4). */
  onMaintenance(level: MaintenanceLevel): void;
  onTrayDown(item: TrayItem, e: PointerEvent): void;
  /** A card chosen from the keyboard (no drag). */
  onTraySelect(item: TrayItem): void;
  onRotate(): void;
  onDemolish(): void;
  onUndo(): void;
  onCancel(): void;
  onNewIsland(): void;
  onSpeed(speed: Speed): void;
  onTab(tab: Tab): void;
  onGuestDown(id: number, e: PointerEvent): void;
  onAutoAssign(): void;
  onResearch(id: string): void;
  onGoals(): void;
  onToggleSound(): void;
  onToggleMotion(): void;
}

/** Which sheet is open above the dock; 'none' leaves the island clear. */
export type Tab = 'build' | 'guests' | 'research' | 'none';

export type Category = 'paths' | 'rooms' | 'food' | 'fun' | 'services' | 'decor';

const WISH_ICONS: Record<Wish, string> = {
  conference: '<svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="8" fill="#34495e"/><rect x="4" y="6" width="8" height="4" fill="#9fd8ee"/></svg>',
  fineDining: '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="5" fill="#fff" stroke="#c9a227" stroke-width="1.5"/><rect x="2" y="3" width="1" height="10" fill="#666"/><rect x="13" y="3" width="1" height="10" fill="#666"/></svg>',
  kidsClub: '<svg viewBox="0 0 16 16"><path d="M3 13 L9 3 L11 3 L5 13 Z" fill="#7bc96f"/><circle cx="12" cy="10" r="3" fill="#ff6b6b"/></svg>',
  spa: '<svg viewBox="0 0 16 16"><path d="M8 2 q-5 6 0 12 q5 -6 0 -12 Z" fill="#5fb3a5"/></svg>',
  gym: '<svg viewBox="0 0 16 16"><rect x="4" y="7" width="8" height="2" fill="#ff6b6b"/><rect x="2" y="5" width="3" height="6" fill="#ff6b6b"/><rect x="11" y="5" width="3" height="6" fill="#ff6b6b"/></svg>',
  nightclub: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2" fill="#2a2d38"/><circle cx="8" cy="8" r="2.5" fill="#ff3fa4"/></svg>',
  snacks: '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" fill="#ffe2bd"/><path d="M2 7 L4 3 H12 L14 7 Z" fill="#f2b441"/></svg>',
  buffet: '<svg viewBox="0 0 16 16"><path d="M1 7 L4 4 H12 L15 7 Z" fill="#3fa7a0"/><rect x="2" y="7" width="12" height="6" fill="#fff4e2" stroke="#d9c4a0" stroke-width=".6"/></svg>',
  quiet: '<svg viewBox="0 0 16 16"><path d="M11 2.5 A6 6 0 1 0 13.5 11 A4.6 4.6 0 0 1 11 2.5 Z" fill="#6b7fd6"/></svg>',
  pool: '<svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="9" rx="2" fill="#4fc6e8"/><path d="M3 9 q2.5 -2 5 0 t5 0" stroke="#fff" stroke-width="1.2" fill="none"/></svg>',
  bar: '<svg viewBox="0 0 16 16"><path d="M2 7 L8 2 L14 7 Z" fill="#d9b46a"/><rect x="4" y="7" width="8" height="6" fill="#a8754a"/></svg>',
  shortWalk: '<svg viewBox="0 0 16 16"><path d="M2 10 H14 L12 13 H4 Z" fill="#a8754a"/><rect x="7.2" y="3" width="1.6" height="7" fill="#7d5534"/><path d="M8.8 3.5 L13 7 H8.8 Z" fill="#fff"/></svg>',
};

const ICON_SHIRTS: Record<string, string[]> = {
  backpacker: ['#ff9f43'],
  couple: ['#ff7aa8', '#b38cf0'],
  family: ['#4fb0e8', '#7bc96f', '#ffd166', '#ff9f43'],
  wellness: ['#c9f0e4'],
  party: ['#ff3fa4', '#9b5cff', '#00d1c1'],
  vip: ['#222831', '#f2b441'],
  business: ['#34495e'],
};

function peopleIcon(g: Guest): string {
  const shirts = ICON_SHIRTS[g.type] ?? ['#ff9f43'];
  const fig = (x: number, c: string, s: number) =>
    `<g transform="translate(${x} ${28 - 28 * s}) scale(${s})"><circle cx="0" cy="9" r="4" fill="#f4cfa8"/><path d="M-6 26 Q-6 14 0 14 Q6 14 6 26 Z" fill="${c}"/></g>`;
  const n = g.size;
  const step = n === 1 ? 0 : Math.min(10, 22 / (n - 1));
  const x0 = 16 - (step * (n - 1)) / 2;
  let out = '';
  for (let k = 0; k < n; k++) out += fig(x0 + k * step, shirts[k % shirts.length], g.type === 'family' && k >= 2 ? 0.7 : 1);
  return `<svg viewBox="0 0 32 28">${out}</svg>`;
}

/** 0 = paused. */
export type Speed = 0 | 1 | 2 | 4;

const ICONS: Record<TrayItem, string> = {
  palmTree: '<svg viewBox="0 0 32 32"><path d="M15 29 C14 22 15 15 17 10" stroke="#9b6b43" stroke-width="2.5" fill="none"/><path d="M17 10 C12 6 7 7 4 11 C9 9 13 10 17 10Z M17 10 C17 5 14 2 10 2 C14 5 15 7 17 10Z M17 10 C21 6 25 6 28 8 C24 8 20 9 17 10Z M17 10 C22 11 25 14 26 18 C23 14 20 12 17 10Z" fill="#3f9a52"/></svg>',
  bench: '<svg viewBox="0 0 32 32"><rect x="5" y="16" width="22" height="3" fill="#a8754a"/><rect x="5" y="10" width="22" height="3" fill="#a8754a"/><rect x="7" y="19" width="2" height="7" fill="#7d5534"/><rect x="23" y="19" width="2" height="7" fill="#7d5534"/></svg>',
  lampPost: '<svg viewBox="0 0 32 32"><rect x="15" y="10" width="2" height="19" fill="#3a4a52"/><rect x="12" y="4" width="8" height="7" rx="1" fill="#f6d98b"/><rect x="11" y="3" width="10" height="2" fill="#3a4a52"/></svg>',
  beachChairs: '<svg viewBox="0 0 32 32"><path d="M4 12 Q16 2 28 12 Z" fill="#fff4e2" stroke="#e0c58a"/><rect x="15.5" y="11" width="1" height="16" fill="#999"/><path d="M4 26 L10 20 L14 20 L9 26Z" fill="#ff7a59"/><path d="M18 26 L24 20 L28 20 L23 26Z" fill="#4fc6e8"/></svg>',
  flowerBed: '<svg viewBox="0 0 32 32"><rect x="4" y="22" width="24" height="6" rx="2" fill="#8a5a3a"/><circle cx="10" cy="18" r="5" fill="#3f9a52"/><circle cx="22" cy="18" r="5" fill="#2f7d3a"/><circle cx="16" cy="15" r="5" fill="#3f9a52"/><circle cx="10" cy="15" r="2.5" fill="#ff3f6c"/><circle cx="17" cy="12" r="2.5" fill="#ffd23d"/><circle cx="23" cy="16" r="2.5" fill="#ff5fa2"/></svg>',
  tikiTorch: '<svg viewBox="0 0 32 32"><rect x="15" y="12" width="2.5" height="17" fill="#6b4a2a"/><rect x="13.5" y="9" width="5.5" height="4" fill="#3d2a18"/><path d="M16.2 2 C19 5 19 8 16.2 9 C13.5 8 13.5 5 16.2 2Z" fill="#ffb02e"/></svg>',
  surfboardRack: '<svg viewBox="0 0 32 32"><ellipse cx="9" cy="16" rx="3" ry="12" fill="#ff7a59"/><ellipse cx="16" cy="16" rx="3" ry="12" fill="#ffd23d"/><ellipse cx="23" cy="16" rx="3" ry="12" fill="#4fc6e8"/><rect x="4" y="18" width="24" height="2.5" fill="#7d5534"/></svg>',
  tikiTotem: '<svg viewBox="0 0 32 32"><rect x="10" y="4" width="12" height="25" fill="#8e5d33"/><rect x="8" y="3" width="16" height="3" fill="#2e9e4f"/><rect x="12" y="9" width="3" height="3" fill="#f2deaa"/><rect x="17" y="9" width="3" height="3" fill="#f2deaa"/><rect x="12" y="14" width="8" height="2" fill="#c0392b"/><rect x="12" y="19" width="3" height="3" fill="#f2deaa"/><rect x="17" y="19" width="3" height="3" fill="#f2deaa"/><rect x="12" y="24" width="8" height="2" fill="#c0392b"/></svg>',
  hammocks: '<svg viewBox="0 0 32 32"><rect x="4" y="8" width="2.5" height="20" fill="#9b6b43"/><rect x="25.5" y="8" width="2.5" height="20" fill="#9b6b43"/><path d="M6 12 Q16 26 26 12 Q16 20 6 12Z" fill="#e64a8a"/><path d="M8 14 Q16 21 24 14" stroke="#ffd23d" stroke-width="1.5" fill="none"/></svg>',
  bunting: '<svg viewBox="0 0 32 32"><rect x="3" y="6" width="2" height="22" fill="#ddd"/><rect x="27" y="6" width="2" height="22" fill="#ddd"/><path d="M4 8 Q16 16 28 8" stroke="#888" fill="none"/><path d="M7 9.5 L11 11.5 L8 16Z" fill="#ff3f6c"/><path d="M12 12 L16 12.5 L14 17Z" fill="#ffd23d"/><path d="M17 12.5 L21 12 L19 17Z" fill="#2ec4b6"/><path d="M22 11.5 L26 9.5 L24.5 15Z" fill="#7a5cff"/></svg>',
  welcomeArch: '<svg viewBox="0 0 32 32"><rect x="5" y="9" width="3.5" height="20" fill="#2ec4b6"/><rect x="23.5" y="9" width="3.5" height="20" fill="#2ec4b6"/><rect x="3" y="6" width="26" height="6" rx="1" fill="#ff7a59"/><rect x="7" y="7.5" width="18" height="3" fill="#ffd23d"/><circle cx="6.5" cy="5" r="3" fill="#3f9a52"/><circle cx="25.5" cy="5" r="3" fill="#3f9a52"/></svg>',
  suites: '<svg viewBox="0 0 32 32"><rect x="5" y="9" width="22" height="18" fill="#fdfaf3"/><rect x="4" y="7" width="24" height="3" fill="#c9a227"/><rect x="8" y="13" width="5" height="5" fill="#3b6e8f"/><rect x="19" y="13" width="5" height="5" fill="#3b6e8f"/><path d="M14 4 l2 -2 l2 2 l-2 2 Z" fill="#c9a227"/></svg>',
  fineDining: '<svg viewBox="0 0 32 32"><rect x="5" y="10" width="22" height="16" fill="#2c2c34"/><rect x="4" y="8" width="24" height="3" fill="#c9a227"/><rect x="8" y="14" width="16" height="6" fill="#f6d98b"/></svg>',
  movieTheater: '<svg viewBox="0 0 32 32"><rect x="4" y="8" width="24" height="19" fill="#7d3c98"/><rect x="7" y="11" width="18" height="6" fill="#f2b441"/><rect x="12" y="20" width="8" height="7" fill="#2a1a33"/></svg>',
  conferenceHall: '<svg viewBox="0 0 32 32"><rect x="3" y="10" width="26" height="16" fill="#eef3f7"/><rect x="2" y="8" width="28" height="3" fill="#34495e"/><rect x="6" y="14" width="20" height="6" fill="#3b6e8f"/></svg>',
  waterVillas: '<svg viewBox="0 0 32 32"><rect x="2" y="22" width="28" height="6" fill="#6fd6d6"/><rect x="4" y="19" width="24" height="3" fill="#a8754a"/><path d="M5 13 L10 7 L15 13 Z" fill="#d9b46a"/><rect x="6" y="13" width="8" height="6" fill="#f5ead6"/><path d="M17 13 L22 7 L27 13 Z" fill="#d9b46a"/><rect x="18" y="13" width="8" height="6" fill="#f5ead6"/></svg>',
  helipad: '<svg viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26" rx="3" fill="#5d6d7e"/><circle cx="16" cy="16" r="9" fill="none" stroke="#f2b441" stroke-width="2"/><path d="M12 10 V22 M20 10 V22 M12 16 H20" stroke="#fff" stroke-width="2.5"/></svg>',
  marina: '<svg viewBox="0 0 32 32"><rect x="2" y="20" width="28" height="8" fill="#6fd6d6"/><rect x="2" y="17" width="28" height="3" fill="#a8754a"/><path d="M8 17 L14 17 L13 21 L9 21 Z" fill="#fff"/><path d="M18 17 L26 17 L25 21 L19 21 Z" fill="#fff"/><rect x="21.5" y="6" width="1" height="11" fill="#999"/><path d="M22.5 7 L28 14 L22.5 14 Z" fill="#fff"/></svg>',
  kidsClub: '<svg viewBox="0 0 32 32"><rect x="4" y="12" width="16" height="14" fill="#ffd166"/><path d="M3 12 L12 5 L21 12 Z" fill="#4fb0e8"/><path d="M22 26 L28 14 L30 14 L24 26 Z" fill="#7bc96f"/><circle cx="12" cy="20" r="3" fill="#ff6b6b"/></svg>',
  nightclub: '<svg viewBox="0 0 32 32"><rect x="4" y="9" width="24" height="18" fill="#2a2d38"/><rect x="4" y="7" width="24" height="3" fill="#ff3fa4"/><rect x="9" y="13" width="14" height="3" fill="#9b5cff"/><rect x="13" y="19" width="6" height="8" fill="#111"/></svg>',
  researchOffice: '<svg viewBox="0 0 32 32"><rect x="6" y="12" width="20" height="15" fill="#eef3f7"/><rect x="5" y="10" width="22" height="3" fill="#6b7fd6"/><path d="M19 9 a5 5 0 0 1 8 -4" stroke="#999" stroke-width="2" fill="none"/><rect x="9" y="16" width="5" height="4" fill="#3b6e8f"/><rect x="18" y="16" width="5" height="4" fill="#3b6e8f"/></svg>',
  gardenBungalows: '<svg viewBox="0 0 32 32"><rect x="2" y="22" width="28" height="6" fill="#8cc860"/><path d="M3 14 L9 9 L15 14 Z" fill="#7a5a3a"/><rect x="4" y="14" width="10" height="8" fill="#a8754a"/><path d="M17 14 L23 9 L29 14 Z" fill="#7a5a3a"/><rect x="18" y="14" width="10" height="8" fill="#a8754a"/></svg>',
  italianRestaurant: '<svg viewBox="0 0 32 32"><path d="M3 13 L16 5 L29 13 Z" fill="#c0392b"/><rect x="5" y="13" width="22" height="13" fill="#fff4e2"/><rect x="10" y="15" width="12" height="4" fill="#2e9e4f"/></svg>',
  seafoodRestaurant: '<svg viewBox="0 0 32 32"><path d="M3 13 L16 5 L29 13 Z" fill="#2e86c1"/><rect x="5" y="13" width="22" height="13" fill="#fff4e2"/><path d="M10 21 q6 -6 12 0 q-6 6 -12 0 Z" fill="#ff8a4c"/></svg>',
  asianRestaurant: '<svg viewBox="0 0 32 32"><path d="M2 13 Q16 3 30 13 Z" fill="#8e2e2e"/><rect x="5" y="13" width="22" height="13" fill="#fff4e2"/><circle cx="16" cy="19" r="3" fill="#f2b441"/></svg>',
  gym: '<svg viewBox="0 0 32 32"><rect x="6" y="12" width="20" height="15" fill="#e9eef0"/><rect x="5" y="10" width="22" height="3" fill="#4a5560"/><rect x="10" y="18" width="12" height="2" fill="#ff6b6b"/><rect x="8" y="16" width="3" height="6" fill="#ff6b6b"/><rect x="21" y="16" width="3" height="6" fill="#ff6b6b"/></svg>',
  spa: '<svg viewBox="0 0 32 32"><path d="M4 13 L16 6 L28 13 Z" fill="#5fb3a5"/><rect x="6" y="13" width="20" height="13" fill="#fff"/><path d="M16 15 q-4 4 0 8 q4 -4 0 -8 Z" fill="#7fd8e8"/></svg>',
  boutique: '<svg viewBox="0 0 32 32"><rect x="6" y="12" width="20" height="15" fill="#f6effa"/><rect x="4" y="10" width="24" height="4" fill="#7f55b8"/><path d="M12 18 h8 l-1 7 h-6 Z" fill="#ffd166"/></svg>',
  diveShop: '<svg viewBox="0 0 32 32"><rect x="2" y="22" width="28" height="6" fill="#6fd6d6"/><rect x="5" y="11" width="14" height="11" fill="#3b8fd6"/><rect x="22" y="6" width="1.5" height="14" fill="#9b6b43"/><rect x="23.5" y="6" width="6" height="4" fill="#ff4d4d"/></svg>',
  land: '<svg viewBox="0 0 32 32"><path d="M2 22 Q16 14 30 22 V28 H2 Z" fill="#6fd6d6"/><path d="M7 21 Q16 10 25 21 Z" fill="#9fd36f"/><rect x="15" y="6" width="2" height="10" fill="#7d5534"/><path d="M17 6 L24 9 L17 12 Z" fill="#ff8a4c"/></svg>',
  path: '<svg viewBox="0 0 32 32"><path d="M6 28 C 10 18, 22 20, 26 4" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/></svg>',
  basicRooms:
    '<svg viewBox="0 0 32 32"><path d="M4 15 L16 6 L28 15 Z" fill="#e0704f"/><rect x="7" y="15" width="18" height="12" fill="#fff4e2" stroke="#d9c4a0"/><rect x="10" y="19" width="4" height="8" fill="#7d5534"/><rect x="18" y="19" width="4" height="4" fill="#3b6e8f"/></svg>',
  snackBar:
    '<svg viewBox="0 0 32 32"><rect x="6" y="15" width="20" height="12" fill="#ffe2bd"/><path d="M4 15 L8 8 H24 L28 15 Z" fill="#f2b441"/><path d="M10 8 L8 15 M16 8 V15 M22 8 L24 15" stroke="#fff" stroke-width="2"/></svg>',
  buffet:
    '<svg viewBox="0 0 32 32"><path d="M2 14 L8 8 H24 L30 14 Z" fill="#3fa7a0"/><rect x="4" y="14" width="24" height="12" fill="#fff4e2"/><rect x="7" y="18" width="18" height="4" fill="#a8754a"/></svg>',
  standardRooms:
    '<svg viewBox="0 0 32 32"><path d="M4 12 L16 4 L28 12 Z" fill="#3fa7a0"/><rect x="7" y="12" width="18" height="15" fill="#ffe2bd"/><rect x="10" y="15" width="4" height="3" fill="#3b6e8f"/><rect x="18" y="15" width="4" height="3" fill="#3b6e8f"/><rect x="10" y="21" width="4" height="6" fill="#7d5534"/><rect x="18" y="21" width="4" height="3" fill="#3b6e8f"/></svg>',
  beachBar:
    '<svg viewBox="0 0 32 32"><path d="M2 14 L16 5 L30 14 Z" fill="#d9b46a"/><rect x="6" y="14" width="2" height="12" fill="#9b6b43"/><rect x="24" y="14" width="2" height="12" fill="#9b6b43"/><rect x="9" y="19" width="14" height="5" fill="#7d5534"/></svg>',
  giftShop:
    '<svg viewBox="0 0 32 32"><rect x="7" y="13" width="18" height="14" fill="#ffe7f0"/><path d="M5 13 L8 8 H24 L27 13 Z" fill="#ff7aa8"/><rect x="11" y="17" width="10" height="6" fill="#3b6e8f"/></svg>',
  pool: '<svg viewBox="0 0 32 32"><rect x="3" y="8" width="26" height="18" rx="3" fill="#f3e6cc"/><rect x="6" y="11" width="20" height="12" rx="2" fill="#4fc6e8"/><path d="M8 18 q4 -3 8 0 t8 0" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  frontDesk:
    '<svg viewBox="0 0 32 32"><rect x="5" y="12" width="22" height="15" fill="#fff4e2"/><rect x="3" y="9" width="26" height="4" fill="#f2b441"/><rect x="10" y="4" width="12" height="5" fill="#3fa7a0"/><rect x="11" y="17" width="10" height="5" fill="#a8754a"/></svg>',
};

/** Line icons for the HUD itself (24×24, currentColor). */
const UI: Record<string, string> = {
  coin: '<svg viewBox="0 0 24 24" class="ico coin"><circle cx="12" cy="12" r="10" fill="#f5b82e"/><circle cx="12" cy="12" r="6.5" fill="#ffe38a" opacity=".55"/><circle cx="12" cy="12" r="10" fill="none" stroke="#b67a0c" stroke-width="1.2"/></svg>',
  star: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.2 1.3-6.6L2.5 9.4l6.6-.8z" fill="#f2b62a" stroke="#8a5a00" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  build: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2l10 5-10 5L2 7zm-8.2 8.1L12 14.2l8.2-4.1L22 11l-10 5-10-5zm0 4L12 18.2l8.2-4.1L22 15l-10 5-10-5z"/></svg>',
  guests: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 10c4.4 0 8 2.2 8 5v3H4v-3c0-2.8 3.6-5 8-5z"/></svg>',
  research: '<svg viewBox="0 0 24 24" class="ico"><path d="M9 2h6v2h-1v5.3l5.6 9.5A2 2 0 0 1 17.9 22H6.1a2 2 0 0 1-1.7-3.2L10 9.3V4H9zm-1.6 15h9.2l-2.4-4H9.8z"/></svg>',
  goals: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 3h12v2h3v3a4 4 0 0 1-4 4h-.3A6 6 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A6 6 0 0 1 7.3 12H7a4 4 0 0 1-4-4V5h3zm-1 4v1a2 2 0 0 0 1.4 1.9A6 6 0 0 1 6 8V7zm14 0h-1v1a6 6 0 0 1-.4 1.9A2 2 0 0 0 19 8z"/></svg>',
  play: '<svg viewBox="0 0 24 24" class="ico"><path d="M8 5l12 7-12 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" class="ico"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" class="ico"><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 4a8 8 0 0 1 7.7 6h2.1L18.5 14 15 10h2.6A6 6 0 1 0 18 14.5l1.9.6A8 8 0 1 1 12 4z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" class="ico"><path d="M8 5 3 10l5 5v-3.5h6a4 4 0 0 1 0 8h-3V22h3a6.5 6.5 0 0 0 0-13H8z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" class="ico"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg>',
  check: '<svg viewBox="0 0 24 24" class="ico"><path d="M9.5 16.2 5.3 12l-1.8 1.8 6 6L21 8.3l-1.8-1.8z"/></svg>',
  close: '<svg viewBox="0 0 24 24" class="ico"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4L12 13.4 6.4 19 5 17.6l5.6-5.6L5 6.4z"/></svg>',
  info: '<svg viewBox="0 0 24 24" class="ico"><path d="M11 10h2v8h-2zm1-4.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" class="ico"><path d="M7 10V8a5 5 0 0 1 10 0v2h1v11H6V10zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>',
  auto: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 4a8 8 0 0 1 7.7 6h2.1L18.5 14 15 10h2.6A6 6 0 1 0 18 14.5l1.9.6A8 8 0 1 1 12 4zm-1 4h2v4.4l3 1.8-1 1.7-4-2.4z"/></svg>',
  paths: '<svg viewBox="0 0 24 24" class="ico"><path d="M5 22c1-6 4-8 7-10s5-5 6-10h2c-1 6-4 8-7 10s-5 5-6 10z"/></svg>',
  rooms: '<svg viewBox="0 0 24 24" class="ico"><path d="M3 6h2v6h6V8h7a3 3 0 0 1 3 3v8h-2v-3H5v3H3zM7.5 8.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>',
  food: '<svg viewBox="0 0 24 24" class="ico"><path d="M7 2h2v7a3 3 0 0 1-2 2.8V22H5V11.8A3 3 0 0 1 3 9V2h2v6h1V2h1zm9 0c2.2 0 4 2.7 4 6.5 0 2.4-1 4-2.5 4.5V22h-2V2z"/></svg>',
  fun: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 3a9 9 0 0 1 9 9h-8v8a1.5 1.5 0 0 1-3 0v-1h2v1h-.5V12H3a9 9 0 0 1 9-9z"/></svg>',
  decor: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2c1.2 2.6 3.6 3.4 6 3-1 2.4-.5 4.6 1.5 6.3-2.6.6-4 2.6-4 5.2-2-1.6-4.4-1.6-6.5 0 0-2.6-1.4-4.6-4-5.2C7 9.6 7.5 7.4 6.5 5c2.4.4 4.8-.4 5.5-3zm-1 15h2v5h-2z"/></svg>',
  services: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 4a1.5 1.5 0 0 1 1.5 1.5v.3A6 6 0 0 1 18 11.7V16l2 2v1H4v-1l2-2v-4.3a6 6 0 0 1 4.5-5.9v-.3A1.5 1.5 0 0 1 12 4zm-2 16h4a2 2 0 0 1-4 0z"/></svg>',
};

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'paths', label: 'Paths' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'food', label: 'Food' },
  { id: 'fun', label: 'Fun' },
  { id: 'services', label: 'Services' },
  { id: 'decor', label: 'Decor' },
];

export function categoryOf(item: TrayItem): Category {
  if (item === 'path' || item === 'land') return 'paths';
  return BUILDINGS[item].family as Category;
}

const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

/**
 * Plain-DOM overlay in the Lagoon Glass style: glass chips at the top, a five-icon dock at the
 * bottom (Build, Guests, Play, Research, Goals), and one sheet above the dock for whichever
 * tab is open. Cards show an icon and a price; details live behind the info button.
 */
export class Hud {
  private coinsEl: HTMLElement;
  private ratingEl: HTMLElement;
  private hintEl: HTMLElement;
  private toastEl: HTMLElement;
  private tools: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private rotateBtn: HTMLButtonElement;
  private demolishBtn: HTMLButtonElement;
  private cards = new Map<TrayItem, HTMLButtonElement>();
  private dayEl: HTMLElement;
  private timeEl: HTMLElement;
  private speedBtn: HTMLButtonElement;
  private playBtn: HTMLButtonElement;
  private dockBtns: HTMLButtonElement[];
  private sheet: HTMLElement;
  private buildPane: HTMLElement;
  private guestPane: HTMLElement;
  private guestCards: HTMLElement;
  private emptyEl: HTMLElement;
  private badgeEl: HTMLElement;
  private rbadgeEl: HTMLElement;
  private chipEl: HTMLElement;
  private infoPop: HTMLElement;
  private menuPop: HTMLElement;
  private banner: HTMLElement;
  private queueKey = '';
  private patienceBars = new Map<number, HTMLElement>();
  private guestEls = new Map<number, HTMLElement>();
  private handlers: HudHandlers;
  private researchPane: HTMLElement;
  private researchKey = '';
  private toastTimer = 0;
  private category: Category = 'rooms';
  private speed: Speed = 1;
  private lastSpeed: Speed = 1;
  private infoFor: TrayItem | null = null;

  constructor(
    private root: HTMLElement,
    h: HudHandlers,
  ) {
    this.handlers = h;
    root.innerHTML = `
      <div class="sky-tint" aria-hidden="true"></div>
      <header class="top">
        <div class="chip glass" title="Coins">${UI.coin}<b data-coins>0</b></div>
        <button class="chip glass" data-ratings aria-expanded="false" title="Resort ratings">${UI.star}<b data-rating>2.5</b></button>
        <div class="chip glass clock" title="Year and date">
          <span class="day" data-day>D1</span><b data-time>07:00</b>
          <button class="speed" data-speedcycle aria-label="Game speed">1×</button>
        </div>
        <button class="chip glass round" data-menu aria-label="Menu" aria-expanded="false">${UI.menu}</button>
      </header>
      <div class="menu-pop ratings-pop glass" data-ratingspop hidden>
        <div class="rating-rows" data-ratingrows></div>
        <p class="keys">Average of the last 50 reviews. Each guest type weighs the four differently.</p>
        <div class="maint"><span>Maintenance</span><div class="seg" role="group" aria-label="Maintenance" data-maint>${MAINTENANCE_LEVELS.map((l) => `<button data-level="${l}">${MAINTENANCE_NAMES[l]}</button>`).join('')}</div></div>
        <p class="keys" data-maintnote></p>
      </div>
      <div class="menu-pop glass" data-menupop hidden>
        <button data-new>New island…</button>
        <button data-sound aria-pressed="true">Sound <span>On</span></button>
        <button data-motion aria-pressed="false">Reduce motion <span>Off</span></button>
        <p class="keys">Keys: 1–9 build · R rotate · X demolish · L land · G guests · Space pause · Ctrl+Z undo</p>
      </div>
      <div class="toast" data-toast role="status" aria-live="polite"></div>
      <div class="banner" data-banner aria-live="polite"></div>
      <div class="hint glass" data-hint></div>
      <div class="tools" data-tools>
        <button class="tool glass" data-rotate aria-label="Rotate (R)" title="Rotate (R)">${UI.rotate}</button>
        <button class="tool glass" data-undo aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">${UI.undo}</button>
        <button class="tool glass" data-demolish aria-label="Demolish (X)" title="Demolish (X)">${UI.trash}</button>
        <button class="tool done" data-cancel aria-label="Done (Esc)" title="Done (Esc)">${UI.check}</button>
      </div>
      <section class="sheet glass" data-sheet hidden>
        <div class="pane" data-pane="build">
          <div class="cats" role="tablist" data-cats>
            ${CATEGORIES.map((c) => `<button role="tab" data-cat="${c.id}">${UI[c.id]}<span>${c.label}</span></button>`).join('')}
          </div>
          <div class="cards" data-cards></div>
        </div>
        <div class="pane" data-pane="guests" hidden>
          <div class="cards">
            <button class="card auto" data-auto title="Place everyone in their best free room (−10 match)">${UI.auto}<b>Auto</b></button>
            <div class="guest-cards" data-guest-cards></div>
            <p class="empty" data-empty>No one is waiting.</p>
          </div>
        </div>
        <div class="pane" data-pane="research" hidden>
          <div class="cards">
            <div class="points"><b data-points>0</b><span>points</span></div>
            <div class="research-cards" data-research-cards></div>
          </div>
        </div>
      </section>
      <div class="infopop glass" data-infopop hidden></div>
      <nav class="dock glass" aria-label="Main">
        <button data-dock="build">${UI.build}<span>Build</span></button>
        <button data-dock="guests">${UI.guests}<span>Guests</span><b class="dot" data-badge></b></button>
        <button class="play" data-play aria-label="Pause">${UI.pause}</button>
        <button data-dock="research">${UI.research}<span>Research</span><b class="dot ok" data-rbadge></b></button>
        <button data-dock="goals" data-goals>${UI.goals}<span>Goals</span></button>
      </nav>
      <div class="chip-drag" data-chip></div>`;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.coinsEl = q('[data-coins]');
    this.ratingEl = q('[data-rating]');
    this.hintEl = q('[data-hint]');
    this.toastEl = q('[data-toast]');
    this.banner = q('[data-banner]');
    this.tools = q('[data-tools]');
    this.undoBtn = q('[data-undo]');
    this.rotateBtn = q('[data-rotate]');
    this.demolishBtn = q('[data-demolish]');
    this.dayEl = q('[data-day]');
    this.timeEl = q('[data-time]');
    this.speedBtn = q('[data-speedcycle]');
    this.playBtn = q('[data-play]');
    this.sheet = q('[data-sheet]');
    this.buildPane = q('[data-pane="build"]');
    this.guestPane = q('[data-pane="guests"]');
    this.researchPane = q('[data-pane="research"]');
    this.guestCards = q('[data-guest-cards]');
    this.emptyEl = q('[data-empty]');
    this.badgeEl = q('[data-badge]');
    this.rbadgeEl = q('[data-rbadge]');
    this.chipEl = q('[data-chip]');
    this.infoPop = q('[data-infopop]');
    this.menuPop = q('[data-menupop]');
    this.dockBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-dock]')];

    for (const b of this.dockBtns)
      b.addEventListener('click', () => {
        const t = b.dataset.dock!;
        if (t === 'goals') return h.onGoals();
        h.onTab(b.classList.contains('on') ? 'none' : (t as Tab));
      });
    this.playBtn.addEventListener('click', () => h.onSpeed(this.speed === 0 ? this.lastSpeed : 0));
    this.speedBtn.addEventListener('click', () => {
      const next: Speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
      h.onSpeed(next);
    });
    q('[data-auto]').addEventListener('click', () => h.onAutoAssign());
    this.researchPane.addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-node]');
      if (c) h.onResearch(c.dataset.node!);
    });
    q('[data-cats]').addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-cat]');
      if (c) this.setCategory(c.dataset.cat as Category);
    });
    q('[data-menu]').addEventListener('click', () => this.toggleMenu());
    q('[data-ratings]').addEventListener('click', () => this.toggleRatings());
    q('[data-maint]').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
      if (b) h.onMaintenance(b.dataset.level as MaintenanceLevel);
    });
    q('[data-new]').addEventListener('click', () => {
      this.toggleMenu(false);
      h.onNewIsland();
    });
    q('[data-sound]').addEventListener('click', () => h.onToggleSound());
    q('[data-motion]').addEventListener('click', () => h.onToggleMotion());
    this.rotateBtn.addEventListener('click', () => h.onRotate());
    this.demolishBtn.addEventListener('click', () => h.onDemolish());
    this.undoBtn.addEventListener('click', () => h.onUndo());
    q('[data-cancel]').addEventListener('click', () => h.onCancel());
    this.infoPop.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-close]')) this.hideInfo();
    });
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (!this.infoPop.hidden && !t.closest('[data-infopop]') && !t.closest('.card .i')) this.hideInfo();
      if (!this.menuPop.hidden && !t.closest('[data-menupop]') && !t.closest('[data-menu]')) this.toggleMenu(false);
      const rp = this.root.querySelector<HTMLElement>('[data-ratingspop]')!;
      if (!rp.hidden && !t.closest('[data-ratingspop]') && !t.closest('[data-ratings]')) this.toggleRatings(false);
    });

    const cardsEl = q<HTMLElement>('[data-cards]');
    const items: TrayItem[] = ['path', 'land', ...BUILDING_KINDS];
    for (const item of items) {
      const b = document.createElement('button');
      b.className = 'card';
      b.dataset.cat = categoryOf(item);
      const name = item === 'path' ? 'Footpath' : item === 'land' ? 'Buy land' : BUILDINGS[item].name;
      const price = item === 'path' ? `${PATH_COST}` : item === 'land' ? '' : fmt(BUILDINGS[item].cost);
      b.setAttribute('aria-label', name);
      b.title = name;
      b.innerHTML = `<span class="icon">${ICONS[item]}</span><span class="price">${UI.coin}<span data-price>${price}</span></span><span class="i" role="button" aria-label="About ${name}" tabindex="-1">${UI.info}</span><span class="lockmark">${UI.lock}</span>`;
      let press = 0;
      b.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).closest('.i')) return;
        e.preventDefault();
        // Long-press shows the details instead of picking the tool.
        const x = e.clientX;
        const y = e.clientY;
        press = window.setTimeout(() => {
          press = 0;
          this.showInfo(item);
        }, 450);
        const cancel = (ev: PointerEvent) => {
          if (ev.type === 'pointermove' && Math.hypot(ev.clientX - x, ev.clientY - y) < 8) return;
          clearTimeout(press);
          window.removeEventListener('pointermove', cancel);
          window.removeEventListener('pointerup', cancel);
        };
        window.addEventListener('pointermove', cancel);
        window.addEventListener('pointerup', cancel);
        h.onTrayDown(item, e);
      });
      b.querySelector('.i')!.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.infoFor === item && !this.infoPop.hidden) this.hideInfo();
        else this.showInfo(item);
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          h.onTraySelect(item);
        }
        if (e.key === 'i') this.showInfo(item);
      });
      cardsEl.appendChild(b);
      this.cards.set(item, b);
    }
    this.setCategory('rooms');
  }

  // ---------- top bar ----------

  setClock(month: number, date: string, _guests: number): void {
    const d = `Y${yearOf(month)}`;
    if (this.dayEl.textContent !== d) this.dayEl.textContent = d;
    if (this.timeEl.textContent !== date) this.timeEl.textContent = date;
  }

  setRating(stars: number): void {
    const text = stars.toFixed(1);
    if (this.ratingEl.textContent === text) return;
    const up = Number(text) > Number(this.ratingEl.textContent);
    this.ratingEl.textContent = text;
    if (up) this.bump('rating');
  }

  /** The four ratings and the overall, with stars, plus the maintenance level. */
  setRatings(r: Record<RatingCategory | 'overall', number>, maintenance: MaintenanceLevel): void {
    const row = (label: string, v: number, main = false) => {
      const full = Math.round(v);
      const stars = '★'.repeat(full) + '☆'.repeat(5 - full);
      return `<div class="rrow${main ? ' main' : ''}"><span>${label}</span><span class="stars" aria-hidden="true">${stars}</span><b>${v.toFixed(1)}</b></div>`;
    };
    const html = row('Overall', r.overall, true) + RATING_CATEGORIES.map((c) => row(RATING_NAMES[c], r[c])).join('');
    const el = this.root.querySelector<HTMLElement>('[data-ratingrows]')!;
    if (el.innerHTML !== html) el.innerHTML = html;
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-level]')) b.classList.toggle('on', b.dataset.level === maintenance);
    this.root.querySelector('[data-maintnote]')!.textContent =
      maintenance === 'low' ? 'Low: upkeep 30% cheaper, but buildings wear almost twice as fast.' : maintenance === 'high' ? 'High: upkeep 60% dearer; buildings stay like new for years.' : 'Normal: upkeep as listed; repair now and then.';
  }

  private toggleRatings(open = this.root.querySelector<HTMLElement>('[data-ratingspop]')!.hidden): void {
    this.root.querySelector<HTMLElement>('[data-ratingspop]')!.hidden = !open;
    this.root.querySelector('[data-ratings]')!.setAttribute('aria-expanded', String(open));
    if (open) this.toggleMenu(false);
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    if (speed > 0) this.lastSpeed = speed;
    this.speedBtn.textContent = `${speed === 0 ? this.lastSpeed : speed}×`;
    this.playBtn.innerHTML = speed === 0 ? UI.play : UI.pause;
    this.playBtn.setAttribute('aria-label', speed === 0 ? 'Play' : 'Pause');
    this.playBtn.classList.toggle('paused', speed === 0);
  }

  setCoins(n: number): void {
    this.coinsEl.textContent = fmt(n);
    this.coinsEl.classList.toggle('neg', n < 0);
  }

  setSettings(sound: boolean, reduceMotion: boolean): void {
    const s = this.root.querySelector<HTMLElement>('[data-sound]')!;
    s.setAttribute('aria-pressed', String(sound));
    s.querySelector('span')!.textContent = sound ? 'On' : 'Off';
    const m = this.root.querySelector<HTMLElement>('[data-motion]')!;
    m.setAttribute('aria-pressed', String(reduceMotion));
    m.querySelector('span')!.textContent = reduceMotion ? 'On' : 'Off';
  }

  private toggleMenu(open = this.menuPop.hidden): void {
    this.menuPop.hidden = !open;
    this.root.querySelector('[data-menu]')!.setAttribute('aria-expanded', String(open));
  }

  /** A short pulse on a HUD element when its value improves. */
  bump(what: 'coins' | 'rating' | 'research' | 'guests'): void {
    const el =
      what === 'coins'
        ? this.coinsEl.parentElement!
        : what === 'rating'
          ? this.ratingEl.parentElement!
          : what === 'research'
            ? this.root.querySelector<HTMLElement>('[data-dock="research"]')!
            : this.root.querySelector<HTMLElement>('[data-dock="guests"]')!;
    el.classList.remove('bump');
    void el.offsetWidth; // restart the animation
    el.classList.add('bump');
  }

  /** The large feedback tier: a banner with confetti (medals, scenario end). */
  celebrate(title: string, sub: string, confetti: boolean): void {
    const b = this.banner;
    const bits = confetti
      ? Array.from({ length: 24 }, (_, i) => {
          const c = ['#ff7a59', '#ffd34d', '#4fd1c5', '#7aa7ff', '#ff9ccc'][i % 5];
          return `<i style="--x:${(Math.random() * 2 - 1).toFixed(2)};--d:${(0.6 + Math.random() * 0.6).toFixed(2)}s;background:${c}"></i>`;
        }).join('')
      : '';
    b.innerHTML = `<div class="banner-card glass"><b>${title}</b><span>${sub}</span></div>${bits}`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  setGoalsAvailable(on: boolean): void {
    this.root.querySelector<HTMLElement>('[data-goals]')!.hidden = !on;
    this.root.querySelector('.dock')!.classList.toggle('four', !on);
  }

  setGoalsOpen(on: boolean): void {
    this.root.querySelector('[data-goals]')!.classList.toggle('on', on);
  }

  // ---------- sheet ----------

  setTab(tab: Tab): void {
    for (const b of this.dockBtns) if (b.dataset.dock !== 'goals') b.classList.toggle('on', b.dataset.dock === tab);
    this.sheet.hidden = tab === 'none';
    this.buildPane.hidden = tab !== 'build';
    this.guestPane.hidden = tab !== 'guests';
    this.researchPane.hidden = tab !== 'research';
    this.root.classList.toggle('sheet-open', tab !== 'none');
    if (tab !== 'build') this.hideInfo();
  }

  setCategory(cat: Category): void {
    this.category = cat;
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-cat]'))
      if (b.tagName === 'BUTTON' && b.closest('[data-cats]')) {
        b.classList.toggle('on', b.dataset.cat === cat);
        b.setAttribute('aria-selected', String(b.dataset.cat === cat));
      }
    for (const [, c] of this.cards) c.hidden = c.dataset.cat !== cat;
    this.hideInfo();
  }

  /** Show the category that holds a card (e.g. after a keyboard shortcut picks it). */
  revealCard(item: TrayItem): void {
    if (categoryOf(item) !== this.category) this.setCategory(categoryOf(item));
  }

  private showInfo(item: TrayItem): void {
    this.infoFor = item;
    const p = this.infoPop;
    let html: string;
    if (item === 'path') html = `<b>Footpath</b><p>Drag from an existing path. Guests walk on paths, and every building must touch one.</p><dl><dt>Cost</dt><dd>${UI.coin}${PATH_COST} a tile</dd></dl>`;
    else if (item === 'land') html = `<b>Buy land</b><p>Tap a 7×7 plot next to your island. Each plot costs more than the last.</p>`;
    else {
      const d = BUILDINGS[item];
      const lock = this.cards.get(item)?.dataset.lock;
      const node = nodeFor(item);
      html = `<b>${d.name}</b><p>${d.blurb}${d.coast ? '. Must touch the shore.' : '.'}</p>
        <dl><dt>Class</dt><dd>${QUALITY_NAMES[d.quality]}</dd><dt>Size</dt><dd>${d.w} × ${d.h}</dd>
        <dt>Cost</dt><dd>${UI.coin}${fmt(d.cost)}</dd><dt>Upkeep</dt><dd>${UI.coin}${d.upkeep} a day</dd></dl>
        ${lock ? `<p class="locked">${UI.lock} ${lock}${node ? ` (${node.cost} points)` : ''}</p>` : ''}`;
    }
    p.innerHTML = `<button class="x" data-close aria-label="Close">${UI.close}</button>${html}`;
    p.hidden = false;
  }

  /** Close the menu or the card info, whichever is open (Esc). */
  closePopover(): boolean {
    const rp = this.root.querySelector<HTMLElement>('[data-ratingspop]')!;
    if (!rp.hidden) {
      this.toggleRatings(false);
      return true;
    }
    if (!this.menuPop.hidden) {
      this.toggleMenu(false);
      return true;
    }
    if (!this.infoPop.hidden) {
      this.hideInfo();
      return true;
    }
    return false;
  }

  private hideInfo(): void {
    this.infoPop.hidden = true;
    this.infoFor = null;
  }

  // ---------- guests ----------

  /** Rebuild the arrival cards when the queue changes; cheap to call every frame. */
  setQueue(queue: Guest[]): void {
    const key = queue.map((g) => g.id).join(',');
    if (key !== this.queueKey) {
      const grew = queue.length > this.queueKey.split(',').filter(Boolean).length;
      this.queueKey = key;
      this.guestCards.textContent = '';
      this.patienceBars.clear();
      this.guestEls.clear();
      for (const g of queue) this.guestCards.appendChild(this.guestCard(g));
      this.emptyEl.hidden = queue.length > 0;
      this.badgeEl.textContent = queue.length ? String(queue.length) : '';
      this.guestPane.querySelector<HTMLButtonElement>('[data-auto]')!.disabled = queue.length === 0;
      if (grew) this.bump('guests');
    }
    for (const g of queue) {
      const bar = this.patienceBars.get(g.id);
      if (!bar) continue;
      const f = Math.max(0, g.patience / PATIENCE_SECONDS);
      bar.style.width = `${(f * 100).toFixed(1)}%`;
      bar.classList.toggle('urgent', f < 0.3);
    }
  }

  setSelectedGuest(id: number | null): void {
    for (const [gid, el] of this.guestEls) el.classList.toggle('active', gid === id);
  }

  private guestCard(g: Guest): HTMLElement {
    const def = GUEST_TYPES[g.type];
    const b = document.createElement('button');
    b.className = 'card guest';
    const wishes = g.wishes
      .map((w) => `<span class="wish" title="${WISHES[w].label}">${WISH_ICONS[w]}</span>`)
      .join('');
    b.innerHTML = `<span class="icon">${peopleIcon(g)}</span><span class="gmeta"><b>${g.nightsLeft}</b>n · ${UI.coin}${g.budget}</span><span class="wishes">${wishes}</span><span class="patience"><i></i></span>`;
    const label = `${def.name}${g.size > 2 ? ` of ${g.size}` : ''}: ${g.nightsLeft} night${g.nightsLeft === 1 ? '' : 's'}, budget ${g.budget}, wants ${g.wishes.map((w) => WISHES[w].label.toLowerCase()).join(', ')}`;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.handlers.onGuestDown(g.id, e);
    });
    this.patienceBars.set(g.id, b.querySelector<HTMLElement>('.patience i')!);
    this.guestEls.set(g.id, b);
    return b;
  }

  /** A label that follows the finger while a guest card is dragged. */
  showChip(text: string, tone: 'ok' | 'warn' | 'bad' | 'info', x: number, y: number): void {
    const c = this.chipEl;
    c.textContent = text;
    c.dataset.tone = tone;
    c.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - 70)}px) translateX(-50%)`;
    c.classList.add('show');
  }

  hideChip(): void {
    this.chipEl.classList.remove('show');
  }

  // ---------- build cards ----------

  /** Lock or unlock a build card; `reason` says what research it needs. */
  setLocked(item: TrayItem, reason: string | null): void {
    const c = this.cards.get(item);
    if (!c || (c.dataset.lock ?? '') === (reason ?? '')) return;
    c.classList.toggle('locked', reason !== null);
    c.dataset.lock = reason ?? '';
  }

  lockReason(item: TrayItem): string | null {
    return this.cards.get(item)?.dataset.lock || null;
  }

  /** Research topics as cards, grouped by tier. Cheap to call often. */
  setResearch(points: number, nodes: Array<{ node: ResearchNode; status: NodeStatus }>): void {
    const key = points + '|' + nodes.map((n) => n.node.id + n.status.state + ('reason' in n.status ? n.status.reason : '')).join(',');
    const available = nodes.filter((n) => n.status.state === 'available').length;
    const before = Number(this.rbadgeEl.textContent || 0);
    this.rbadgeEl.textContent = available ? String(available) : '';
    if (available > before) this.bump('research');
    if (key === this.researchKey) return;
    this.researchKey = key;
    this.root.querySelector('[data-points]')!.textContent = String(points);
    // A tree read left to right: one column per tier, joined by the gate that opens the next.
    const tiers = [...new Set(nodes.map((n) => n.node.tier))].sort((a, b) => a - b);
    const html = tiers
      .map((tier, i) => {
        const inTier = nodes.filter((n) => n.node.tier === tier).sort((a, b) => a.node.branch.localeCompare(b.node.branch));
        const done = inTier.filter((n) => n.status.state === 'done').length;
        const open = tier === 1 || nodes.filter((n) => n.node.tier === tier - 1 && n.status.state === 'done').length >= GATE_COUNT;
        const topics = inTier
          .map(({ node, status }) => {
            const foot =
              status.state === 'done'
                ? `<span class="state done">${UI.check}Done</span>`
                : status.state === 'available'
                  ? `<span class="state go">${node.cost} pts</span>`
                  : `<span class="state">${open ? status.reason.replace(/^Needs /, '') : `${UI.lock}${node.cost} pts`}</span>`;
            return `<button class="card topic ${status.state} b-${node.branch}" data-node="${node.id}" title="${BRANCHES[node.branch]}: ${node.blurb}">
              <span class="name">${node.name}</span>${foot}
            </button>`;
          })
          .join('');
        const gate =
          i < tiers.length - 1
            ? `<div class="gate ${done >= GATE_COUNT ? 'open' : ''}" title="${GATE_COUNT} tier ${tier} topics open tier ${tier + 1}"><span>${Math.min(done, GATE_COUNT)}/${GATE_COUNT}</span><i></i></div>`
            : '';
        return `<div class="tier-col ${open ? '' : 'closed'}"><h5>Tier ${tier}</h5><div class="tier-topics">${topics}</div></div>${gate}`;
      })
      .join('');
    this.root.querySelector('[data-research-cards]')!.innerHTML = html;
  }

  setLandPrice(price: number): void {
    const el = this.cards.get('land')?.querySelector('[data-price]');
    if (el) el.textContent = fmt(price);
  }

  setAffordable(item: TrayItem, ok: boolean): void {
    this.cards.get(item)?.classList.toggle('poor', !ok);
  }

  setActive(item: TrayItem | 'demolish' | null, canRotate: boolean): void {
    for (const [k, b] of this.cards) b.classList.toggle('active', k === item);
    this.demolishBtn.classList.toggle('active', item === 'demolish');
    this.rotateBtn.hidden = !canRotate;
    this.tools.classList.toggle('show', item !== null);
    if (item && item !== 'demolish') this.revealCard(item);
  }

  setUndo(enabled: boolean): void {
    this.undoBtn.disabled = !enabled;
  }

  setHint(text: string): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.toggle('show', text.length > 0);
  }

  toast(text: string, tone: 'bad' | 'info' | 'good' = 'bad'): void {
    this.toastEl.textContent = text;
    this.toastEl.dataset.tone = tone;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  }
}
