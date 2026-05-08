import { readFileSync, writeFileSync } from 'node:fs';
import * as cheerio from 'cheerio';

const URL = process.env.WATCH_URL;
const CODE = process.env.ROOM_CODE;
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
const STATE = '.state.json';

const sendDebugPing = false;

if (!URL || !CODE || !TOKEN || !CHAT) {
  console.error('missing env');
  process.exit(1);
}

const html = await fetch(URL, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
  },
}).then(r => {
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  return r.text();
});

const $ = cheerio.load(html);
const section = $(`section.am-card[data-room-code="${CODE}"]`).first();
if (!section.length) {
  console.error(`room ${CODE} not found`);
  process.exit(1);
}

const tiers = section.find('[data-price-before-extensions]')
  .map((_, el) => parseInt($(el).attr('data-price-before-extensions'), 10))
  .get()
  .filter(n => Number.isFinite(n));

if (!tiers.length) {
  console.error('no prices found');
  process.exit(1);
}

const price = Math.min(...tiers);
const prev = JSON.parse(readFileSync(STATE, 'utf8'));
console.log(`prev=${prev.price} now=${price} tiers=${tiers.join(',')}`);

const changed = prev.price != null && price !== prev.price;

async function tg(text) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: false }),
  });
  if (!res.ok) { console.error('tg', res.status, await res.text()); process.exit(1); }
}

if (changed) {
  const arrow = price < prev.price ? '⬇️' : '⬆️';
  const link = process.env.ALERT_LINK || URL;
  const label = process.env.ALERT_LABEL || 'view';
  await tg(
    `${arrow} <b>price update</b>\n\n` +
    `₪${prev.price} → <b>₪${price}</b>\n\n` +
    `👉 <a href="${link}">${label}</a>`
  );
  console.log('alert sent');
} else if (sendDebugPing) {
  await tg(`debug: alive ₪${price} ${new Date().toISOString()}`);
}

if (price !== prev.price) {
  writeFileSync(
    STATE,
    JSON.stringify({ price, ts: new Date().toISOString() }, null, 2) + '\n'
  );
}
