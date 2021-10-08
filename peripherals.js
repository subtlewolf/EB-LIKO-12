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


function exposeAPI(target, props) {
  if (!target.exposed) {
    target.exposed = {}
  }
  if (target.expose) {
    for (const methodName of target.expose) {
      let value = target[methodName];
      if (typeof value === 'function') {
        value = value.bind(target);
      }
      target.exposed[methodName] = value;
    }
  }
}


export class PeripheralStore {
  expose = ['get', 'getIds', 'getType', 'pullEvent'];
  constructor() {
    this.nextId = 0;
    this.byId = new Map();
    this.byType = new Map();
    this.requestQueue = [];
    this.eventQueue = [];
    exposeAPI(this);
  }
  get(typeName) {
    return this.byId.get(this.byType.get(typeName));
  }
  getIds() {
    return [...this.byId.keys()];
  }
  getType(peripheralId) {
    return this.byId.get(peripheralId).typeName;
  }
  pullEvent (passive) {
    const event = this.eventQueue.shift();
    if (event) {
      return new Promise((resolve, reject) => resolve(event));
    } else if (passive) {
      return new Promise((resolve, reject) => resolve(null));
    } else {
      return new Promise((resolve, reject) => {
        this.requestQueue.push({resolve: resolve, reject: reject})
      });
    }
  }
  pushEvent (peripheralId, name, data) {
    const event = {peripheralId: peripheralId, name: name, data: data};
    const request = this.requestQueue.shift();
    if (request) {
      request.resolve(event);
    } else {
      this.eventQueue.push(event);
    }
  }
  mount (peripheral) {
    exposeAPI(peripheral);
    const peripheralId = this.nextId;
    this.nextId += 1;
    peripheral.dispatch = this.pushEvent.bind(this, peripheralId);
    peripheral.start();
    this.byId.set(peripheralId, peripheral.exposed);
    this.byType.set(peripheral.typeName, peripheralId);
    this.pushEvent(peripheralId, 'mount');
  }
  unmount (peripheralId) {
    const peripheral = this.peripherals.get(peripheralId);
    if (peripheral) {
      this.peripherals.delete(peripheralId);
      this.byName.delete(peripheral.typeName);      
      peripheral.stop();
      peripheral.dispatch = () => {};
      this.pushEvent(peripheralId, 'unmount');
    }
  }
}

export class Screen {
  width = 192;
  height = 128;
  constructor(screenElement, scale=1) {
    this.scale = 1;
    this.screenElement = screenElement;
    this.setScaleStyle(screenElement);
    window.addEventListener('resize', this.resizeHandler.bind(this));
  }
  createCanvasContext() {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    this.setScaleStyle(canvas);
    this.screenElement.appendChild(canvas);
    return canvas.getContext('2d');
  }
  setScaleStyle(element) {
    element.style.width = `${this.width*this.scale}px`;
    element.style.height = `${this.height*this.scale}px`;
  }
  setScale(scale) {
    if (scale > 0 && this.scale !== scale) {
      this.scale = scale;
      this.setScaleStyle(this.screenElement);
      for (const el of this.screenElement.children) {
        this.setScaleStyle(el);
      }
    }
  }
  resizeHandler() {
    const parentElement = this.screenElement.parentElement;
    this.setScale(Math.min(Math.trunc(parentElement.clientWidth / this.width),
                           Math.trunc(parentElement.clientHeight / this.height)));
  }
}

function byteToHex(byte) {
  return byte.toString(16).padStart(2);
}

export class Palette {
  #transparent = 0;
  constructor(colors) {
    this.active = 0;
    this.colors = new Uint32Array(colors.length);
    this.rgba = new Uint8ClampedArray(this.colors.buffer);
    this.rgba.fill(255);
    for (let i=0; i<colors.length; i++) {
      this.setHex(i, colors[i]);
    }
    this.rgba[3] = 0;
  }
  get transparent() {
    return this.#transparent;
  }
  set transparent(colorId) {
    let color = this.get(this.transparent);
    color[3] = 255;
    color = this.get(colorId);
    color[3] = 0;
  }
  getRGB(colorId) {
    if (colorId === undefined) {
      colorId = this.active;
    }
    const i = colorId * 4;
    return this.rgba.slice(i, i+3);
  }
  setRGB(colorId, r, g, b) {
    const i = colorId * 4;
    this.rgba[i] = r;
    this.rgba[i+1] = g;
    this.rgba[i+2] = b;
  }
  setHex(colorId, hexColor) {
    if (colorId === undefined) {
      colorId = this.active;
    }
    this.setRGB(colorId, parseInt(hexColor.slice(1, 3), 16),
                         parseInt(hexColor.slice(3, 5), 16),
                         parseInt(hexColor.slice(5, 7), 16));
  }
  getHex(colorId) {
    const rgb = this.getRGB(colorId);
    return `#${byteToHex(rgb[0])}${byteToHex(rgb[1])}${byteToHex(rgb[2])}`
  }
}

class IndexedImage extends ImageData {
  constructor(width, height, palette, arrayLike) {
    super(width, height);
    this.palette = palette;
    this.rosetta = new Uint32Array(this.data.buffer);
    if (arrayLike && arrayLike.length === width * height) {
        this.indexed = Uint8ClampedArray.from(arrayLike);
        this.paste(this);
    } else {
      this.indexed = new Uint8ClampedArray(width * height);
      this.data.fill(palette.transparent)
    }
  }
  clear(colorId) {
    this.indexed.fill(colorId);
    this.rosetta.fill(this.palette.colors[colorId]);
    this.dirty = {x: 0, y: 0, width: this.width, height: this.height};
  }
  point(x, y, colorId) {
    if (colorId === undefined) {
      colorId = this.palette.active;
    }
    const i = y*this.width + x;
    this.indexed[i] = colorId;
    this.rosetta[i] = this.palette.colors[colorId];
    this.setDirty(x, y, 1, 1);
  }
  rectangle(x, y, width, height, filled, colorId) {
    if (colorId === undefined) {
      colorId = this.palette.active;
    }
    const rowWidth = this.width;
    const indexed = this.indexed;
    const rosetta = this.rosetta;
    const color = this.palette.colors[colorId];
    const lastX = x + width;
    const lastY = y + height;
    if (filled) {
      for(let i=y;i<lastY;i++) {
        const offset = i*rowWidth;
        for (let j=x;j<lastX;j++) {
          indexed[offset+j] = colorId;
          rosetta[offset+j] = color;
        }
      }
    } else {
      const offsetFirst = y*rowWidth;
      const offsetLast = lastY*rowWidth;

      for (let offset=offsetFirst;offset<offsetLast;offset+=rowWidth) {
        indexed[offset + x] = colorId;
        indexed[offset + lastX - 1] = colorId;
        rosetta[offset + x] = color;
        rosetta[offset + lastX - 1] = color;
      }
      for(let i=x;i<lastX;i++) {
        indexed[offsetFirst + i] = colorId;
        indexed[offsetLast - rowWidth + i] = colorId;
        rosetta[offsetFirst + i] = color;
        rosetta[offsetLast - rowWidth + i] = color;
      }
    }
    this.setDirty(x, y, width, height);
  }
  paste(image, x=0, y=0, dirtyX=0, dirtyY=0, dirtyWidth, dirtyHeight) {
    if (dirtyWidth === undefined) {
      dirtyWidth = image.width;
    }
    if (dirtyHeight === undefined) {
      dirtyHeight = image.height;
    }
    const width = Math.min(this.width - x, image.width - dirtyX, dirtyWidth);
    const colors = this.palette.colors;
    const height = Math.min(this.height - y, image.height - dirtyY, dirtyHeight);
    const source = image.indexed;
    const target = this.indexed;
    const rosetta = this.rosetta;
    const transparent = this.palette.transparent;
    for(let i=0;i<height;i++) {
      const sourceOffset = (dirtyY + i) * image.height;
      const targetoffset = (y + i) * this.width;
      for (let j=0;j<width;j++) {
        const colorId = (source[sourceOffset+dirtyX+j])
        if (colorId !== transparent) {
          target[targetoffset+x+j] = colorId;
          rosetta[targetoffset+x+j] = colors[colorId];
        }
      }
    }
    this.setDirty(x, y, width, height);
  }
  setDirty(x, y, width, height) {
    if (!this.dirty) {
      this.dirty = {x: x, y: y, width: width, height: height}; 
    } else {
      if (x < this.dirty.x) {
        this.dirty.x = x;
      }
      if (y < this.dirty.y) {
        this.dirty.y = y;
      }
      if (width > this.dirty.width) {
        this.dirty.width = width;
      }
      if (height > this.dirty.height) {
        this.dirty.height = height;
      }
    }
  }
}

const crossCursor = "00070000" + "00272000" + "02000200" + "77000770" +
                    "02000200" + "00272000" + "00070000" + "00000000"


class Cursor extends IndexedImage {
  exposed = ['paste', 'draw', 'clear'];
  #offsetX;
  #offsetY;
  #offsetWidth;
  #offsetHeight;
  constructor(context, palette) {
    super(8, 8, palette, crossCursor)
    this.x = 0;
    this.y = 0;
    this.offsetX = 3;
    this.offsetY = 3;
    this.context = context;
    exposeAPI(this);
  }
  get offsetX() {
    return this.#offsetX;
  }
  set offsetX(value) {
    this.#offsetWidth = this.width + value;
    return this.#offsetX = value;
  }
  get offsetY() {
    return this.#offsetY;
  }
  set offsetY(value) {
    this.#offsetHeight = this.height + value;
    return this.#offsetY = value;
  }
  draw(x, y) {
    this.clear()
    x -= this.#offsetX;
    y -= this.#offsetY;
    this.context.putImageData(this, x, y);
    this.x = x;
    this.y = y;
  }
  clear() {
    this.context.clearRect(this.x, this.y,
                           this.#offsetWidth, this.#offsetHeight);
  }
}

export class Display extends IndexedImage {
  typeName = 'display';
  expose = ['typeName', 'clear', 'cursor', 'point', 'rectangle'];
  constructor(screen, palette) {
    super(screen.width, screen.height, palette);
    screen.resizeHandler();
    this.screen = screen;
    this.screen.screenElement.style.backgroundColor = this.palette.getHex(0);
    this.context = screen.createCanvasContext();
    this.cursor = new Cursor(screen.createCanvasContext(), this.palette);
    exposeAPI(this);
  }
  refresh(timestamp) {
    if (this.dirty) {
      this.context.putImageData(this, 0, 0,
                                      this.dirty.x, this.dirty.y,
                                      this.dirty.width, this.dirty.height);
      this.dirty = false;
    }
    this.frameId = window.requestAnimationFrame(this.refresh);
  }
  start() {
    this.refresh = this.refresh.bind(this);
    this.frameId = window.requestAnimationFrame(this.refresh);
    this.screen.screenElement.style.cursor = 'none';
  }
  stop() {
    window.cancelAnimationFrame(this.frameId) 
  }
  dispatch() {}
}

export class ScreenMouse {
  typeName = 'mouse'; 
  constructor(screen) {
    this.screen = screen;
    this.x;
    this.y;
  }
  mouseMoveHandler(event) {
    this.x = Math.trunc(event.offsetX / this.screen.scale);
    this.y = Math.trunc(event.offsetY / this.screen.scale);
    if (this.x >= this.screen.width) {
      this.x = this.screen.width - 1;
    }
    if (this.y >= this.screen.height) {
      this.y = this.screen.height - 1;
    }
    this.dispatch("mousemove", {x: this.x, y: this.y});
  }  
  start() {
    this.screen.screenElement.addEventListener(
      'mousemove', this.mouseMoveHandler.bind(this)
    );
  }
  stop() {}
  dispatch() {}
}
