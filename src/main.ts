import './style.css';
import { Game } from './game';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const game = new Game(canvas, hud);

// Handy for poking at the sim from the console during playtests.
(window as unknown as { game: Game }).game = game;
