(function () {
  "use strict";

  // A small angular stroke font for the wireframe displays (the home hero's easter egg and the
  // account ID on the settings page). Each glyph is a list of polylines on a 4 x 6 grid, y down;
  // the corners are cut like the KS mark. Lower case is drawn as upper case.
  //
  //   KanasakaWireFont.layout(lines) -> { segments, strokes, width, height }
  //     segments: [[x0, y0], [x1, y1]] pairs in grid units, centred on (0, 0)
  //     strokes:  the same lines as continuous polylines [[x, y], ...]
  //   KanasakaWireFont.beams(lines, { halfWidth, halfDepth }) -> { edges, width, height }
  //     solid 3D letters: edges are [x0, y0, z0, x1, y1, z1]. Every stroke is ONE continuous
  //     square beam: four long edges that bend (mitered) at each corner of the polyline, so a
  //     curve or chamfer adds no connecting lines at all. A closed ring around the cross-section
  //     is drawn only at a stroke's free ends.

  var ADVANCE = 5; // glyph width 4 + 1 gap
  var SPACE = 3;
  var LINE_HEIGHT = 9; // glyph height 6 + 3 gap
  var GLYPH_HEIGHT = 6;

  var GLYPHS = {
    A: [[[0, 6], [0, 1.5], [1.5, 0], [2.5, 0], [4, 1.5], [4, 6]], [[0, 3.5], [4, 3.5]]],
    B: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
    C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
    D: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 1], [3, 0], [0, 0]]],
    E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
    F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
    G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3], [2, 3]]],
    H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
    I: [[[0.5, 0], [3.5, 0]], [[2, 0], [2, 6]], [[0.5, 6], [3.5, 6]]],
    J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]],
    K: [[[0, 0], [0, 6]], [[4, 0], [0, 3], [4, 6]]],
    L: [[[0, 0], [0, 6], [4, 6]]],
    M: [[[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
    N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
    O: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
    P: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
    Q: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[2.5, 4.5], [4, 6.5]]],
    R: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[2, 3], [4, 6]]],
    S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
    T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
    U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
    V: [[[0, 0], [2, 6], [4, 0]]],
    W: [[[0, 0], [1, 6], [2, 2.5], [3, 6], [4, 0]]],
    X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
    Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
    Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
    0: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[1, 5], [3, 1]]],
    1: [[[1, 1], [2, 0], [2, 6]], [[1, 6], [3, 6]]],
    2: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
    3: [[[0, 0], [4, 0], [2, 2.5], [3, 2.5], [4, 3.5], [4, 5], [3, 6], [1, 6], [0, 5]]],
    4: [[[3, 6], [3, 0], [0, 4], [4, 4]]],
    5: [[[4, 0], [0, 0], [0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
    6: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
    7: [[[0, 0], [4, 0], [1.5, 6]]],
    8: [
      [[1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0]],
      [[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]],
    ],
    9: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [4, 3]]],
    _: [[[0, 6.8], [4, 6.8]]],
    "-": [[[0.5, 3], [3.5, 3]]],
    ".": [[[1.7, 5.4], [2.3, 5.4], [2.3, 6], [1.7, 6], [1.7, 5.4]]],
  };

  function advanceOf(ch) {
    return ch === " " ? SPACE : ADVANCE;
  }

  function lineWidth(line) {
    var w = 0;
    for (var i = 0; i < line.length; i += 1) w += advanceOf(line[i]);
    return Math.max(0, w - 1);
  }

  // Lay out lines of text (each centred) as straight segments in grid units, centred on (0, 0).
  function layout(lines) {
    var rows = lines.map(function (line) {
      return String(line).toUpperCase();
    });
    var widest = Math.max.apply(null, rows.map(lineWidth).concat([1]));
    var height = (rows.length - 1) * LINE_HEIGHT + GLYPH_HEIGHT;
    var top = -height / 2;
    var segments = [];
    var strokes = [];

    rows.forEach(function (line, row) {
      var x = -lineWidth(line) / 2;
      for (var i = 0; i < line.length; i += 1) {
        var glyph = GLYPHS[line[i]];
        if (glyph) {
          glyph.forEach(function (stroke) {
            strokes.push(
              stroke.map(function (p) {
                return [x + p[0], top + row * LINE_HEIGHT + p[1]];
              })
            );
            for (var k = 0; k + 1 < stroke.length; k += 1) {
              segments.push([
                [x + stroke[k][0], top + row * LINE_HEIGHT + stroke[k][1]],
                [x + stroke[k + 1][0], top + row * LINE_HEIGHT + stroke[k + 1][1]],
              ]);
            }
          });
        }
        x += advanceOf(line[i]);
      }
    });

    return { segments: segments, strokes: strokes, width: widest, height: height };
  }

  function same(a, b) {
    return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  }

  function beams(lines, options) {
    var hw = (options && options.halfWidth) || 0.45;
    var hd = (options && options.halfDepth) || 0.65;
    var block = layout(lines);
    var edges = [];

    block.strokes.forEach(function (poly) {
      var closed = poly.length > 2 && same(poly[0], poly[poly.length - 1]);
      var pts = closed ? poly.slice(0, -1) : poly;
      var n = pts.length;
      if (n < 2) return;
      var count = closed ? n : n - 1;

      // unit normal of every piece of the polyline
      var normals = [];
      for (var i = 0; i < count; i += 1) {
        var a = pts[i];
        var b = pts[(i + 1) % n];
        var len = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) || 1;
        normals.push([-(b[1] - a[1]) / len, (b[0] - a[0]) / len]);
      }

      // at each vertex: the mitred offset (the average of the two normals, lengthened so the
      // beam keeps its width round the corner, and capped so a sharp turn cannot spike)
      var offsets = pts.map(function (p, v) {
        var before = closed ? normals[(v - 1 + count) % count] : v > 0 ? normals[v - 1] : null;
        var after = closed ? normals[v % count] : v < count ? normals[v] : null;
        var na = before || after;
        var nb = after || before;
        var mx = na[0] + nb[0];
        var my = na[1] + nb[1];
        var ml = Math.sqrt(mx * mx + my * my);
        if (ml < 1e-6) {
          mx = na[0];
          my = na[1];
          ml = 1;
        }
        mx /= ml;
        my /= ml;
        var k = hw / Math.max(mx * na[0] + my * na[1], 0.45);
        return [mx * k, my * k];
      });

      function corner(v, k) {
        var sign = k === 0 || k === 3 ? -1 : 1;
        return [pts[v][0] + offsets[v][0] * sign, pts[v][1] + offsets[v][1] * sign, k < 2 ? -hd : hd];
      }

      for (var s = 0; s < count; s += 1) {
        var t = (s + 1) % n;
        for (var k = 0; k < 4; k += 1) edges.push(corner(s, k).concat(corner(t, k)));
      }
      if (!closed) {
        [0, n - 1].forEach(function (v) {
          for (var c = 0; c < 4; c += 1) edges.push(corner(v, c).concat(corner(v, (c + 1) % 4)));
        });
      }
    });

    return { edges: edges, width: block.width, height: block.height };
  }

  window.KanasakaWireFont = { glyphs: GLYPHS, layout: layout, beams: beams };
})();
