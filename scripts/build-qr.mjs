// Pre-renders the QR codes the kiosk shows, so the tablet needs no QR library.
// Run after changing menuUrl or missedCall in public/config.json:  npm run qr
import { readFileSync, writeFileSync } from 'node:fs';
import qrcode from './vendor-qrcode.mjs';
import { smsLink } from '../public/js/logic.mjs';

export function encode(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let bits = '';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) bits += qr.isDark(r, c) ? '1' : '0';
  bits = bits.padEnd(Math.ceil(bits.length / 4) * 4, '0');
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return { text, size, hex };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = JSON.parse(readFileSync(new URL('../public/config.json', import.meta.url)));
  const sms = smsLink(config.missedCall.textNumber, config.missedCall.textMessage);
  const out = { menu: encode(config.menuUrl), text: sms ? encode(sms) : null };
  writeFileSync(new URL('../public/qr.json', import.meta.url), JSON.stringify(out) + '\n');
  console.log(`menu ${out.menu.size}x${out.menu.size}${out.text ? `, text ${out.text.size}x${out.text.size}` : ', no text number'}`);
}
