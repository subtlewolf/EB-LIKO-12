/*

Copyright 2021 Artis Rozentāls

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

import { PeripheralStore, Screen, Palette, Display, ScreenMouse } from './peripherals.js';

const defaultColors = [
  '#050506', // 0  Black
  '#192739', // 1  Dark Blue
  '#551823', // 2  Maroon
  '#074c35', // 3  Dark Green
  '#885135', // 4  Brown
  '#45454c', // 5  Dark grey
  '#908f88', // 6  Light grey
  '#fffbe8', // 7  White
  '#b60a04', // 8  Red
  '#ff6e11', // 9  Orange
  '#ffec62', // 10 Yellow
  '#7aa143', // 11 Green
  '#8bb6d2', // 12 Cyan
  '#5a45b4', // 13 Blue
  '#f06391', // 14 Pink
  '#f4be8b', // 15 Tan
];

const peripheralStore = new PeripheralStore();
window.peripherals = peripheralStore.exposed;
const palette = new Palette(defaultColors);
const screen = new Screen(document.getElementById('screen'));
const display = new Display(screen, palette);
peripheralStore.mount(display);
peripheralStore.mount(new ScreenMouse(screen));

async function updateCursor(peripherals) {
  const cursor = peripherals.get('display').cursor;
  while (true) {
    const event = await peripherals.pullEvent();
    if (event.name === 'mousemove') {
      cursor.draw(event.data.x, event.data.y);
    }
  }
}

display.clear(6);
updateCursor(peripherals);
for (let i=0;i<8;i++) {
  for (let j=0;j<12;j++) {
    if ((i + j) % 2) {
      display.rectangle(j*16, i*16, 16, 16, true, 5);
    }
  }
}

const shape = display.image(8, 8, "00000000" + "07000000" +
                                  "07700000" + "07770000" +
                                  "07798000" + "07988800" +
                                  "09888880" + "00000000")

for (let i=0;i<8;i++) {
  display.blit(shape, i, i*8, 0, 8, 8);
  display.blit(shape, display.clockWiseFlip[i], i*8, 8, 8, 8);
}
