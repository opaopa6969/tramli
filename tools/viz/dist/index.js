import { jsxs as v, jsx as r, Fragment as Ne } from "react/jsx-runtime";
import { useReducer as Ee, useRef as ne, useEffect as J, useCallback as F, memo as Le, useMemo as E, useState as A, useLayoutEffect as Fe } from "react";
import { Handle as B, Position as K, useReactFlow as ve, getBezierPath as De, ReactFlow as Te, Background as Oe, BackgroundVariant as Ae, ReactFlowProvider as ze } from "@xyflow/react";
const Pe = {
  connected: !1,
  flows: [],
  flowPositions: /* @__PURE__ */ new Map(),
  flowOwner: /* @__PURE__ */ new Map(),
  flowStarted: /* @__PURE__ */ new Map(),
  flowLastActive: /* @__PURE__ */ new Map(),
  events: [],
  transits: [],
  edgeCounts: /* @__PURE__ */ new Map(),
  nodeCounts: /* @__PURE__ */ new Map(),
  edgeHeat: /* @__PURE__ */ new Map(),
  metrics: { throughput: 0, errorRate: 0, avgLatencyMicros: 0 }
};
function le(e, t, o, s) {
  s.type === "transition" && (e.set(s.flowId, s.data.to), o.set(s.flowId, s.flowName), t.has(s.flowId) || t.set(s.flowId, s.timestamp));
}
function We(e, t) {
  switch (t.type) {
    case "connected":
      return { ...e, connected: !0 };
    case "disconnected":
      return { ...e, connected: !1 };
    case "init":
      return { ...e, flows: [{ flowName: t.flowName, layer: 1, states: t.states, edges: t.edges }] };
    case "init-multi":
      return { ...e, flows: t.flows };
    case "event": {
      const o = new Map(e.flowPositions), s = new Map(e.flowStarted), i = new Map(e.flowOwner);
      le(o, s, i, t.event);
      let c = e.transits;
      const M = new Map(e.edgeCounts), $ = new Map(e.nodeCounts), l = new Map(e.edgeHeat), a = new Map(e.flowLastActive);
      if (t.event.type === "transition" && t.event.data.from) {
        const u = t.event.flowName, y = t.event.data.from, x = t.event.data.to;
        c = [
          ...c.filter((w) => w.flowId !== t.event.flowId),
          { flowId: t.event.flowId, from: y, to: x, flowName: u, startedAt: t.now }
        ];
        const n = `${u}:${y}->${x}`;
        M.set(n, (M.get(n) ?? 0) + 1);
        const h = `${u}:${x}`;
        $.set(h, ($.get(h) ?? 0) + 1), l.set(n, Math.min((l.get(n) ?? 0) + 1, 50)), a.set(t.event.flowId, Date.now());
      }
      return {
        ...e,
        events: [...e.events, t.event],
        flowPositions: o,
        flowStarted: s,
        flowOwner: i,
        flowLastActive: a,
        transits: c,
        edgeCounts: M,
        nodeCounts: $,
        edgeHeat: l
      };
    }
    case "snapshot": {
      const o = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map();
      for (const c of t.flows)
        o.set(c.flowId, c.currentState), s.set(c.flowId, c.startedAt);
      for (const c of t.events) le(o, s, i, c);
      return { ...e, events: t.events, flowPositions: o, flowStarted: s, flowOwner: i };
    }
    case "metric":
      return { ...e, metrics: { throughput: t.throughput, errorRate: t.errorRate, avgLatencyMicros: t.avgLatencyMicros } };
    case "replay": {
      const o = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map();
      for (let c = 0; c <= t.position && c < e.events.length; c++)
        le(o, s, i, e.events[c]);
      return { ...e, flowPositions: o, flowStarted: s, flowOwner: i, transits: [] };
    }
    case "tick": {
      const o = e.transits.filter((a) => t.now - a.startedAt < t.transitDuration);
      let s = o.length !== e.transits.length;
      const i = /* @__PURE__ */ new Map();
      for (const [a, u] of e.edgeHeat) {
        const y = u * t.heatDecay;
        y > 0.05 && i.set(a, y), Math.abs(y - u) > 0.01 && (s = !0);
      }
      const c = /* @__PURE__ */ new Set();
      for (const a of e.flows) for (const u of a.states) u.terminal && c.add(u.name);
      const M = new Map(e.flowPositions), $ = Date.now();
      let l = !1;
      for (const [a, u] of M) {
        const y = e.flowLastActive.get(a) ?? 0, x = c.has(u), n = $ - y;
        (x && n > 3e3 || !x && n > 15e3) && (M.delete(a), l = !0);
      }
      return !s && !l ? e : { ...e, transits: o, edgeHeat: i, ...l ? { flowPositions: M } : {} };
    }
    default:
      return e;
  }
}
const q = 600;
function he(e) {
  return Math.pow(0.05, 1 / (e * 10));
}
function He(e = "ws://localhost:3001") {
  const [t, o] = Ee(We, Pe), s = ne(null), i = ne(he(1.5));
  J(() => {
    let l, a = !1;
    function u() {
      const y = new WebSocket(e);
      s.current = y, y.onopen = () => o({ type: "connected" }), y.onmessage = (x) => {
        try {
          const n = JSON.parse(x.data);
          switch (n.type) {
            case "init":
              o({ type: "init", flowName: n.flowName, states: n.states, edges: n.edges });
              break;
            case "init-multi":
              o({ type: "init-multi", flows: n.flows });
              break;
            case "event":
              o({ type: "event", event: n.event, now: performance.now() });
              break;
            case "snapshot":
              o({ type: "snapshot", flows: n.flows, events: n.events });
              break;
            case "metric":
              o({ type: "metric", throughput: n.throughput, errorRate: n.errorRate, avgLatencyMicros: n.avgLatencyMicros });
              break;
          }
        } catch {
        }
      }, y.onclose = () => {
        o({ type: "disconnected" }), a || (l = setTimeout(u, 2e3));
      }, y.onerror = () => y.close();
    }
    return u(), () => {
      var y;
      a = !0, clearTimeout(l), (y = s.current) == null || y.close();
    };
  }, [e]), J(() => {
    const l = setInterval(() => {
      o({ type: "tick", now: performance.now(), transitDuration: q, heatDecay: i.current });
    }, 100);
    return () => clearInterval(l);
  }, []);
  const c = F((l) => {
    var a;
    ((a = s.current) == null ? void 0 : a.readyState) === WebSocket.OPEN && s.current.send(JSON.stringify(l));
  }, []), M = F((l) => {
    o({ type: "replay", position: l });
  }, []), $ = F((l) => {
    i.current = he(l);
  }, []);
  return { state: t, send: c, replay: M, setHeatDecay: $ };
}
function _e({ data: e }) {
  const t = e, o = t.initial ? "#3b82f6" : t.terminal ? "#22c55e" : "#475569";
  return /* @__PURE__ */ v(
    "div",
    {
      style: {
        background: o,
        color: "#fff",
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "monospace",
        minWidth: 120,
        textAlign: "center",
        position: "relative",
        border: "2px solid rgba(255,255,255,0.2)",
        boxShadow: t.count > 0 ? `0 0 12px ${o}` : "none"
      },
      children: [
        /* @__PURE__ */ r(B, { type: "target", position: K.Top, style: j }),
        /* @__PURE__ */ r(B, { type: "target", position: K.Left, id: "left-target", style: j }),
        /* @__PURE__ */ r(B, { type: "target", position: K.Right, id: "right-target", style: j }),
        t.label,
        t.count > 0 && /* @__PURE__ */ r("span", { style: { ...Be, top: -8, right: -8, background: "#f59e0b", color: "#000" }, children: t.count }),
        t.throughput > 0 && /* @__PURE__ */ r("span", { style: {
          position: "absolute",
          bottom: -7,
          left: -4,
          background: "#1e293b",
          color: "#94a3b8",
          borderRadius: 4,
          padding: "0 4px",
          fontSize: 9,
          fontWeight: 400,
          border: "1px solid #334155",
          lineHeight: "14px"
        }, children: t.throughput }),
        /* @__PURE__ */ r(B, { type: "source", position: K.Bottom, style: j }),
        /* @__PURE__ */ r(B, { type: "source", position: K.Left, id: "left-source", style: j }),
        /* @__PURE__ */ r(B, { type: "source", position: K.Right, id: "right-source", style: j })
      ]
    }
  );
}
const j = { background: "#94a3b8", width: 6, height: 6 }, Be = {
  position: "absolute",
  borderRadius: "50%",
  width: 20,
  height: 20,
  fontSize: 10,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
}, Ke = Le(_e);
function je(e, t) {
  const o = t.find((s) => s.name === e);
  return o ? o.terminal ? e === "BLOCKED" || e === "TERMINAL_ERROR" ? "#ef4444" : "#22c55e" : e === "REDIRECTED" ? "#f59e0b" : e === "RETRIABLE_ERROR" ? "#f97316" : "#60a5fa" : "#94a3b8";
}
function Xe(e, t) {
  for (let o = t.length - 1; o >= Math.max(0, t.length - 20); o--) {
    const s = t[o];
    if (s.flowId === e && s.type === "guard" && s.data.result === "rejected") return !0;
    if (s.flowId === e && s.type === "transition") return !1;
  }
  return !1;
}
function Ye({ states: e, flowPositions: t, events: o, selectedFlowId: s, onSelect: i }) {
  const { getViewport: c } = ve(), M = c(), $ = E(() => {
    const a = /* @__PURE__ */ new Map();
    for (const u of e) a.set(u.name, { x: u.x, y: u.y });
    return a;
  }, [e]), l = E(() => {
    const a = [], u = /* @__PURE__ */ new Map(), y = /* @__PURE__ */ new Map();
    for (const [x, n] of t)
      u.set(n, (u.get(n) ?? 0) + 1);
    for (const [x, n] of t) {
      const h = $.get(n);
      if (!h) continue;
      const w = e.find((L) => L.name === n), p = (w == null ? void 0 : w.terminal) ?? !1, S = y.get(n) ?? 0;
      y.set(n, S + 1);
      const R = 16, I = u.get(n) ?? 1, N = I > 1 ? (S - (I - 1) / 2) * R : 0;
      a.push({
        flowId: x,
        x: h.x + 60 + N,
        // offset right of node center
        y: h.y + 30,
        // below node top
        color: je(n, e),
        bounce: Xe(x, o),
        fading: p
      });
    }
    return a;
  }, [t, $, e, o]);
  return /* @__PURE__ */ r(
    "div",
    {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        transform: `translate(${M.x}px, ${M.y}px) scale(${M.zoom})`,
        transformOrigin: "0 0"
      },
      children: l.map((a) => /* @__PURE__ */ r(
        "div",
        {
          onClick: () => i(a.flowId),
          title: a.flowId.slice(0, 8),
          style: {
            position: "absolute",
            left: a.x - 6,
            top: a.y - 6,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: a.color,
            border: a.flowId === s ? "2px solid #fff" : "1px solid rgba(0,0,0,0.3)",
            transition: "left 400ms ease-out, top 400ms ease-out, opacity 1s ease-out",
            opacity: a.fading ? 0.3 : 1,
            animation: a.bounce ? "bounce 300ms ease" : void 0,
            pointerEvents: "auto",
            cursor: "pointer",
            boxShadow: `0 0 6px ${a.color}`
          }
        },
        a.flowId
      ))
    }
  );
}
const z = 120, X = 36, Ge = [
  { delayFrac: 0, r: 8, opacity: 1 },
  // head
  { delayFrac: 0.04, r: 7, opacity: 0.8 },
  { delayFrac: 0.08, r: 6, opacity: 0.6 },
  { delayFrac: 0.13, r: 5, opacity: 0.4 },
  { delayFrac: 0.18, r: 4, opacity: 0.25 },
  { delayFrac: 0.24, r: 3, opacity: 0.15 },
  { delayFrac: 0.3, r: 2.5, opacity: 0.08 },
  { delayFrac: 0.36, r: 2, opacity: 0.04 }
], Ve = [
  { delayFrac: 0.07, r: 12, opacity: 0.08 },
  { delayFrac: 0.14, r: 10, opacity: 0.06 },
  { delayFrac: 0.21, r: 8, opacity: 0.03 }
];
function ge(e, t) {
  const o = t.find((s) => s.name === e);
  return o ? o.terminal ? e === "BLOCKED" || e === "TERMINAL_ERROR" ? "#ef4444" : "#22c55e" : e === "REDIRECTED" ? "#f59e0b" : e === "RETRIABLE_ERROR" ? "#f97316" : "#60a5fa" : "#94a3b8";
}
function Ue(e) {
  return {
    "#60a5fa": "#93c5fd",
    "#f59e0b": "#fbbf24",
    "#22c55e": "#86efac",
    "#ef4444": "#fca5a5",
    "#f97316": "#fdba74",
    "#94a3b8": "#cbd5e1"
  }[e] ?? "#ffffff";
}
function qe(e, t) {
  const o = e.x + z / 2, s = e.y + X / 2, i = t.x + z / 2, c = t.y + X / 2, M = t.y < e.y - 10, $ = Math.abs(t.y - e.y) <= 10;
  if (M) {
    const h = t.x < e.x, w = h ? e.x : e.x + z, p = s, S = h ? t.x + z : t.x, R = c, I = Math.abs(S - w), N = Math.abs(R - p), L = Math.max(I * 0.5, N * 0.3, 60), O = h ? -1 : 1;
    return `M${w},${p} C${w + O * L},${p + L * 0.3} ${S + O * L},${R - L * 0.3} ${S},${R}`;
  }
  if ($) {
    const h = t.x > e.x, w = h ? e.x + z : e.x, p = s, S = h ? t.x : t.x + z, R = c, I = (p + R) / 2, N = 40;
    return `M${w},${p} C${(w + S) / 2},${I - N} ${(w + S) / 2},${I - N} ${S},${R}`;
  }
  const l = o, a = e.y + X, u = i, y = t.y, x = Math.abs(y - a), n = Math.max(x * 0.4, 30);
  return `M${l},${a} C${l},${a + n} ${u},${y - n} ${u},${y}`;
}
function Je(e, t) {
  const o = t.x + z / 2 - (e.x + z / 2), s = t.y + X / 2 - (e.y + X / 2);
  return Math.sqrt(o * o + s * s);
}
function Ze(e) {
  return Math.max(0.4, Math.min(2.5, 120 / Math.max(e, 20)));
}
function Qe(e, t) {
  for (let o = t.length - 1; o >= Math.max(0, t.length - 20); o--) {
    const s = t[o];
    if (s.flowId === e && s.type === "guard" && s.data.result === "rejected") return !0;
    if (s.flowId === e && s.type === "transition") return !1;
  }
  return !1;
}
function et({ states: e, flowPositions: t, transits: o, events: s, selectedFlowId: i, onSelect: c, fadeAfterMs: M }) {
  const { getViewport: $ } = ve(), l = $(), a = E(() => {
    const n = /* @__PURE__ */ new Map();
    for (const h of e) n.set(h.name, h);
    return n;
  }, [e]), u = E(() => new Set(o.map((n) => n.flowId)), [o]), y = E(() => {
    const n = [], h = /* @__PURE__ */ new Map(), w = /* @__PURE__ */ new Map();
    for (const [, p] of t)
      h.set(p, (h.get(p) ?? 0) + 1);
    for (const [p, S] of t) {
      if (u.has(p)) continue;
      const R = a.get(S);
      if (!R || R.terminal) continue;
      const I = w.get(S) ?? 0;
      w.set(S, I + 1);
      const N = h.get(S) ?? 1, O = N > 1 ? (I - (N - 1) / 2) * 14 : 0;
      n.push({
        flowId: p,
        x: R.x + z / 2 + O,
        y: R.y + X / 2,
        color: ge(S, e),
        bounce: Qe(p, s),
        fading: R.terminal
      });
    }
    return n;
  }, [t, u, a, e, s]), x = E(() => o.map((n) => {
    const h = a.get(n.from), w = a.get(n.to);
    if (!h || !w) return null;
    const p = qe(h, w), S = ge(n.to, e), R = Ue(S), I = Je(h, w), N = Ze(I);
    return { ...n, path: p, color: S, core: R, speed: N };
  }).filter(Boolean), [o, a, e]);
  return /* @__PURE__ */ v(
    "div",
    {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        transform: `translate(${l.x}px, ${l.y}px) scale(${l.zoom})`,
        transformOrigin: "0 0"
      },
      children: [
        /* @__PURE__ */ v("svg", { style: { position: "absolute", top: 0, left: 0, width: 9999, height: 9999, overflow: "visible" }, children: [
          /* @__PURE__ */ r("defs", { children: x.map((n) => /* @__PURE__ */ v("filter", { id: `glow-${n.flowId}`, x: "-50%", y: "-50%", width: "200%", height: "200%", children: [
            /* @__PURE__ */ r("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "3", result: "blur" }),
            /* @__PURE__ */ r("feFlood", { floodColor: n.color, floodOpacity: "0.6", result: "color" }),
            /* @__PURE__ */ r("feComposite", { in: "color", in2: "blur", operator: "in", result: "glow" }),
            /* @__PURE__ */ v("feMerge", { children: [
              /* @__PURE__ */ r("feMergeNode", { in: "glow" }),
              /* @__PURE__ */ r("feMergeNode", { in: "glow" }),
              /* @__PURE__ */ r("feMergeNode", { in: "SourceGraphic" })
            ] })
          ] }, `glow-${n.flowId}`)) }),
          x.map((n) => {
            const h = n.speed;
            return /* @__PURE__ */ v("g", { children: [
              Ge.map((w, p) => /* @__PURE__ */ r(
                "circle",
                {
                  r: w.r,
                  fill: p === 0 ? n.core : n.color,
                  opacity: w.opacity,
                  filter: p === 0 ? `url(#glow-${n.flowId})` : void 0,
                  style: {
                    offsetPath: `path('${n.path}')`,
                    offsetDistance: "0%",
                    animation: `trace-move ${q}ms ease-in-out ${Math.round(w.delayFrac * q * h)}ms forwards`,
                    willChange: "offset-distance"
                  }
                },
                p
              )),
              Ve.map((w, p) => /* @__PURE__ */ r(
                "circle",
                {
                  r: w.r * h,
                  fill: n.color,
                  opacity: w.opacity,
                  style: {
                    offsetPath: `path('${n.path}')`,
                    offsetDistance: "0%",
                    animation: `trace-move ${q}ms ease-in-out ${Math.round(w.delayFrac * q * h)}ms forwards`,
                    willChange: "offset-distance"
                  }
                },
                `ex-${p}`
              ))
            ] }, `fireball-${n.flowId}`);
          })
        ] }),
        y.map((n) => /* @__PURE__ */ r(
          "div",
          {
            onClick: () => c(n.flowId),
            title: n.flowId.slice(0, 8),
            style: {
              position: "absolute",
              left: n.x - 6,
              top: n.y - 6,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: n.color,
              border: n.flowId === i ? "2px solid #fff" : "1px solid rgba(0,0,0,0.3)",
              opacity: n.fading ? 0.3 : 1,
              transition: `opacity ${M}ms ease-out`,
              animation: n.bounce ? "bounce 300ms ease" : void 0,
              pointerEvents: "auto",
              cursor: "pointer",
              boxShadow: `0 0 8px ${n.color}`
            }
          },
          n.flowId
        ))
      ]
    }
  );
}
function tt(e) {
  const {
    id: t,
    sourceX: o,
    sourceY: s,
    sourcePosition: i,
    targetX: c,
    targetY: M,
    targetPosition: $,
    style: l,
    data: a,
    label: u,
    labelStyle: y,
    labelShowBg: x,
    labelBgStyle: n
  } = e, h = (a == null ? void 0 : a.baseWidth) ?? 1.5, w = (a == null ? void 0 : a.glowWidth) ?? h, p = (a == null ? void 0 : a.heatIntensity) ?? 0, [S, R, I] = De({
    sourceX: o,
    sourceY: s,
    sourcePosition: i,
    targetX: c,
    targetY: M,
    targetPosition: $
  }), N = String((l == null ? void 0 : l.stroke) ?? "#64748b"), L = String((l == null ? void 0 : l.strokeDasharray) ?? ""), O = L.length > 0, Y = w, Z = p > 0.08 ? `drop-shadow(0 0 ${3 + p * 8}px ${N})` : void 0, W = Math.max(h * 2.5 + 3, 8), G = W / Math.sqrt(3), V = ne(null), [D, re] = A(null);
  Fe(() => {
    const d = V.current;
    if (!d) return;
    const f = d.getTotalLength();
    if (f < W + 2) return;
    const k = d.getPointAtLength(f), m = d.getPointAtLength(f - W), C = Math.atan2(k.y - m.y, k.x - m.x), H = m.x, _ = m.y, T = -Math.sin(C) * G, U = Math.cos(C) * G;
    re({
      tipX: k.x,
      tipY: k.y,
      lx: H + T,
      ly: _ + U,
      rx: H - T,
      ry: _ - U,
      totalLen: f
    });
  }, [S, W, G]);
  const se = Y * 0.5, g = D ? D.totalLen - W + se : void 0, b = g != null ? O ? L : `${g} 99999` : O ? L : void 0;
  return /* @__PURE__ */ v("g", { children: [
    /* @__PURE__ */ r(
      "path",
      {
        ref: V,
        d: S,
        fill: "none",
        stroke: "none"
      }
    ),
    /* @__PURE__ */ r(
      "path",
      {
        d: S,
        fill: "none",
        className: "react-flow__edge-path",
        style: {
          stroke: N,
          strokeWidth: `${Y}px`,
          strokeDasharray: b,
          strokeLinecap: "butt",
          filter: Z,
          transition: "stroke-width 200ms"
        }
      }
    ),
    D && /* @__PURE__ */ r(
      "polygon",
      {
        points: `${D.tipX},${D.tipY} ${D.lx},${D.ly} ${D.rx},${D.ry}`,
        fill: N
      }
    ),
    u && /* @__PURE__ */ v("g", { transform: `translate(${R}, ${I})`, children: [
      x !== !1 && /* @__PURE__ */ r(
        "rect",
        {
          x: -30,
          y: -8,
          width: 60,
          height: 16,
          rx: 3,
          fill: (n == null ? void 0 : n.fill) ?? "#0f172a",
          fillOpacity: (n == null ? void 0 : n.fillOpacity) ?? 0.8
        }
      ),
      /* @__PURE__ */ r(
        "text",
        {
          textAnchor: "middle",
          dominantBaseline: "central",
          style: {
            fontSize: (y == null ? void 0 : y.fontSize) ?? 10,
            fill: (y == null ? void 0 : y.fill) ?? "#94a3b8",
            fontFamily: (y == null ? void 0 : y.fontFamily) ?? "monospace"
          },
          children: String(u)
        }
      )
    ] }),
    /* @__PURE__ */ r(
      "path",
      {
        d: S,
        fill: "none",
        stroke: "transparent",
        strokeWidth: Math.max(Y, 20),
        className: "react-flow__edge-interaction"
      }
    )
  ] });
}
const ot = tt, ee = typeof navigator < "u" && navigator.language.startsWith("ja"), nt = [
  { label: ee ? "Auto（自動遷移）" : "Auto", color: "#64748b", dash: !1 },
  { label: ee ? "External（外部待ち）" : "External", color: "#f59e0b", dash: !1 },
  { label: ee ? "Branch（条件分岐）" : "Branch", color: "#e2e8f0", dash: !0 },
  { label: ee ? "Error（エラー遷移）" : "Error", color: "#ef4444", dash: !0 }
];
function rt() {
  return /* @__PURE__ */ r("div", { style: {
    position: "absolute",
    bottom: 12,
    left: 12,
    zIndex: 10,
    background: "rgba(15, 23, 42, 0.9)",
    border: "1px solid #1e293b",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 11,
    fontFamily: "monospace",
    display: "flex",
    flexDirection: "column",
    gap: 5
  }, children: nt.map((e) => /* @__PURE__ */ v("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
    /* @__PURE__ */ v("svg", { width: 32, height: 8, children: [
      /* @__PURE__ */ r(
        "line",
        {
          x1: 0,
          y1: 4,
          x2: 24,
          y2: 4,
          stroke: e.color,
          strokeWidth: 2,
          strokeDasharray: e.dash ? "4 2" : void 0
        }
      ),
      /* @__PURE__ */ r(
        "polygon",
        {
          points: "24,0 32,4 24,8",
          fill: e.color
        }
      )
    ] }),
    /* @__PURE__ */ r("span", { style: { color: "#94a3b8" }, children: e.label })
  ] }, e.label)) });
}
const st = { flowNode: Ke }, at = { arrow: ot }, ce = [void 0, "left", "right"];
function ye(e) {
  const t = ce.indexOf(e);
  return ce[(t + 1) % ce.length];
}
function me(e, t) {
  if (e)
    return `${e}-${t}`;
}
function it(e, t) {
  const o = t.y < e.y - 10, s = Math.abs(t.y - e.y) <= 10;
  if (o) {
    const i = t.x < e.x;
    return { source: i ? "left" : "right", target: i ? "right" : "left" };
  }
  if (s) {
    const i = t.x > e.x;
    return { source: i ? "right" : "left", target: i ? "left" : "right" };
  }
  return { source: void 0, target: void 0 };
}
const P = 40, te = 60;
function lt(e) {
  const t = [], o = e.filter((l) => l.layer === 1), s = e.filter((l) => l.layer === 2);
  let i = 0;
  for (const l of o) {
    const { w: a, h: u } = we(l.states);
    t.push({
      flowName: l.flowName,
      layer: 1,
      x: i,
      y: 0,
      width: a + P * 2,
      height: u + P * 2 + 30
      // +30 for label
    }), i += a + P * 2 + te;
  }
  const c = t.reduce((l, a) => Math.max(l, a.height), 0), M = o.length > 0 ? c + te : 0, $ = Math.ceil(Math.sqrt(s.length));
  for (let l = 0; l < s.length; l++) {
    const a = s[l], { w: u, h: y } = we(a.states), x = l % $, n = Math.floor(l / $);
    t.push({
      flowName: a.flowName,
      layer: 2,
      x: x * (500 + te),
      y: M + n * (600 + te),
      width: Math.max(u + P * 2, 400),
      height: y + P * 2 + 30
    });
  }
  return t;
}
function we(e) {
  if (e.length === 0) return { w: 200, h: 100 };
  let t = 0, o = 0;
  for (const s of e)
    t = Math.max(t, s.x + 120), o = Math.max(o, s.y + 36);
  return { w: t, h: o };
}
const Me = "tramli-viz-layout";
function ct() {
  try {
    const e = localStorage.getItem(Me);
    return e ? JSON.parse(e) : null;
  } catch {
    return null;
  }
}
function dt(e) {
  localStorage.setItem(Me, JSON.stringify(e));
}
function ft({ flows: e, flowPositions: t, flowOwner: o, transits: s, events: i, edgeCounts: c, nodeCounts: M, edgeHeat: $, selectedFlowId: l, onSelectFlow: a, traceMode: u, fadeAfterMs: y }) {
  const [x, n] = A(/* @__PURE__ */ new Map()), [h, w] = A(/* @__PURE__ */ new Map()), p = e.length > 1;
  J(() => {
    const g = ct();
    g && (g.positions && n(new Map(Object.entries(g.positions))), g.handles && w(new Map(Object.entries(g.handles))));
  }, []);
  const S = F(() => {
    const g = {};
    for (const [d, f] of x) g[d] = f;
    const b = {};
    for (const [d, f] of h) b[d] = f;
    dt({ positions: g, handles: b });
  }, [x, h]), R = E(() => p ? lt(e) : [], [e, p]), I = E(() => {
    const g = /* @__PURE__ */ new Map();
    for (const [b, d] of t) {
      const f = o.get(b) ?? "", k = p ? `${f}:${d}` : d;
      g.set(k, (g.get(k) ?? 0) + 1);
    }
    return g;
  }, [t, o, p]), N = E(() => {
    const g = [];
    for (const b of e) {
      const d = R.find((m) => m.flowName === b.flowName), f = d ? d.x + P : 0, k = d ? d.y + P + 30 : 0;
      if (d) {
        const m = `group:${b.flowName}`, C = x.get(m) ?? { x: d.x, y: d.y };
        g.push({
          id: m,
          type: "group",
          position: C,
          data: {},
          style: {
            width: d.width,
            height: d.height,
            background: "rgba(30, 41, 59, 0.4)",
            border: "1px solid #334155",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            color: b.layer === 1 ? "#f59e0b" : "#60a5fa",
            padding: 8
          },
          draggable: !0
        });
      }
      for (const m of b.states) {
        const C = p ? `${b.flowName}:${m.name}` : m.name, H = x.get(C) ?? { x: m.x + f, y: m.y + k }, _ = p ? `${b.flowName}:${m.name}` : m.name, T = `${b.flowName}:${m.name}`;
        g.push({
          id: C,
          type: "flowNode",
          position: H,
          parentId: d ? `group:${b.flowName}` : void 0,
          extent: d ? "parent" : void 0,
          data: {
            label: m.name,
            initial: m.initial,
            terminal: m.terminal,
            count: I.get(_) ?? 0,
            throughput: M.get(T) ?? 0
          },
          draggable: !0
        });
      }
    }
    return g;
  }, [e, R, x, I, M, p]), L = E(() => {
    const g = /* @__PURE__ */ new Map();
    for (const b of e)
      for (const d of b.states) {
        const f = p ? `${b.flowName}:${d.name}` : d.name, k = x.get(f);
        g.set(f, k ? { ...d, x: k.x, y: k.y } : d);
      }
    return g;
  }, [e, x, p]), O = E(() => {
    const g = /* @__PURE__ */ new Map();
    for (const b of e)
      for (const d of b.edges) {
        const f = `${b.flowName}:${d.from}->${d.to}`, k = c.get(f) ?? 0, m = p ? `${b.flowName}:${d.from}` : d.from;
        g.set(m, (g.get(m) ?? 0) + k);
      }
    return g;
  }, [e, c, p]), Y = E(() => {
    const g = [];
    let b = 0;
    for (const d of e)
      for (const f of d.edges) {
        const k = p ? `${d.flowName}:${f.from}` : f.from, m = p ? `${d.flowName}:${f.to}` : f.to, C = `${d.flowName}:${f.from}->${f.to}`, H = L.get(k), _ = L.get(m), T = h.get(C), U = H && _ ? it(H, _) : { source: void 0, target: void 0 }, $e = (T == null ? void 0 : T.source) ?? U.source, Se = (T == null ? void 0 : T.target) ?? U.target, fe = f.type === "error" ? "#ef4444" : f.type === "external" ? "#f59e0b" : f.type === "branch" ? "#e2e8f0" : "#64748b", ae = c.get(C) ?? 0, Ie = ae > 0 ? `${f.label} (${ae})` : f.label, ie = O.get(k) ?? 0, Re = ie > 0 ? ae / ie : 0, ue = ie > 0 ? 1.5 + Re * 3.9 : 1.5, ke = $.get(C) ?? 0, Q = Math.min(ke / 3, 1), pe = ue + Q * 2, Ce = Q > 0.08 ? `drop-shadow(0 0 ${3 + Q * 8}px ${fe})` : void 0;
        g.push({
          id: `e-${b++}`,
          type: "arrow",
          source: k,
          target: m,
          data: { edgeKey: C, baseWidth: ue, glowWidth: pe, heatIntensity: Q },
          label: Ie,
          sourceHandle: me($e, "source"),
          targetHandle: me(Se, "target"),
          style: {
            stroke: fe,
            strokeDasharray: f.type === "error" ? "8 3" : f.type === "branch" ? "6 4" : void 0,
            strokeWidth: pe,
            filter: Ce,
            transition: "stroke-width 200ms, filter 200ms"
          },
          labelStyle: { fill: "#94a3b8", fontSize: 10, fontFamily: "monospace" },
          labelBgStyle: { fill: "#0f172a", fillOpacity: 0.8 }
        });
      }
    return g;
  }, [e, L, c, $, h, O, p]), Z = E(() => {
    const g = [];
    for (const b of e) {
      const d = R.find((f) => f.flowName === b.flowName);
      for (const f of b.states) {
        const k = p ? `${b.flowName}:${f.name}` : f.name, m = x.get(k);
        g.push({
          ...f,
          name: k,
          x: (m == null ? void 0 : m.x) ?? (d ? f.x + d.x + P : f.x),
          y: (m == null ? void 0 : m.y) ?? (d ? f.y + d.y + P + 30 : f.y)
        });
      }
    }
    return g;
  }, [e, R, x, p]), W = E(() => {
    if (!p) return t;
    const g = /* @__PURE__ */ new Map();
    for (const [b, d] of t) {
      const f = o.get(b) ?? "";
      g.set(b, `${f}:${d}`);
    }
    return g;
  }, [t, o, p]), G = E(() => p ? s.map((g) => ({
    ...g,
    from: `${g.flowName}:${g.from}`,
    to: `${g.flowName}:${g.to}`
  })) : s, [s, p]), V = F((g) => a(g), [a]), D = F((g) => {
    n((b) => {
      const d = new Map(b);
      for (const f of g)
        f.type === "position" && f.position && d.set(f.id, f.position);
      return d;
    });
  }, []), re = F((g, b) => {
    var f;
    const d = (f = b.data) == null ? void 0 : f.edgeKey;
    d && w((k) => {
      const m = new Map(k), C = m.get(d) ?? { source: void 0, target: void 0 };
      return m.set(d, { source: C.source, target: ye(C.target) }), m;
    });
  }, []), se = F((g, b) => {
    var f;
    g.preventDefault();
    const d = (f = b.data) == null ? void 0 : f.edgeKey;
    d && w((k) => {
      const m = new Map(k), C = m.get(d) ?? { source: void 0, target: void 0 };
      return m.set(d, { source: ye(C.source), target: C.target }), m;
    });
  }, []);
  return /* @__PURE__ */ v("div", { style: { width: "100%", height: "100%", position: "relative" }, children: [
    /* @__PURE__ */ r(rt, {}),
    /* @__PURE__ */ r(
      "button",
      {
        onClick: S,
        style: {
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 10,
          background: "#1e293b",
          color: "#94a3b8",
          border: "1px solid #334155",
          borderRadius: 4,
          padding: "4px 10px",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "monospace"
        },
        children: "Save Layout"
      }
    ),
    /* @__PURE__ */ v(
      Te,
      {
        nodes: N,
        edges: Y,
        nodeTypes: st,
        edgeTypes: at,
        onNodesChange: D,
        onEdgeDoubleClick: re,
        onEdgeContextMenu: se,
        nodesConnectable: !1,
        fitView: !0,
        proOptions: { hideAttribution: !0 },
        minZoom: 0.2,
        maxZoom: 2,
        children: [
          /* @__PURE__ */ r(Oe, { variant: Ae.Dots, gap: 20, size: 1, color: "#1e293b" }),
          u ? /* @__PURE__ */ r(
            et,
            {
              states: Z,
              flowPositions: W,
              transits: G,
              events: i,
              selectedFlowId: l,
              onSelect: V,
              fadeAfterMs: y
            }
          ) : /* @__PURE__ */ r(
            Ye,
            {
              states: Z,
              flowPositions: W,
              events: i,
              selectedFlowId: l,
              onSelect: V
            }
          )
        ]
      }
    )
  ] });
}
function ut({ flowPositions: e, flowStarted: t, selectedFlowId: o, onSelect: s }) {
  const i = E(() => {
    const c = Date.now();
    return [...e.entries()].map(([M, $]) => ({
      flowId: M,
      state: $,
      age: Math.round((c - (t.get(M) ?? c)) / 1e3)
    })).sort((M, $) => $.age - M.age).slice(0, 30);
  }, [e, t]);
  return /* @__PURE__ */ v("div", { style: { padding: 12, overflowY: "auto", maxHeight: "100%" }, children: [
    /* @__PURE__ */ v("h3", { style: { margin: "0 0 8px", fontSize: 13, color: "#94a3b8", fontWeight: 600 }, children: [
      "Active Flows (",
      e.size,
      ")"
    ] }),
    i.map((c) => /* @__PURE__ */ v(
      "div",
      {
        onClick: () => s(c.flowId),
        style: {
          padding: "4px 8px",
          marginBottom: 2,
          borderRadius: 4,
          background: c.flowId === o ? "#1e3a5f" : "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontFamily: "monospace"
        },
        children: [
          /* @__PURE__ */ r("span", { style: {
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: c.state.includes("ERROR") || c.state === "BLOCKED" ? "#ef4444" : c.state === "COMPLETE" || c.state === "COMPLETE_MFA" ? "#22c55e" : c.state === "REDIRECTED" ? "#f59e0b" : "#60a5fa",
            flexShrink: 0
          } }),
          /* @__PURE__ */ r("span", { style: { color: "#e2e8f0", flex: 1 }, children: c.flowId.slice(0, 8) }),
          /* @__PURE__ */ r("span", { style: { color: "#64748b", fontSize: 10 }, children: c.state }),
          /* @__PURE__ */ v("span", { style: { color: "#475569", fontSize: 10, minWidth: 28, textAlign: "right" }, children: [
            c.age,
            "s"
          ] })
        ]
      },
      c.flowId
    )),
    i.length === 0 && /* @__PURE__ */ r("div", { style: { color: "#475569", fontSize: 11, fontStyle: "italic" }, children: "No active flows" })
  ] });
}
function de({ label: e, value: t, unit: o, color: s }) {
  return /* @__PURE__ */ v("div", { style: {
    background: "#1e293b",
    borderRadius: 8,
    padding: "8px 12px",
    flex: 1
  }, children: [
    /* @__PURE__ */ r("div", { style: { fontSize: 10, color: "#64748b", marginBottom: 2 }, children: e }),
    /* @__PURE__ */ v("div", { style: { fontSize: 18, fontWeight: 700, color: s, fontFamily: "monospace" }, children: [
      t,
      /* @__PURE__ */ r("span", { style: { fontSize: 10, fontWeight: 400, color: "#64748b", marginLeft: 4 }, children: o })
    ] })
  ] });
}
function pt({ throughput: e, errorRate: t, avgLatencyMicros: o, connected: s }) {
  return /* @__PURE__ */ v("div", { style: { padding: 12 }, children: [
    /* @__PURE__ */ v("h3", { style: { margin: "0 0 8px", fontSize: 13, color: "#94a3b8", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }, children: [
      "Metrics",
      /* @__PURE__ */ r("span", { style: {
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: s ? "#22c55e" : "#ef4444"
      } })
    ] }),
    /* @__PURE__ */ v("div", { style: { display: "flex", gap: 8, flexDirection: "column" }, children: [
      /* @__PURE__ */ r(
        de,
        {
          label: "Throughput",
          value: e.toFixed(1),
          unit: "tx/s",
          color: "#60a5fa"
        }
      ),
      /* @__PURE__ */ r(
        de,
        {
          label: "Error Rate",
          value: (t * 100).toFixed(1),
          unit: "%",
          color: t > 0.1 ? "#ef4444" : "#22c55e"
        }
      ),
      /* @__PURE__ */ r(
        de,
        {
          label: "Avg Latency",
          value: o > 1e3 ? (o / 1e3).toFixed(1) : o.toString(),
          unit: o > 1e3 ? "ms" : "us",
          color: "#f59e0b"
        }
      )
    ] })
  ] });
}
function ht({ eventCount: e, onReplay: t }) {
  const [o, s] = A(!1), [i, c] = A(-1), [M, $] = A(1), l = ne(null), a = i === -1, u = F(() => {
    s(!1), l.current && (clearInterval(l.current), l.current = null);
  }, []), y = F(() => {
    u(), c(-1);
  }, [u]), x = F(() => {
    i === -1 && c(0), s(!0);
  }, [i]);
  J(() => {
    if (o)
      return l.current = setInterval(() => {
        c((h) => {
          const w = h + 1;
          return w >= e ? (u(), e - 1) : w;
        });
      }, 200 / M), () => {
        l.current && clearInterval(l.current);
      };
  }, [o, M, e, u]), J(() => {
    i >= 0 && t(i);
  }, [i, t]);
  const n = (h) => {
    u(), c(Number(h.target.value));
  };
  return /* @__PURE__ */ v("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    background: "#0f172a",
    borderTop: "1px solid #1e293b",
    fontSize: 12,
    fontFamily: "monospace"
  }, children: [
    /* @__PURE__ */ r("button", { onClick: a ? x : y, style: oe, children: a ? "Replay" : "Live" }),
    !a && /* @__PURE__ */ v(Ne, { children: [
      /* @__PURE__ */ r("button", { onClick: o ? u : x, style: oe, children: o ? "Pause" : "Play" }),
      /* @__PURE__ */ r("button", { onClick: () => c((h) => Math.max(0, h - 1)), style: oe, disabled: o, children: "<" }),
      /* @__PURE__ */ r("button", { onClick: () => c((h) => Math.min(e - 1, h + 1)), style: oe, disabled: o, children: ">" }),
      /* @__PURE__ */ r(
        "input",
        {
          type: "range",
          min: 0,
          max: Math.max(0, e - 1),
          value: i,
          onChange: n,
          style: { flex: 1 }
        }
      ),
      /* @__PURE__ */ v("span", { style: { color: "#64748b", minWidth: 60 }, children: [
        i + 1,
        " / ",
        e
      ] }),
      /* @__PURE__ */ v(
        "select",
        {
          value: M,
          onChange: (h) => $(Number(h.target.value)),
          style: { background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4, padding: "2px 4px", fontSize: 11 },
          children: [
            /* @__PURE__ */ r("option", { value: 0.5, children: "0.5x" }),
            /* @__PURE__ */ r("option", { value: 1, children: "1x" }),
            /* @__PURE__ */ r("option", { value: 2, children: "2x" }),
            /* @__PURE__ */ r("option", { value: 5, children: "5x" })
          ]
        }
      )
    ] }),
    a && /* @__PURE__ */ v("span", { style: { color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }, children: [
      /* @__PURE__ */ r("span", { style: { width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" } }),
      "LIVE — ",
      e,
      " events"
    ] })
  ] });
}
const oe = {
  background: "#1e293b",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 4,
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 11,
  fontFamily: "monospace"
};
function wt({
  wsUrl: e = "ws://localhost:3001",
  showMetrics: t = !0,
  showCarPool: o = !0,
  showReplay: s = !0
}) {
  const { state: i, send: c, replay: M, setHeatDecay: $ } = He(e), [l, a] = A(null), [u, y] = A(!0), [x, n] = A(3e3), [h, w] = A(1.5), p = F(() => {
    c({ type: "trigger", action: "start" });
  }, [c]), S = F((I) => {
    w(I), $(I);
  }, [$]), R = i.flows.map((I) => I.flowName).join(", ");
  return /* @__PURE__ */ v("div", { style: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#0f172a",
    color: "#e2e8f0",
    fontFamily: "system-ui, -apple-system, sans-serif"
  }, children: [
    /* @__PURE__ */ v("header", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 16px",
      background: "#0f172a",
      borderBottom: "1px solid #1e293b",
      flexWrap: "wrap",
      gap: 8
    }, children: [
      /* @__PURE__ */ v("div", { style: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ r("span", { style: { fontSize: 16, fontWeight: 700 }, children: "tramli-viz" }),
        R && /* @__PURE__ */ v("span", { style: { fontSize: 12, color: "#64748b" }, children: [
          "/ ",
          R
        ] }),
        /* @__PURE__ */ r("button", { onClick: () => y((I) => !I), style: {
          background: u ? "#7c3aed" : "#1e293b",
          color: "#fff",
          border: "1px solid",
          borderColor: u ? "#7c3aed" : "#334155",
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "monospace"
        }, children: u ? "Trace ON" : "Trace OFF" }),
        /* @__PURE__ */ v("label", { style: xe, children: [
          "Fade",
          /* @__PURE__ */ v("select", { value: x, onChange: (I) => n(Number(I.target.value)), style: be, children: [
            /* @__PURE__ */ r("option", { value: 1e3, children: "1s" }),
            /* @__PURE__ */ r("option", { value: 2e3, children: "2s" }),
            /* @__PURE__ */ r("option", { value: 3e3, children: "3s" }),
            /* @__PURE__ */ r("option", { value: 5e3, children: "5s" }),
            /* @__PURE__ */ r("option", { value: 1e4, children: "10s" }),
            /* @__PURE__ */ r("option", { value: 999999, children: "off" })
          ] })
        ] }),
        /* @__PURE__ */ v("label", { style: xe, children: [
          "Trail",
          /* @__PURE__ */ v("select", { value: h, onChange: (I) => S(Number(I.target.value)), style: be, children: [
            /* @__PURE__ */ r("option", { value: 0.5, children: "0.5s" }),
            /* @__PURE__ */ r("option", { value: 1, children: "1s" }),
            /* @__PURE__ */ r("option", { value: 1.5, children: "1.5s" }),
            /* @__PURE__ */ r("option", { value: 2, children: "2s" }),
            /* @__PURE__ */ r("option", { value: 5, children: "5s" }),
            /* @__PURE__ */ r("option", { value: 10, children: "10s" }),
            /* @__PURE__ */ r("option", { value: 30, children: "30s" }),
            /* @__PURE__ */ r("option", { value: 60, children: "1min" }),
            /* @__PURE__ */ r("option", { value: 300, children: "5min" }),
            /* @__PURE__ */ r("option", { value: 1800, children: "30min" }),
            /* @__PURE__ */ r("option", { value: 3600, children: "1h" }),
            /* @__PURE__ */ r("option", { value: 86400, children: "1day" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ r("button", { onClick: p, style: {
        background: "#3b82f6",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        padding: "6px 14px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer"
      }, children: "+ Spawn Flow" })
    ] }),
    /* @__PURE__ */ v("div", { style: { display: "flex", flex: 1, overflow: "hidden" }, children: [
      /* @__PURE__ */ r("div", { style: { flex: 1 }, children: /* @__PURE__ */ r(ze, { children: /* @__PURE__ */ r(
        ft,
        {
          flows: i.flows,
          flowPositions: i.flowPositions,
          flowOwner: i.flowOwner,
          transits: i.transits,
          events: i.events,
          edgeCounts: i.edgeCounts,
          nodeCounts: i.nodeCounts,
          edgeHeat: i.edgeHeat,
          selectedFlowId: l,
          onSelectFlow: a,
          traceMode: u,
          fadeAfterMs: x
        }
      ) }) }),
      (o || t) && /* @__PURE__ */ v("div", { style: {
        width: 260,
        borderLeft: "1px solid #1e293b",
        display: "flex",
        flexDirection: "column",
        background: "#0f172a"
      }, children: [
        o && /* @__PURE__ */ r("div", { style: { flex: 1, overflow: "auto" }, children: /* @__PURE__ */ r(
          ut,
          {
            flowPositions: i.flowPositions,
            flowStarted: i.flowStarted,
            selectedFlowId: l,
            onSelect: a
          }
        ) }),
        t && /* @__PURE__ */ r("div", { style: { borderTop: "1px solid #1e293b" }, children: /* @__PURE__ */ r(
          pt,
          {
            throughput: i.metrics.throughput,
            errorRate: i.metrics.errorRate,
            avgLatencyMicros: i.metrics.avgLatencyMicros,
            connected: i.connected
          }
        ) })
      ] })
    ] }),
    s && /* @__PURE__ */ r(ht, { eventCount: i.events.length, onReplay: M })
  ] });
}
const xe = {
  fontSize: 11,
  color: "#64748b",
  display: "flex",
  alignItems: "center",
  gap: 4
}, be = {
  background: "#1e293b",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 4,
  padding: "2px 4px",
  fontSize: 11,
  fontFamily: "monospace"
};
export {
  ot as ArrowEdge,
  Ye as CarLayer,
  ut as CarPool,
  ft as FlowBoard,
  Ke as FlowNode,
  rt as Legend,
  pt as Metrics,
  ht as Replay,
  q as TRANSIT_DURATION,
  et as TraceLayer,
  wt as VizDashboard,
  he as trailSecondsToDecay,
  He as useVizSocket
};
