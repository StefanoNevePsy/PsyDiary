// Immagini di prova, disegnate al volo (niente foto vere): copertine dei
// gruppi e un "disegno" incollato in una seduta.
import { salvaImmagine } from './immagini.js';

function tela(w, h, fondo) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = fondo; x.fillRect(0, 0, w, h);
  return { c, x };
}
const inBlob = (c) => new Promise((ok) => c.toBlob((b) => ok(new File([b], 'demo.png', { type: 'image/png' })), 'image/png'));
let seme = 3;
const caso = () => { seme = (seme * 16807) % 2147483647; return (seme - 1) / 2147483646; };

function volti() {
  const { c, x } = tela(1200, 700, '#efe6d6');
  x.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const cx = 130 + (i % 5) * 235 + caso() * 30, cy = 170 + Math.floor(i / 5) * 330 + caso() * 40, r = 85 + caso() * 30;
    x.fillStyle = ['#2b2f3d', '#6b6f7d', '#b9b2a4'][i % 3];
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#f6efe2'; x.lineWidth = 9; x.fillStyle = '#f6efe2';
    x.beginPath(); x.arc(cx - r * 0.35, cy - r * 0.2, 9, 0, 7); x.arc(cx + r * 0.35, cy - r * 0.2, 9, 0, 7); x.fill();
    const umore = i % 3 - 1;
    x.beginPath(); x.moveTo(cx - r * 0.4, cy + r * 0.35); x.quadraticCurveTo(cx, cy + r * 0.35 + umore * r * 0.4, cx + r * 0.4, cy + r * 0.35); x.stroke();
  }
  return c;
}
function nuvolette() {
  const { c, x } = tela(1200, 700, '#e9e2d4');
  for (let i = 0; i < 7; i++) {
    const cx = 120 + caso() * 960, cy = 110 + caso() * 470, w = 200 + caso() * 160, h = 110 + caso() * 60;
    x.fillStyle = i % 2 ? '#2b2f3d' : '#8d8a84';
    x.beginPath(); x.roundRect(cx - w / 2, cy - h / 2, w, h, 50); x.fill();
    x.beginPath(); x.moveTo(cx - 20, cy + h / 2 - 4); x.lineTo(cx - 50 + caso() * 20, cy + h / 2 + 50); x.lineTo(cx + 22, cy + h / 2 - 4); x.fill();
    x.fillStyle = '#f3ecdf';
    for (let k = 0; k < 3; k++) x.fillRect(cx - w / 2 + 30, cy - h / 2 + 26 + k * 24, (w - 60) * (0.5 + caso() * 0.5), 10);
  }
  return c;
}
function fanzine() {
  const { c, x } = tela(1200, 700, '#ece4d4');
  for (let i = 0; i < 5; i++) {
    x.save();
    x.translate(200 + i * 200, 350); x.rotate((caso() - 0.5) * 0.5);
    x.fillStyle = '#f7f1e6'; x.fillRect(-120, -190, 240, 340);
    x.strokeStyle = '#2b2f3d'; x.lineWidth = 3; x.strokeRect(-120, -190, 240, 340);
    x.fillStyle = '#2b2f3d'; x.fillRect(-95, -165, 190, 120);
    x.fillStyle = '#7d7a73';
    for (let k = 0; k < 6; k++) x.fillRect(-95, -20 + k * 24, 190 * (0.6 + caso() * 0.4), 9);
    x.restore();
  }
  return c;
}
function termometro() {
  const { c, x } = tela(900, 1100, '#f4ede0');
  x.strokeStyle = '#22252f'; x.lineWidth = 10; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.roundRect(390, 120, 120, 720, 60); x.stroke();
  x.beginPath(); x.arc(450, 900, 110, 0, 7); x.stroke();
  x.fillStyle = '#3c3f4a'; x.beginPath(); x.arc(450, 900, 85, 0, 7); x.fill(); x.fillRect(420, 420, 60, 480);
  x.font = 'bold 54px Georgia'; x.fillStyle = '#22252f';
  ['esplodo', 'arrabbiato', 'nervoso', 'infastidito', 'tranquillo'].forEach((t, i) => {
    const y = 200 + i * 140;
    x.fillRect(520, y - 6, 40, 10); x.fillText(t, 580, y + 14);
    x.fillText(String(5 - i), 320, y + 16);
  });
  return c;
}

/** Crea le immagini e restituisce gli id. */
export async function creaImmaginiDemo() {
  seme = 3;
  const id = async (c) => salvaImmagine(await inBlob(c));
  return { gmart: await id(volti()), ggiov: await id(nuvolette()), gvene: await id(fanzine()), termometro: await id(termometro()) };
}
