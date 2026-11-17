import './style.css';
import { Game } from './game';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const game = new Game(canvas, hud);

// Handy for poking at the sim from the console during playtests.
(window as unknown as { game: Game }).game = game;

// Installable and playable offline (production builds only, so dev reloads stay fresh).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* no offline mode; the game still works */
    });
  });
}
