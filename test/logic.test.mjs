import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isOpen, hoursLabel, youtubeEmbed, smsLink } from '../public/js/logic.mjs';

const config = JSON.parse(readFileSync(new URL('../public/config.json', import.meta.url)));
const tz = 'America/Chicago';
// 2026-10-21 is a Wednesday; Chicago is UTC-5 (CDT).
const at = (hhmm) => new Date(`2026-10-21T${hhmm}:00-05:00`);

test('open 11 AM to 9 PM Chicago time', () => {
  assert.equal(isOpen(at('10:59'), config.hours, tz), false);
  assert.equal(isOpen(at('11:00'), config.hours, tz), true);
  assert.equal(isOpen(at('20:59'), config.hours, tz), true);
  assert.equal(isOpen(at('21:00'), config.hours, tz), false);
  assert.equal(isOpen(at('02:00'), config.hours, tz), false);
  assert.equal(hoursLabel(config.hours), '11 AM – 9 PM');
});

test('per-day overrides, closed days and after-midnight closing', () => {
  const hours = { default: { open: '11:00', close: '21:00' }, days: { wed: 'closed', thu: { open: '17:00', close: '02:00' } } };
  assert.equal(isOpen(at('12:00'), hours, tz), false);
  assert.equal(isOpen(new Date('2026-10-22T23:30:00-05:00'), hours, tz), true);
  assert.equal(isOpen(new Date('2026-10-23T01:30:00-05:00'), hours, tz), true);
  assert.equal(isOpen(new Date('2026-10-23T02:00:00-05:00'), hours, tz), false);
});

test('YouTube links become looping embeds', () => {
  assert.match(youtubeEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), /embed\/dQw4w9WgXcQ\?.*playlist=dQw4w9WgXcQ/);
  assert.match(youtubeEmbed('https://youtu.be/dQw4w9WgXcQ'), /embed\/dQw4w9WgXcQ/);
  assert.match(youtubeEmbed('https://www.youtube.com/playlist?list=PL123abc'), /embed\/videoseries\?.*list=PL123abc/);
  assert.equal(youtubeEmbed('https://evil.example/watch?v=x'), '');
  assert.equal(youtubeEmbed(''), '');
});

test('text link needs a real number', () => {
  assert.equal(smsLink('', 'hi'), '');
  assert.equal(smsLink('(214) 555-0100', 'Hi there'), 'sms:2145550100?&body=Hi%20there');
});

test('config has three slides and a menu link', () => {
  assert.equal(config.slides.length, 3);
  assert.match(config.menuUrl, /^https:\/\//);
});

test('pre-rendered QR codes match the config and decode to the same matrix', async () => {
  const { encode } = await import('../scripts/build-qr.mjs');
  const { qrSvg } = await import('../public/js/logic.mjs');
  const qr = JSON.parse(readFileSync(new URL('../public/qr.json', import.meta.url)));
  assert.deepEqual(qr.menu, encode(config.menuUrl), 'run npm run qr after editing config.json');
  const svg = qrSvg(qr.menu);
  const dark = qr.menu.hex.split('').reduce((n, h) => n + parseInt(h, 16).toString(2).split('1').length - 1, 0);
  assert.equal(svg.split('h1v1').length - 1, dark);
});
