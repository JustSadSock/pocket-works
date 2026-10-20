var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// apps/katana-echo/node_modules/seedrandom/lib/alea.js
var require_alea = __commonJS({
  "apps/katana-echo/node_modules/seedrandom/lib/alea.js"(exports, module) {
    (function(global, module2, define2) {
      function Alea(seed) {
        var me = this, mash = Mash();
        me.next = function() {
          var t = 2091639 * me.s0 + me.c * 23283064365386963e-26;
          me.s0 = me.s1;
          me.s1 = me.s2;
          return me.s2 = t - (me.c = t | 0);
        };
        me.c = 1;
        me.s0 = mash(" ");
        me.s1 = mash(" ");
        me.s2 = mash(" ");
        me.s0 -= mash(seed);
        if (me.s0 < 0) {
          me.s0 += 1;
        }
        me.s1 -= mash(seed);
        if (me.s1 < 0) {
          me.s1 += 1;
        }
        me.s2 -= mash(seed);
        if (me.s2 < 0) {
          me.s2 += 1;
        }
        mash = null;
      }
      function copy2(f, t) {
        t.c = f.c;
        t.s0 = f.s0;
        t.s1 = f.s1;
        t.s2 = f.s2;
        return t;
      }
      function impl(seed, opts) {
        var xg = new Alea(seed), state = opts && opts.state, prng = xg.next;
        prng.int32 = function() {
          return xg.next() * 4294967296 | 0;
        };
        prng.double = function() {
          return prng() + (prng() * 2097152 | 0) * 11102230246251565e-32;
        };
        prng.quick = prng;
        if (state) {
          if (typeof state == "object") copy2(state, xg);
          prng.state = function() {
            return copy2(xg, {});
          };
        }
        return prng;
      }
      function Mash() {
        var n = 4022871197;
        var mash = function(data) {
          data = String(data);
          for (var i = 0; i < data.length; i++) {
            n += data.charCodeAt(i);
            var h = 0.02519603282416938 * n;
            n = h >>> 0;
            h -= n;
            h *= n;
            n = h >>> 0;
            h -= n;
            n += h * 4294967296;
          }
          return (n >>> 0) * 23283064365386963e-26;
        };
        return mash;
      }
      if (module2 && module2.exports) {
        module2.exports = impl;
      } else if (define2 && define2.amd) {
        define2(function() {
          return impl;
        });
      } else {
        this.alea = impl;
      }
    })(
      exports,
      typeof module == "object" && module,
      // present in node.js
      typeof define == "function" && define
      // present with an AMD loader
    );
  }
});

// apps/katana-echo/node_modules/seedrandom/lib/xor128.js
var require_xor128 = __commonJS({
  "apps/katana-echo/node_modules/seedrandom/lib/xor128.js"(exports, module) {
    (function(global, module2, define2) {
      function XorGen(seed) {
        var me = this, strseed = "";
        me.x = 0;
        me.y = 0;
        me.z = 0;
        me.w = 0;
        me.next = function() {
          var t = me.x ^ me.x << 11;
          me.x = me.y;
          me.y = me.z;
          me.z = me.w;
          return me.w ^= me.w >>> 19 ^ t ^ t >>> 8;
        };
        if (seed === (seed | 0)) {
          me.x = seed;
        } else {
          strseed += seed;
        }
        for (var k = 0; k < strseed.length + 64; k++) {
          me.x ^= strseed.charCodeAt(k) | 0;
          me.next();
        }
      }
      function copy2(f, t) {
        t.x = f.x;
        t.y = f.y;
        t.z = f.z;
        t.w = f.w;
        return t;
      }
      function impl(seed, opts) {
        var xg = new XorGen(seed), state = opts && opts.state, prng = function() {
          return (xg.next() >>> 0) / 4294967296;
        };
        prng.double = function() {
          do {
            var top = xg.next() >>> 11, bot = (xg.next() >>> 0) / 4294967296, result = (top + bot) / (1 << 21);
          } while (result === 0);
          return result;
        };
        prng.int32 = xg.next;
        prng.quick = prng;
        if (state) {
          if (typeof state == "object") copy2(state, xg);
          prng.state = function() {
            return copy2(xg, {});
          };
        }
        return prng;
      }
      if (module2 && module2.exports) {
        module2.exports = impl;
      } else if (define2 && define2.amd) {
        define2(function() {
          return impl;
        });
      } else {
        this.xor128 = impl;
      }
    })(
      exports,
      typeof module == "object" && module,
      // present in node.js
      typeof define == "function" && define
      // present with an AMD loader
    );
  }
});

// apps/katana-echo/node_modules/seedrandom/lib/xorwow.js
var require_xorwow = __commonJS({
  "apps/katana-echo/node_modules/seedrandom/lib/xorwow.js"(exports, module) {
    (function(global, module2, define2) {
      function XorGen(seed) {
        var me = this, strseed = "";
        me.next = function() {
          var t = me.x ^ me.x >>> 2;
          me.x = me.y;
          me.y = me.z;
          me.z = me.w;
          me.w = me.v;
          return (me.d = me.d + 362437 | 0) + (me.v = me.v ^ me.v << 4 ^ (t ^ t << 1)) | 0;
        };
        me.x = 0;
        me.y = 0;
        me.z = 0;
        me.w = 0;
        me.v = 0;
        if (seed === (seed | 0)) {
          me.x = seed;
        } else {
          strseed += seed;
        }
        for (var k = 0; k < strseed.length + 64; k++) {
          me.x ^= strseed.charCodeAt(k) | 0;
          if (k == strseed.length) {
            me.d = me.x << 10 ^ me.x >>> 4;
          }
          me.next();
        }
      }
      function copy2(f, t) {
        t.x = f.x;
        t.y = f.y;
        t.z = f.z;
        t.w = f.w;
        t.v = f.v;
        t.d = f.d;
        return t;
      }
      function impl(seed, opts) {
        var xg = new XorGen(seed), state = opts && opts.state, prng = function() {
          return (xg.next() >>> 0) / 4294967296;
        };
        prng.double = function() {
          do {
            var top = xg.next() >>> 11, bot = (xg.next() >>> 0) / 4294967296, result = (top + bot) / (1 << 21);
          } while (result === 0);
          return result;
        };
        prng.int32 = xg.next;
        prng.quick = prng;
        if (state) {
          if (typeof state == "object") copy2(state, xg);
          prng.state = function() {
            return copy2(xg, {});
          };
        }
        return prng;
      }
      if (module2 && module2.exports) {
        module2.exports = impl;
      } else if (define2 && define2.amd) {
        define2(function() {
          return impl;
        });
      } else {
        this.xorwow = impl;
      }
    })(
      exports,
      typeof module == "object" && module,
      // present in node.js
      typeof define == "function" && define
      // present with an AMD loader
    );
  }
});

// apps/katana-echo/node_modules/seedrandom/lib/xorshift7.js
var require_xorshift7 = __commonJS({
  "apps/katana-echo/node_modules/seedrandom/lib/xorshift7.js"(exports, module) {
    (function(global, module2, define2) {
      function XorGen(seed) {
        var me = this;
        me.next = function() {
          var X = me.x, i = me.i, t, v, w;
          t = X[i];
          t ^= t >>> 7;
          v = t ^ t << 24;
          t = X[i + 1 & 7];
          v ^= t ^ t >>> 10;
          t = X[i + 3 & 7];
          v ^= t ^ t >>> 3;
          t = X[i + 4 & 7];
          v ^= t ^ t << 7;
          t = X[i + 7 & 7];
          t = t ^ t << 13;
          v ^= t ^ t << 9;
          X[i] = v;
          me.i = i + 1 & 7;
          return v;
        };
        function init(me2, seed2) {
          var j, w, X = [];
          if (seed2 === (seed2 | 0)) {
            w = X[0] = seed2;
          } else {
            seed2 = "" + seed2;
            for (j = 0; j < seed2.length; ++j) {
              X[j & 7] = X[j & 7] << 15 ^ seed2.charCodeAt(j) + X[j + 1 & 7] << 13;
            }
          }
          while (X.length < 8) X.push(0);
          for (j = 0; j < 8 && X[j] === 0; ++j) ;
          if (j == 8) w = X[7] = -1;
          else w = X[j];
          me2.x = X;
          me2.i = 0;
          for (j = 256; j > 0; --j) {
            me2.next();
          }
        }
        init(me, seed);
      }
      function copy2(f, t) {
        t.x = f.x.slice();
        t.i = f.i;
        return t;
      }
      function impl(seed, opts) {
        if (seed == null) seed = +/* @__PURE__ */ new Date();
        var xg = new XorGen(seed), state = opts && opts.state, prng = function() {
          return (xg.next() >>> 0) / 4294967296;
        };
        prng.double = function() {
          do {
            var top = xg.next() >>> 11, bot = (xg.next() >>> 0) / 4294967296, result = (top + bot) / (1 << 21);
          } while (result === 0);
          return result;
        };
        prng.int32 = xg.next;
        prng.quick = prng;
        if (state) {
          if (state.x) copy2(state, xg);
          prng.state = function() {
            return copy2(xg, {});
          };
        }
        return prng;
      }
      if (module2 && module2.exports) {
        module2.exports = impl;
      } else if (define2 && define2.amd) {
        define2(function() {
          return impl;
        });
      } else {
        this.xorshift7 = impl;
      }
    })(
      exports,
      typeof module == "object" && module,
      // present in node.js
      typeof define == "function" && define
      // present with an AMD loader
    );
  }
});

// apps/katana-echo/node_modules/seedrandom/lib/xor4096.js
var require_xor4096 = __commonJS({
  "apps/katana-echo/node_modules/seedrandom/lib/xor4096.js"(exports, module) {
    (function(global, module2, define2) {
      function XorGen(seed) {
        var me = this;
        me.next = function() {
          var w = me.w, X = me.X, i = me.i, t, v;
          me.w = w = w + 1640531527 | 0;
          v = X[i + 34 & 127];
          t = X[i = i + 1 & 127];
          v ^= v << 13;
          t ^= t << 17;
          v ^= v >>> 15;
          t ^= t >>> 12;
          v = X[i] = v ^ t;
          me.i = i;
          return v + (w ^ w >>> 16) | 0;
        };
        function init(me2, seed2) {
          var t, v, i, j, w, X = [], limit = 128;
          if (seed2 === (seed2 | 0)) {
            v = seed2;
            seed2 = null;
          } else {
            seed2 = seed2 + "\0";
            v = 0;
            limit = Math.max(limit, seed2.length);
          }
          for (i = 0, j = -32; j < limit; ++j) {
            if (seed2) v ^= seed2.charCodeAt((j + 32) % seed2.length);
            if (j === 0) w = v;
            v ^= v << 10;
            v ^= v >>> 15;
            v ^= v << 4;
            v ^= v >>> 13;
            if (j >= 0) {
              w = w + 1640531527 | 0;
              t = X[j & 127] ^= v + w;
              i = 0 == t ? i + 1 : 0;
            }
          }
          if (i >= 128) {
            X[(seed2 && seed2.length || 0) & 127] = -1;
          }
          i = 127;
          for (j = 4 * 128; j > 0; --j) {
            v = X[i + 34 & 127];
            t = X[i = i + 1 & 127];
            v ^= v << 13;
            t ^= t << 17;
            v ^= v >>> 15;
            t ^= t >>> 12;
            X[i] = v ^ t;
          }
          me2.w = w;
          me2.X = X;
          me2.i = i;
        }
        init(me, seed);
      }
      function copy2(f, t) {
        t.i = f.i;
        t.w = f.w;
        t.X = f.X.slice();
        return t;
      }
      ;
      function impl(seed, opts) {
        if (seed == null) seed = +/* @__PURE__ */ new Date();
        var xg = new XorGen(seed), state = opts && opts.state, prng = function() {
          return (xg.next() >>> 0) / 4294967296;
        };
        prng.double = function() {
          do {
            var top = xg.next() >>> 11, bot = (xg.next() >>> 0) / 4294967296, result = (top + bot) / (1 << 21);
          } while (result === 0);
          return result;
        };
        prng.int32 = xg.next;
        prng.quick = prng;
        if (state) {
          if (state.X) copy2(state, xg);
          prng.state = function() {
            return copy2(xg, {});
          };
        }
        return prng;
      }
      if (module2 && module2.exports) {
        module2.exports = impl;
      } else if (define2 && define2.amd) {
        define2(function() {
          return impl;
        });
      } else {
        this.xor4096 = impl;
      }
    })(
      exports,
      // window object or global
      typeof module == "object" && module,
      // present in node.js
      typeof define == "function" && define
      // present with an AMD loader
    );
  }
});

// apps/katana-echo/node_modules/seedrandom/lib/tychei.js
var require_tychei = __commonJS({
  "apps/katana-echo/node_modules/seedrandom/lib/tychei.js"(exports, module) {
    (function(global, module2, define2) {
      function XorGen(seed) {
        var me = this, strseed = "";
        me.next = function() {
          var b = me.b, c = me.c, d = me.d, a = me.a;
          b = b << 25 ^ b >>> 7 ^ c;
          c = c - d | 0;
          d = d << 24 ^ d >>> 8 ^ a;
          a = a - b | 0;
          me.b = b = b << 20 ^ b >>> 12 ^ c;
          me.c = c = c - d | 0;
          me.d = d << 16 ^ c >>> 16 ^ a;
          return me.a = a - b | 0;
        };
        me.a = 0;
        me.b = 0;
        me.c = 2654435769 | 0;
        me.d = 1367130551;
        if (seed === Math.floor(seed)) {
          me.a = seed / 4294967296 | 0;
          me.b = seed | 0;
        } else {
          strseed += seed;
        }
        for (var k = 0; k < strseed.length + 20; k++) {
          me.b ^= strseed.charCodeAt(k) | 0;
          me.next();
        }
      }
      function copy2(f, t) {
        t.a = f.a;
        t.b = f.b;
        t.c = f.c;
        t.d = f.d;
        return t;
      }
      ;
      function impl(seed, opts) {
        var xg = new XorGen(seed), state = opts && opts.state, prng = function() {
          return (xg.next() >>> 0) / 4294967296;
        };
        prng.double = function() {
          do {
            var top = xg.next() >>> 11, bot = (xg.next() >>> 0) / 4294967296, result = (top + bot) / (1 << 21);
          } while (result === 0);
          return result;
        };
        prng.int32 = xg.next;
        prng.quick = prng;
        if (state) {
          if (typeof state == "object") copy2(state, xg);
          prng.state = function() {
            return copy2(xg, {});
          };
        }
        return prng;
      }
      if (module2 && module2.exports) {
        module2.exports = impl;
      } else if (define2 && define2.amd) {
        define2(function() {
          return impl;
        });
      } else {
        this.tychei = impl;
      }
    })(
      exports,
      typeof module == "object" && module,
      // present in node.js
      typeof define == "function" && define
      // present with an AMD loader
    );
  }
});

// (disabled):crypto
var require_crypto = __commonJS({
  "(disabled):crypto"() {
  }
});

// apps/katana-echo/node_modules/seedrandom/seedrandom.js
var require_seedrandom = __commonJS({
  "apps/katana-echo/node_modules/seedrandom/seedrandom.js"(exports, module) {
    (function(global, pool, math) {
      var width = 256, chunks = 6, digits = 52, rngname = "random", startdenom = math.pow(width, chunks), significance = math.pow(2, digits), overflow = significance * 2, mask = width - 1, nodecrypto;
      function seedrandom(seed, options, callback) {
        var key = [];
        options = options == true ? { entropy: true } : options || {};
        var shortseed = mixkey(flatten(
          options.entropy ? [seed, tostring(pool)] : seed == null ? autoseed() : seed,
          3
        ), key);
        var arc4 = new ARC4(key);
        var prng = function() {
          var n = arc4.g(chunks), d = startdenom, x = 0;
          while (n < significance) {
            n = (n + x) * width;
            d *= width;
            x = arc4.g(1);
          }
          while (n >= overflow) {
            n /= 2;
            d /= 2;
            x >>>= 1;
          }
          return (n + x) / d;
        };
        prng.int32 = function() {
          return arc4.g(4) | 0;
        };
        prng.quick = function() {
          return arc4.g(4) / 4294967296;
        };
        prng.double = prng;
        mixkey(tostring(arc4.S), pool);
        return (options.pass || callback || function(prng2, seed2, is_math_call, state) {
          if (state) {
            if (state.S) {
              copy2(state, arc4);
            }
            prng2.state = function() {
              return copy2(arc4, {});
            };
          }
          if (is_math_call) {
            math[rngname] = prng2;
            return seed2;
          } else return prng2;
        })(
          prng,
          shortseed,
          "global" in options ? options.global : this == math,
          options.state
        );
      }
      function ARC4(key) {
        var t, keylen = key.length, me = this, i = 0, j = me.i = me.j = 0, s = me.S = [];
        if (!keylen) {
          key = [keylen++];
        }
        while (i < width) {
          s[i] = i++;
        }
        for (i = 0; i < width; i++) {
          s[i] = s[j = mask & j + key[i % keylen] + (t = s[i])];
          s[j] = t;
        }
        (me.g = function(count) {
          var t2, r = 0, i2 = me.i, j2 = me.j, s2 = me.S;
          while (count--) {
            t2 = s2[i2 = mask & i2 + 1];
            r = r * width + s2[mask & (s2[i2] = s2[j2 = mask & j2 + t2]) + (s2[j2] = t2)];
          }
          me.i = i2;
          me.j = j2;
          return r;
        })(width);
      }
      function copy2(f, t) {
        t.i = f.i;
        t.j = f.j;
        t.S = f.S.slice();
        return t;
      }
      ;
      function flatten(obj, depth) {
        var result = [], typ = typeof obj, prop;
        if (depth && typ == "object") {
          for (prop in obj) {
            try {
              result.push(flatten(obj[prop], depth - 1));
            } catch (e) {
            }
          }
        }
        return result.length ? result : typ == "string" ? obj : obj + "\0";
      }
      function mixkey(seed, key) {
        var stringseed = seed + "", smear, j = 0;
        while (j < stringseed.length) {
          key[mask & j] = mask & (smear ^= key[mask & j] * 19) + stringseed.charCodeAt(j++);
        }
        return tostring(key);
      }
      function autoseed() {
        try {
          var out;
          if (nodecrypto && (out = nodecrypto.randomBytes)) {
            out = out(width);
          } else {
            out = new Uint8Array(width);
            (global.crypto || global.msCrypto).getRandomValues(out);
          }
          return tostring(out);
        } catch (e) {
          var browser = global.navigator, plugins = browser && browser.plugins;
          return [+/* @__PURE__ */ new Date(), global, plugins, global.screen, tostring(pool)];
        }
      }
      function tostring(a) {
        return String.fromCharCode.apply(0, a);
      }
      mixkey(math.random(), pool);
      if (typeof module == "object" && module.exports) {
        module.exports = seedrandom;
        try {
          nodecrypto = require_crypto();
        } catch (ex) {
        }
      } else if (typeof define == "function" && define.amd) {
        define(function() {
          return seedrandom;
        });
      } else {
        math["seed" + rngname] = seedrandom;
      }
    })(
      // global: `self` in browsers (including strict mode and web workers),
      // otherwise `this` in Node and other environments
      typeof self !== "undefined" ? self : exports,
      [],
      // pool: entropy pool starts empty
      Math
      // math: package containing random, pow, and seedrandom
    );
  }
});

// apps/katana-echo/node_modules/seedrandom/index.js
var require_seedrandom2 = __commonJS({
  "apps/katana-echo/node_modules/seedrandom/index.js"(exports, module) {
    var alea = require_alea();
    var xor128 = require_xor128();
    var xorwow = require_xorwow();
    var xorshift7 = require_xorshift7();
    var xor4096 = require_xor4096();
    var tychei = require_tychei();
    var sr = require_seedrandom();
    sr.alea = alea;
    sr.xor128 = xor128;
    sr.xorwow = xorwow;
    sr.xorshift7 = xorshift7;
    sr.xor4096 = xor4096;
    sr.tychei = tychei;
    module.exports = sr;
  }
});

// apps/katana-echo/server/game/map.cjs
var require_map = __commonJS({
  "apps/katana-echo/server/game/map.cjs"(exports, module) {
    var seedrandom = require_seedrandom2();
    function rectCollides(a, b) {
      return !(a.x + a.w / 2 < b.x - b.w / 2 || a.x - a.w / 2 > b.x + b.w / 2 || a.y + a.h / 2 < b.y - b.h / 2 || a.y - a.h / 2 > b.y + b.h / 2);
    }
    function generateMap(seed) {
      const rng = seedrandom(seed);
      const walls = [];
      const bounds = { w: 22, h: 14 };
      walls.push({ id: "lane-top", x: 0, y: -2.2, w: bounds.w - 4, h: 0.8 });
      walls.push({ id: "lane-bottom", x: 0, y: 2.2, w: bounds.w - 4, h: 0.8 });
      let attempts = 0;
      let placed = 0;
      const target = 10;
      while (placed < target && attempts < 80) {
        attempts++;
        const w = 1.1 + rng() * 1.2;
        const h = 0.9 + rng() * 1.4;
        const x = rng() * (bounds.w - 6) - (bounds.w - 6) / 2;
        const y = rng() * (bounds.h - 6) - (bounds.h - 6) / 2;
        const rect = { id: `b${placed}`, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), w: Number(w.toFixed(2)), h: Number(h.toFixed(2)) };
        if (walls.some((w2) => rectCollides(w2, rect))) continue;
        walls.push(rect);
        placed++;
      }
      const pockets = [
        { id: "pocket-left", x: -bounds.w / 2 + 3, y: bounds.h / 2 - 2, w: 2.2, h: 1.4 },
        { id: "pocket-right", x: bounds.w / 2 - 3, y: -bounds.h / 2 + 2, w: 2.2, h: 1.4 }
      ];
      return { seed, walls: walls.concat(pockets), bounds };
    }
    module.exports = { generateMap };
  }
});

// apps/katana-echo/server/game/modes.cjs
var require_modes = __commonJS({
  "apps/katana-echo/server/game/modes.cjs"(exports, module) {
    var GHOST_MODES = {
      ECHO_TRAP: "echo-trap",
      SHADOW_TAIL: "shadow-tail",
      CHANNEL_ECHO: "channel-echo"
    };
    function createGhostState(mode) {
      switch (mode) {
        case GHOST_MODES.ECHO_TRAP:
          return { buffer: [], playback: null, cooldown: 0 };
        case GHOST_MODES.SHADOW_TAIL:
          return { buffer: [], delayMs: 5e3, ghostAlive: true, respawnTimer: 0 };
        case GHOST_MODES.CHANNEL_ECHO:
          return { buffer: [], delayMs: 5e3, active: false, energy: 1, regen: 0.15 };
        default:
          return {};
      }
    }
    function updateGhost(player, dt) {
      const { ghostMode, ghost } = player;
      if (!ghostMode) return;
      if (ghostMode === GHOST_MODES.ECHO_TRAP) {
        ghost.cooldown = Math.max(0, ghost.cooldown - dt);
        ghost.buffer.push({ ...player.inputState, timestamp: Date.now() });
        const cutoff = Date.now() - 5e3;
        ghost.buffer = ghost.buffer.filter((f) => f.timestamp >= cutoff);
        if (player.triggers.spawnGhost && ghost.cooldown === 0 && ghost.buffer.length) {
          ghost.playback = ghost.buffer.map((f) => ({ ...f }));
          ghost.cooldown = 8e3;
          player.events.push({ type: "ghostSpawn" });
        }
        if (ghost.playback && ghost.playback.length) {
          const frame = ghost.playback.shift();
          player.ghostInput = frame;
          if (!ghost.playback.length) ghost.playback = null;
        } else {
          player.ghostInput = null;
        }
        player.triggers.spawnGhost = false;
      } else if (ghostMode === GHOST_MODES.SHADOW_TAIL) {
        ghost.buffer.push({ ...player.inputState });
        if (ghost.buffer.length > 300) ghost.buffer.shift();
        if (ghost.buffer.length > 0) {
          player.ghostInput = ghost.buffer[0];
          ghost.buffer.shift();
        }
        ghost.respawnTimer = Math.max(0, ghost.respawnTimer - dt);
      } else if (ghostMode === GHOST_MODES.CHANNEL_ECHO) {
        ghost.buffer.push({ ...player.inputState });
        if (ghost.buffer.length > 300) ghost.buffer.shift();
        if (player.triggers.toggleGhost && ghost.energy > 0) {
          ghost.active = !ghost.active;
          player.triggers.toggleGhost = false;
        }
        if (ghost.active) {
          ghost.energy = Math.max(0, ghost.energy - dt * 35e-5);
          if (ghost.energy === 0) ghost.active = false;
          if (ghost.buffer.length > 0) {
            player.ghostInput = ghost.buffer[0];
            ghost.buffer.shift();
          }
        } else {
          ghost.energy = Math.min(1, ghost.energy + dt * ghost.regen);
          player.ghostInput = null;
        }
      }
    }
    module.exports = { GHOST_MODES, createGhostState, updateGhost };
  }
});

// apps/katana-echo/server/game/protocol.cjs
var require_protocol = __commonJS({
  "apps/katana-echo/server/game/protocol.cjs"(exports, module) {
    var MESSAGE_TYPES = {
      CLIENT_JOIN: "join",
      CLIENT_INPUT: "input",
      CLIENT_READY: "ready",
      SERVER_ROOM: "room",
      SERVER_STATE: "state",
      SERVER_EVENT: "event"
    };
    var EVENTS = {
      ROUND_START: "roundStart",
      ROUND_END: "roundEnd",
      PARRY: "parry",
      KILL: "kill",
      CLASH: "clash"
    };
    module.exports = { MESSAGE_TYPES, EVENTS };
  }
});

// apps/katana-echo/server/game/sim.cjs
var require_sim = __commonJS({
  "apps/katana-echo/server/game/sim.cjs"(exports, module) {
    var nanoid = () => crypto.randomUUID().slice(0, 8);
    var { generateMap } = require_map();
    var { GHOST_MODES, createGhostState } = require_modes();
    var { EVENTS } = require_protocol();
    var TICK_RATE = 1e3 / 60;
    var SNAP_RATE = 1e3 / 20;
    var PLAYER_RADIUS = 0.6;
    function createActorState(x, y) {
      return {
        x,
        y,
        vx: 0,
        vy: 0,
        facing: 0,
        speed: 7,
        dashCooldown: 0,
        attacking: false,
        attackTimer: 0,
        attackPower: 0,
        charge: 0,
        shieldUp: false,
        shieldStrength: 3,
        shieldCooldown: 0,
        parryWindow: 0,
        stagger: 0
      };
    }
    var GameRoom2 = class {
      constructor(roomCode, mode, broadcast) {
        this.id = roomCode;
        this.mode = mode || GHOST_MODES.ECHO_TRAP;
        this.players = /* @__PURE__ */ new Map();
        this.map = generateMap(roomCode);
        this.broadcast = broadcast;
        this.lastSnap = Date.now();
        this.lastUpdate = Date.now();
        this.clock = Date.now();
        this.roundResetAt = null;
      }
      addPlayer(ws, name) {
        const id = nanoid(8);
        const spawnX = this.players.size === 0 ? -4 : 4;
        const player = {
          id,
          name: name || "Ronin",
          ws,
          alive: true,
          ready: false,
          ghostMode: this.mode,
          ghost: createGhostState(this.mode),
          ghostActor: { id: `${id}-g`, ownerId: id, isGhost: true, alive: false, state: createActorState(spawnX, 0) },
          triggers: { spawnGhost: false, toggleGhost: false },
          ghostInput: null,
          events: [],
          inputState: {
            seq: 0,
            dt: 0,
            keys: {},
            mouseAngle: 0,
            lmb: false,
            rmb: false,
            dash: false,
            ghostToggle: false
          },
          state: createActorState(spawnX, 0)
        };
        this.players.set(id, player);
        return player;
      }
      removePlayer(id) {
        this.players.delete(id);
        if (this.players.size === 0) clearInterval(this.interval);
      }
      handleInput(id, payload) {
        const player = this.players.get(id);
        if (!player || !player.alive) return;
        player.inputState = { ...player.inputState, ...payload };
        if (payload.ghostToggle) {
          if (player.ghostMode === GHOST_MODES.ECHO_TRAP) player.triggers.spawnGhost = true;
          if (player.ghostMode === GHOST_MODES.CHANNEL_ECHO) player.triggers.toggleGhost = true;
        }
      }
      markReady(id) {
        const player = this.players.get(id);
        if (player) player.ready = true;
      }
      update() {
        const now = Date.now();
        const dt = Math.min(50, now - this.lastUpdate);
        this.lastUpdate = now;
        this.players.forEach((player) => this.updatePlayer(player, dt));
        this.updateGhostActors(dt);
        this.resolveCombat();
        if (now - this.lastSnap >= SNAP_RATE) {
          this.lastSnap = now;
          this.broadcastState();
        }
      }
      updatePlayer(player, dtMs) {
        if (!player.alive) return;
        this.recordGhostFrame(player, dtMs);
        this.applyInputToActor(player.state, player.inputState, dtMs);
      }
      recordGhostFrame(player, dtMs) {
        const timestamp = this.clock;
        const snapshot = {
          input: { ...player.inputState },
          state: { ...player.state },
          timestamp
        };
        const ghost = player.ghost;
        ghost.buffer.push(snapshot);
        const cutoff = timestamp - 5e3;
        ghost.buffer = ghost.buffer.filter((f) => f.timestamp >= cutoff);
      }
      updateGhostActors(dtMs) {
        this.players.forEach((player) => {
          const ghostState = player.ghost;
          const actor = player.ghostActor;
          if (player.ghostMode === GHOST_MODES.ECHO_TRAP) {
            ghostState.cooldown = Math.max(0, ghostState.cooldown - dtMs);
            if (!actor.alive && player.triggers.spawnGhost && ghostState.cooldown === 0 && ghostState.buffer.length) {
              actor.state = { ...ghostState.buffer[0].state, vx: 0, vy: 0 };
              ghostState.playback = ghostState.buffer.map((f) => ({ ...f }));
              ghostState.cooldown = 8e3;
              actor.alive = true;
            }
            if (actor.alive && ghostState.playback && ghostState.playback.length) {
              const frame = ghostState.playback.shift();
              player.ghostInput = frame.input;
              this.applyInputToActor(actor.state, frame.input, dtMs);
            } else {
              actor.alive = false;
              player.ghostInput = null;
            }
            player.triggers.spawnGhost = false;
          }
          if (player.ghostMode === GHOST_MODES.SHADOW_TAIL) {
            if (ghostState.buffer.length > 300) ghostState.buffer.shift();
            if (!actor.alive && ghostState.buffer.length > 250) {
              actor.alive = true;
              actor.state = { ...ghostState.buffer[0].state, vx: 0, vy: 0 };
            }
            if (actor.alive && ghostState.buffer.length) {
              const frame = ghostState.buffer.shift();
              player.ghostInput = frame.input;
              this.applyInputToActor(actor.state, frame.input, dtMs);
            }
          }
          if (player.ghostMode === GHOST_MODES.CHANNEL_ECHO) {
            if (ghostState.buffer.length > 300) ghostState.buffer.shift();
            if (player.triggers.toggleGhost && ghostState.energy > 0.05) {
              ghostState.active = !ghostState.active;
            }
            player.triggers.toggleGhost = false;
            if (ghostState.active) {
              ghostState.energy = Math.max(0, ghostState.energy - dtMs * 5e-4);
              if (ghostState.energy === 0) ghostState.active = false;
              if (!actor.alive && ghostState.buffer.length > 250) {
                actor.alive = true;
                actor.state = { ...ghostState.buffer[0].state, vx: 0, vy: 0 };
              }
              if (actor.alive && ghostState.buffer.length) {
                const frame = ghostState.buffer.shift();
                player.ghostInput = frame.input;
                this.applyInputToActor(actor.state, frame.input, dtMs);
              }
            } else {
              ghostState.energy = Math.min(1, ghostState.energy + dtMs * ghostState.regen * 1e-3);
              player.ghostInput = null;
              actor.alive = false;
            }
          }
        });
      }
      applyInputToActor(state, input, dtMs) {
        const dt = Math.min(0.05, dtMs / 1e3);
        const move = { x: 0, y: 0 };
        if (input.keys?.w) move.y -= 1;
        if (input.keys?.s) move.y += 1;
        if (input.keys?.a) move.x -= 1;
        if (input.keys?.d) move.x += 1;
        const len = Math.hypot(move.x, move.y) || 1;
        move.x /= len;
        move.y /= len;
        state.facing = Number.isFinite(input.mouseAngle) ? input.mouseAngle : state.facing;
        state.dashCooldown = Math.max(0, state.dashCooldown - dtMs);
        if (input.dash && state.dashCooldown === 0) {
          state.vx += Math.cos(state.facing) * 14;
          state.vy += Math.sin(state.facing) * 14;
          state.dashCooldown = 650;
        }
        const accel = state.stagger > 0 ? 6 : 20;
        state.vx += move.x * accel * dt;
        state.vy += move.y * accel * dt;
        state.vx *= 0.9;
        state.vy *= 0.9;
        const maxSpeed = state.speed || 7;
        const speed = Math.hypot(state.vx, state.vy);
        if (speed > maxSpeed) {
          const scale = maxSpeed / speed;
          state.vx *= scale;
          state.vy *= scale;
        }
        state.x += state.vx * dt;
        state.y += state.vy * dt;
        this.constrainToBounds(state);
        state.shieldCooldown = Math.max(0, state.shieldCooldown - dtMs);
        state.parryWindow = Math.max(0, state.parryWindow - dtMs);
        if (state.stagger > 0) state.stagger = Math.max(0, state.stagger - dtMs);
        if (input.rmb && !state.shieldUp && state.shieldCooldown === 0) {
          state.shieldUp = true;
          state.parryWindow = 200;
          state.shieldStrength = 3;
        }
        if (!input.rmb && state.shieldUp) {
          state.shieldUp = false;
        }
        if (input.lmb) {
          state.charge = Math.min(2200, state.charge + dtMs);
        } else if (state.charge > 0) {
          state.attacking = true;
          state.attackTimer = 230;
          state.attackPower = state.charge;
          state.charge = 0;
        }
        if (state.attacking) {
          state.attackTimer -= dtMs;
          if (state.attackTimer <= 0) {
            state.attacking = false;
            state.attackPower = 0;
          }
        }
      }
      resolveCombat() {
        const entities = [];
        this.players.forEach((p) => {
          if (p.alive) entities.push(p);
          if (p.ghostActor.alive) entities.push(p.ghostActor);
        });
        for (let i = 0; i < entities.length; i++) {
          for (let j = i + 1; j < entities.length; j++) {
            this.resolvePair(entities[i], entities[j]);
          }
        }
      }
      resolvePair(a, b) {
        const dist = Math.hypot(a.state.x - b.state.x, a.state.y - b.state.y);
        const rangeA = 1.3 + (a.state.attackPower || 0) / 2200;
        const rangeB = 1.3 + (b.state.attackPower || 0) / 2200;
        const aSwing = a.state.attacking && dist <= rangeA + PLAYER_RADIUS;
        const bSwing = b.state.attacking && dist <= rangeB + PLAYER_RADIUS;
        if (aSwing && bSwing) {
          this.emitEvent(EVENTS.CLASH, [a, b]);
          a.state.attacking = false;
          b.state.attacking = false;
          a.state.vx -= Math.cos(a.state.facing) * 2;
          b.state.vx -= Math.cos(b.state.facing) * 2;
          return;
        }
        if (aSwing) this.tryHit(a, b);
        if (bSwing) this.tryHit(b, a);
      }
      tryHit(attacker, defender) {
        if (!defender.alive || !attacker.state.attacking) return;
        const dist = Math.hypot(attacker.state.x - defender.state.x, attacker.state.y - defender.state.y);
        if (dist > 2.1) return;
        if (defender.state.shieldUp) {
          if (defender.state.parryWindow > 0) {
            attacker.state.stagger = 400;
            if (!defender.isGhost) defender.events.push({ type: EVENTS.PARRY, target: attacker.id });
            defender.state.shieldUp = false;
            return;
          }
          defender.state.shieldStrength -= attacker.state.attackPower > 2e3 ? 2 : 1;
          if (defender.state.shieldStrength <= 0) {
            defender.state.shieldUp = false;
            defender.state.shieldCooldown = 2e3;
          }
          attacker.state.attacking = false;
          return;
        }
        if (defender.isGhost) {
          defender.alive = false;
          return;
        }
        this.killPlayer(defender, attacker);
      }
      killPlayer(player, killer) {
        if (!player.alive) return;
        player.alive = false;
        player.events.push({ type: EVENTS.KILL, target: player.id, by: killer?.id });
        if (this.isRoundOver()) {
          this.broadcast({ type: EVENTS.ROUND_END, room: this.id });
          this.resetRound();
        }
      }
      isRoundOver() {
        const living = Array.from(this.players.values()).filter((p) => p.alive);
        return living.length <= 1;
      }
      resetRound() {
        if (!this.roundResetAt) this.roundResetAt = this.clock + 600;
      }
      step(dtMs) {
        this.clock += dtMs;
        if (this.roundResetAt) {
          if (this.clock >= this.roundResetAt) {
            this.roundResetAt = null;
            let i = 0;
            for (const p of this.players.values()) {
              p.alive = true;
              p.state = createActorState(i++ === 0 ? -4 : 4, 0);
              p.ghost = createGhostState(p.ghostMode);
              p.ghostActor.alive = false;
              p.ghostInput = null;
            }
            this.broadcast({ type: EVENTS.ROUND_START, room: this.id });
          }
          return;
        }
        for (const p of this.players.values()) this.updatePlayer(p, dtMs);
        this.updateGhostActors(dtMs);
        this.resolveCombat();
      }
      broadcastState() {
        const payload = {
          room: this.id,
          map: this.map,
          players: Array.from(this.players.values()).map((p) => ({
            id: p.id,
            name: p.name,
            alive: p.alive,
            ghostMode: p.ghostMode,
            state: p.state,
            ghost: p.ghost,
            ghostInput: p.ghostInput,
            ghostActor: p.ghostActor,
            events: p.events.splice(0)
          }))
        };
        this.broadcast({ type: "state", data: payload });
      }
      emitEvent(type, targets) {
        targets.forEach((p) => p.events && p.events.push({ type }));
      }
      constrainToBounds(state) {
        const halfW = this.map.bounds.w / 2 - PLAYER_RADIUS;
        const halfH = this.map.bounds.h / 2 - PLAYER_RADIUS;
        state.x = Math.min(halfW, Math.max(-halfW, state.x));
        state.y = Math.min(halfH, Math.max(-halfH, state.y));
      }
    };
    module.exports = { GameRoom: GameRoom2, TICK_RATE };
  }
});

// apps/katana-echo/server/entry.js
var import_sim = __toESM(require_sim(), 1);
var { GameRoom } = import_sim.default;

/* Katana Echo v0.2: authoritative combat, collision and responsive movement.
   Kept alongside the existing simulation for older serialized rooms. */
function improveKatanaCombat(GameRoom) {
  const proto = GameRoom.prototype;
  const originalStep = proto.step;
  const originalKill = proto.killPlayer;
  const originalHandle = proto.handleInput;
  const originalUpdatePlayer = proto.updatePlayer;
  const originalAddPlayer = proto.addPlayer;
  const RADIUS = 0.48;
  const owner = e => e.isGhost ? e.ownerId : e.id;
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const faceDot = (a,b) => {
    const d=Math.max(0.00001,distance(a,b));
    return ((b.x-a.x)*Math.cos(a.facing)+(b.y-a.y)*Math.sin(a.facing))/d;
  };
  const betweenWalls = (map,a,b) => {
    for(const w of map.walls||[]){
      const left=w.x-w.w/2-.035,right=w.x+w.w/2+.035,top=w.y-w.h/2-.035,bottom=w.y+w.h/2+.035;
      let t0=0,t1=1;
      const dx=b.x-a.x,dy=b.y-a.y;
      for(const [p,q] of [[-dx,a.x-left],[dx,right-a.x],[-dy,a.y-top],[dy,bottom-a.y]]){
        if(Math.abs(p)<1e-9){if(q<0){t0=2;break;}continue;}
        const t=q/p;
        if(p<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);
      }
      if(t0<=t1&&t0<=1&&t1>=0)return true;
    }
    return false;
  };
  proto.addPlayer=function(ws,name){
    const p=originalAddPlayer.call(this,ws,name);
    if(this.players.size>1){p.state.facing=Math.PI;p.inputState.mouseAngle=Math.PI;}
    return p;
  };
  // A pressed-and-released button may arrive between simulation ticks.
  // Preserve its edge on the authoritative state instead of dropping the action.
  proto.handleInput=function(id,payload){
    const p=this.players.get(id);
    if(!p||!p.alive)return;
    const sequence=Number(payload?.seq)||0;
    if(sequence&&sequence<=(p.lastSequence||0))return;
    if(sequence)p.lastSequence=sequence;
    const old=p.inputState||{};
    if(payload?.lmb&&!old.lmb&&!p.state.attacking){
      p.state.charge=Math.max(p.state.charge,95);
    }
    if(payload?.rmb&&!old.rmb&&p.state.shieldCooldown<=0&&!p.state.attacking){
      p.state.shieldUp=true;
      p.state.parryWindow=170;
      p.state.shieldStrength=3;
      p.state.shieldTap=165;
    }
    if(payload?.dash&&!old.dash)p.pendingDash=true;
    originalHandle.call(this,id,payload);
  };
  proto.updatePlayer=function(p,ms){
    if(!p.alive)return;
    if(p.pendingDash&&!p.inputState.dash)p.inputState={...p.inputState,dash:true};
    originalUpdatePlayer.call(this,p,ms);
    if(p.pendingDash){p.pendingDash=false;p.inputState.dash=false;}
  };
  proto.step=function(ms){
    if(this.players.size<2){this.clock+=ms;return;}
    const wasReset=!!this.roundResetAt;
    originalStep.call(this,ms);
    if(wasReset&&!this.roundResetAt){
      let i=0;
      for(const p of this.players.values()){
        const facing=i++===0?0:Math.PI;
        p.state.facing=facing;p.inputState={keys:{},lmb:false,rmb:false,dash:false,ghostToggle:false,mouseAngle:facing};
        p.triggers={spawnGhost:false,toggleGhost:false};p.pendingDash=false;
      }
    }
    if(!Number.isSafeInteger(this.eventSerial))this.eventSerial=0;
    for(const p of this.players.values()){
      for(const event of p.events){
        if(!Number.isSafeInteger(event.id))event.id=++this.eventSerial;
      }
    }
  };
  proto.constrainToBounds=function(s){
    const bounds=this.map?.bounds||{w:22,h:14};
    s.x=Math.max(-bounds.w/2+RADIUS,Math.min(bounds.w/2-RADIUS,s.x));
    s.y=Math.max(-bounds.h/2+RADIUS,Math.min(bounds.h/2-RADIUS,s.y));
    for(let pass=0;pass<3;pass++){
      let hit=false;
      for(const w of this.map?.walls||[]){
        const lx=w.x-w.w/2,rx=w.x+w.w/2,ty=w.y-w.h/2,by=w.y+w.h/2;
        const nx=Math.max(lx,Math.min(rx,s.x)),ny=Math.max(ty,Math.min(by,s.y));
        const dx=s.x-nx,dy=s.y-ny,d2=dx*dx+dy*dy;
        if(d2>=RADIUS*RADIUS)continue;
        hit=true;
        if(d2>1e-8){const k=(RADIUS-Math.sqrt(d2))/Math.sqrt(d2);s.x+=dx*k;s.y+=dy*k;}
        else {
          const edges=[[Math.abs(s.x-lx),lx-RADIUS,'x'],[Math.abs(rx-s.x),rx+RADIUS,'x'],[Math.abs(s.y-ty),ty-RADIUS,'y'],[Math.abs(by-s.y),by+RADIUS,'y']];
          edges.sort((a,b)=>a[0]-b[0]);s[edges[0][2]]=edges[0][1];
        }
        s.vx*=.55;s.vy*=.55;
      }
      s.x=Math.max(-bounds.w/2+RADIUS,Math.min(bounds.w/2-RADIUS,s.x));
      s.y=Math.max(-bounds.h/2+RADIUS,Math.min(bounds.h/2-RADIUS,s.y));
      if(!hit)break;
    }
  };
  proto.applyInputToActor=function(s,input,ms){
    const dt=Math.min(.05,Math.max(0,ms)/1000), k=input.keys||{};
    let mx=Number(!!k.d)-Number(!!k.a),my=Number(!!k.s)-Number(!!k.w);
    const mag=Math.hypot(mx,my);if(mag){mx/=mag;my/=mag;}
    if(Number.isFinite(input.mouseAngle))s.facing=Math.atan2(Math.sin(input.mouseAngle),Math.cos(input.mouseAngle));
    s.dashCooldown=Math.max(0,s.dashCooldown-ms);
    s.shieldCooldown=Math.max(0,s.shieldCooldown-ms);
    s.parryWindow=Math.max(0,s.parryWindow-ms);
    s.stagger=Math.max(0,s.stagger-ms);
    if(input.dash&&s.dashCooldown<=0&&s.stagger<=0){
      const dx=mag?mx:Math.cos(s.facing),dy=mag?my:Math.sin(s.facing);
      s.vx=dx*15;s.vy=dy*15;s.dashCooldown=750;
    }
    const dashing=s.dashCooldown>565;
    s.vx+=mx*(s.stagger?12:57)*dt;
    s.vy+=my*(s.stagger?12:57)*dt;
    const friction=Math.pow(dashing?.975:.85,dt*60);
    s.vx*=friction;s.vy*=friction;
    const speed=Math.hypot(s.vx,s.vy),max=dashing?15:(s.speed||7);
    if(speed>max){s.vx*=max/speed;s.vy*=max/speed;}
    s.x+=s.vx*dt;s.y+=s.vy*dt;
    this.constrainToBounds(s);
    if(input.rmb&&!s.shieldUp&&s.shieldCooldown<=0&&!s.attacking){
      s.shieldUp=true;s.parryWindow=170;s.shieldStrength=3;
    }
    s.shieldTap=Math.max(0,(s.shieldTap||0)-ms);
    if(!input.rmb&&s.shieldUp&&s.shieldTap<=0){s.shieldUp=false;s.parryWindow=0;}
    if(input.lmb&&!s.shieldUp&&!s.attacking)s.charge=Math.min(1800,Math.max(80,s.charge+ms));
    else if(!input.lmb&&s.charge>0){
      s.attacking=true;s.attackTimer=200;s.attackPower=s.charge;s.charge=0;
    }
    if(s.attacking){s.attackTimer-=ms;if(s.attackTimer<=0){s.attacking=false;s.attackPower=0;}}
  };
  proto.resolvePair=function(a,b){
    if(owner(a)===owner(b))return;
    const canHit=(from,to)=>{
      const s=from.state,t=to.state;
      const range=1.5+Math.min(1800,s.attackPower||0)/2400;
      return from.alive&&to.alive&&s.attacking&&distance(s,t)<=range+RADIUS
        &&faceDot(s,t)>.40&&!betweenWalls(this.map,s,t);
    };
    const ah=canHit(a,b),bh=canHit(b,a);
    if(ah&&bh){this.emitEvent('clash',[a,b]);a.state.attacking=false;b.state.attacking=false;
      a.state.stagger=Math.max(a.state.stagger,170);b.state.stagger=Math.max(b.state.stagger,170);return;}
    if(ah)this.tryHit(a,b);
    else if(bh)this.tryHit(b,a);
  };
  proto.tryHit=function(a,b){
    if(owner(a)===owner(b)||!a.alive||!b.alive||!a.state.attacking)return;
    const s=a.state,t=b.state;
    const range=1.5+Math.min(1800,s.attackPower||0)/2400;
    if(distance(s,t)>range+RADIUS||faceDot(s,t)<=.40||betweenWalls(this.map,s,t))return;
    s.attacking=false;
    if(t.shieldUp&&faceDot(t,s)>.15){
      if(t.parryWindow>0){
        s.stagger=460;t.shieldUp=false;t.shieldCooldown=320;t.parryWindow=0;
        if(b.events)b.events.push({type:'parry',target:a.id});
        if(a.events)a.events.push({type:'parried',target:b.id});
      }else{
        t.shieldStrength-=s.attackPower>=1200?2:1;
        if(t.shieldStrength<=0){t.shieldUp=false;t.shieldCooldown=1400;}
        if(b.events)b.events.push({type:'block',target:a.id});
      }
      return;
    }
    if(b.isGhost){b.alive=false;if(a.events)a.events.push({type:'ghostBreak',target:b.id});return;}
    this.killPlayer(b,a);
  };
  proto.killPlayer=function(player,killer){
    if(!player.alive)return;
    const id=owner(killer||{id:''});
    const champion=this.players.get(id);
    if(champion&&champion.id!==player.id)champion.score=(champion.score||0)+1;
    originalKill.call(this,player,killer);
  };
}
improveKatanaCombat(GameRoom);

var copy = (v) => structuredClone(v);
function packFrame(f) {
  const i = f.input, s = f.state;
  return [f.timestamp, [i.keys?.w ? 1 : 0, i.keys?.a ? 1 : 0, i.keys?.s ? 1 : 0, i.keys?.d ? 1 : 0, i.mouseAngle || 0, !!i.lmb, !!i.rmb, !!i.dash, !!i.ghostToggle], STATE_KEYS.map((k) => s[k])];
}
var STATE_KEYS = ["x", "y", "vx", "vy", "facing", "speed", "dashCooldown", "attacking", "attackTimer", "attackPower", "charge", "shieldUp", "shieldStrength", "shieldCooldown", "parryWindow", "stagger", "shieldTap"];
function unpackFrame(f) {
  return { timestamp: f[0], input: { keys: { w: !!f[1][0], a: !!f[1][1], s: !!f[1][2], d: !!f[1][3] }, mouseAngle: f[1][4], lmb: f[1][5], rmb: f[1][6], dash: f[1][7], ghostToggle: f[1][8] }, state: Object.fromEntries(STATE_KEYS.map((k, i) => [k, f[2][i]])) };
}
function encode(room) {
  return { id: room.id, mode: room.mode, map: room.map, clock: room.clock, roundResetAt: room.roundResetAt, eventSerial: room.eventSerial || 0, lastTick: Date.now(), players: [...room.players.values()].map((p) => ({ ...p, events: p.events.slice(-12), ws: null, ghost: { ...p.ghost, buffer: p.ghost.buffer.map(packFrame), ...p.ghost.playback ? { playback: p.ghost.playback.map(packFrame) } : {} } })) };
}
function decode(s) {
  const room = Object.create(GameRoom.prototype);
  Object.assign(room, s);
  room.broadcast = () => {
  };
  room.players = new Map(s.players.map((p) => {
    p = copy(p);
    p.ghost.buffer = p.ghost.buffer.map(unpackFrame);
    if (p.ghost.playback) p.ghost.playback = p.ghost.playback.map(unpackFrame);
    return [p.id, p];
  }));
  return room;
}
function add(room, member) {
  if (room.players.has(member.id)) return;
  if (room.players.size >= 2) throw Error("\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u0430");
  const p = room.addPlayer(null, member.name);
  room.players.delete(p.id);
  p.id = member.id;
  p.ghostActor.id = member.id + "-g";
  p.ghostActor.ownerId = member.id;
  room.players.set(p.id, p);
}
function output(room) {
  return { state: encode(room), events: [{ type: "state", payload: {} }] };
}
var entry_default = {
  protocolVersion: 1,
  createRoom({ player, payload }) {
    const mode = ["echo-trap", "shadow-tail", "channel-echo"].includes(payload?.mode) ? payload.mode : "echo-trap";
    const room = new GameRoom(crypto.randomUUID(), mode, () => {
    });
    add(room, player);
    return output(room);
  },
  onJoin({ state, player }) {
    const room = decode(state);
    add(room, player);
    return output(room);
  },
  onLeave({ state, player }) {
    const room = decode(state);
    room.removePlayer(player.id);
    return output(room);
  },
  onMessage({ state, player, payload: m }) {
    const room = decode(state), p = room.players.get(player.id);
    if (!p) throw Error("\u0418\u0433\u0440\u043E\u043A \u043D\u0435 \u0432 \u043A\u043E\u043C\u043D\u0430\u0442\u0435");
    let elapsed = Math.min(250, Math.max(0, Date.now() - state.lastTick));
    for (const v of room.players.values()) if (Date.now() - (v.lastInputAt || 0) > 500) v.inputState = { keys: {}, lmb: false, rmb: false, mouseAngle: v.state.facing };
    while (elapsed > 0) {
      const step = Math.min(1e3 / 60, elapsed);
      room.step(step);
      elapsed -= step;
    }
    if (m?.type === "input") {
      const i = m.payload || {};
      room.handleInput(player.id, { keys: Object.fromEntries(["w", "a", "s", "d"].map((k) => [k, !!i.keys?.[k]])), mouseAngle: Number.isFinite(i.mouseAngle) ? i.mouseAngle : 0, seq: Number.isSafeInteger(i.seq) ? i.seq : 0, lmb: !!i.lmb, rmb: !!i.rmb, dash: !!i.dash, ghostToggle: !!i.ghostToggle });
      p.lastInputAt = Date.now();
    } else if (m?.type === "ready") room.markReady(player.id);
    else if (m?.type !== "sync") throw Error("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430");
    return output(room);
  },
  viewForPlayer({ state }) {
    const room = decode(state);
    return { phase: room.players.size < 2 ? "lobby" : room.roundResetAt ? "round-end" : "playing", room: room.id, map: room.map, mode: room.mode, players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, alive: p.alive, score: p.score || 0, state: p.state, ghostMode: p.ghostMode, ghost: { cooldown: p.ghost.cooldown, energy: p.ghost.energy, active: p.ghost.active }, ghostActor: p.ghostActor, events: p.events.slice(-8) })) };
  }
};
export {
  entry_default as default
};
