/* ================================================================
   Living system graph
   A three.js scene of the services I build. It sits fixed behind
   the page: full strength in the hero, focusing on one service per
   case study in "Selected systems", and dimmed everywhere else.
   Falls back to the static HTML diagram when WebGL is unavailable
   or the visitor prefers reduced motion.
   ================================================================ */

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const canvas = document.getElementById('graph');
const labelLayer = document.getElementById('graph-labels');
const tip = document.getElementById('graph-tip');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Layers: 0 channels · 1 agent core · 2 platforms · 3 infrastructure · 4 data & external services */
const NODES = [
  { id: 'whatsapp', label: 'WhatsApp', layer: 0, desc: 'Agents and suppliers reach the system over WhatsApp through the Meta Business API.' },
  { id: 'email', label: 'Email', layer: 0, desc: 'Inbound email monitored through Microsoft Graph webhooks with Azure AD app registration.' },
  { id: 'voice', label: 'Voice', layer: 0, desc: 'AI voice calls with ElevenLabs that collect supplier rates and chase missing details.' },
  { id: 'web', label: 'Web chat · portal', layer: 0, desc: 'Agent portal and web chat used by more than 150 travel agents.' },
  { id: 'agent', label: 'Agent core', layer: 1, desc: 'Shared Node.js agent core running 4 isolated agents with permission boundaries and failure isolation.' },
  { id: 'mcp', label: 'MCP server', layer: 1, desc: 'In-house MCP server exposing 47 tools: flight search, fare comparison, booking and post-booking changes.' },
  { id: 'ticketing', label: 'B2B ticketing', layer: 2, desc: 'White-label platform for flights, hotels, attractions and insurance, with cart, wallet and role-based access.' },
  { id: 'inventory', label: 'Supplier inventory', layer: 2, desc: 'Central inventory fed by a supplier outreach agent and a contract document-ingestion agent.' },
  { id: 'booking', label: 'Booking app', layer: 2, desc: 'Customer-facing app: search, booking flows and cart across every product type.' },
  { id: 'finance', label: 'Finance & reports', layer: 2, desc: 'Receivables, payables, cash flow and P&L with Excel and PDF output, replacing a manual monthly process.' },
  { id: 'queue', label: 'Queues & jobs', layer: 3, infra: true, desc: 'Background jobs for order workflows and notifications, with retry and idempotency handling.' },
  { id: 'redis', label: 'Redis', layer: 3, infra: true, desc: 'Caching and fast state, alongside query optimisation, indexing and batch processing.' },
  { id: 'postgres', label: 'PostgreSQL', layer: 4, desc: 'Primary data store for the platforms and the agent system.' },
  { id: 'suppliers', label: 'Supplier APIs', layer: 4, desc: '7 supplier APIs over REST and SOAP, including RateHawk, TBO, Bridgify and GlobalTix.' },
  { id: 'openai', label: 'OpenAI', layer: 4, desc: 'Tool calling and structured outputs for the agents and for contract extraction.' },
  { id: 'firebase', label: 'Firebase', layer: 4, desc: 'Three-way real-time chat between admins, customers and suppliers, plus notifications.' }
];

const EDGES = [
  ['whatsapp', 'agent'], ['email', 'agent'], ['voice', 'agent'], ['web', 'agent'], ['web', 'ticketing'],
  ['agent', 'mcp'], ['agent', 'openai'], ['agent', 'redis'],
  ['mcp', 'ticketing'], ['mcp', 'inventory'], ['mcp', 'booking'],
  ['ticketing', 'finance'], ['ticketing', 'queue'], ['inventory', 'queue'], ['booking', 'queue'],
  ['ticketing', 'suppliers'], ['booking', 'suppliers'], ['inventory', 'postgres'], ['ticketing', 'postgres'],
  ['finance', 'postgres'], ['booking', 'redis'], ['queue', 'postgres'], ['queue', 'firebase'], ['inventory', 'firebase']
];

const LAYER_Y = [2.75, 1.35, 0, -1.3, -2.65];
const LAYER_R = [2.5, 0.95, 2.8, 1.15, 2.6];
const WIDE = 960;

if (canvas && !reduceMotion) {
  start().catch((err) => console.warn('3D graph disabled:', err));
}

async function start() {
  const THREE = await import(THREE_URL);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return; // no WebGL: static diagram stays visible
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0f1c, 9, 21);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.5, 11);

  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  scene.add(root);

  const dot = makeDotTexture(THREE);
  const lerp = (a, b, k) => a + (b - a) * k;
  const angleTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

  /* ---- nodes ---- */
  const byLayer = {};
  NODES.forEach((n) => (byLayer[n.layer] = byLayer[n.layer] || []).push(n));
  Object.keys(byLayer).forEach((L) => {
    const arr = byLayer[L];
    arr.forEach((n, i) => {
      const a = (i / arr.length) * Math.PI * 2 + L * 0.7;
      const r = arr.length === 1 ? 0 : LAYER_R[L];
      n.pos = new THREE.Vector3(Math.cos(a) * r, LAYER_Y[L], Math.sin(a) * r);
    });
  });
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

  const colorOf = (n) => (n.layer === 1 ? 0x5eead4 : n.infra ? 0xfbbf24 : n.layer === 2 ? 0xe6edf7 : 0x8e9bb3);
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const hitMeshes = [];

  NODES.forEach((n) => {
    const color = new THREE.Color(colorOf(n));
    n.size = n.layer === 1 ? 0.26 : 0.16;
    n.cur = n.size;
    n.mesh = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color }));
    n.mesh.scale.setScalar(n.size);
    n.mesh.position.copy(n.pos);
    spin.add(n.mesh);

    n.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    n.halo.scale.setScalar(n.size * 7);
    n.halo.position.copy(n.pos);
    spin.add(n.halo);

    const hit = new THREE.Mesh(sphere, hitMat);
    hit.scale.setScalar(0.5);
    hit.position.copy(n.pos);
    hit.userData.node = n;
    spin.add(hit);
    hitMeshes.push(hit);

    n.el = document.createElement('div');
    n.el.className = 'lbl';
    n.el.textContent = n.label;
    labelLayer.appendChild(n.el);
  });

  /* ---- edges ---- */
  const edges = EDGES.map(([a, b]) => {
    const A = byId[a], B = byId[b];
    const mat = new THREE.LineBasicMaterial({ color: 0x2a3a5c, transparent: true, opacity: 0.75 });
    spin.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([A.pos, B.pos]), mat));
    return { a: A, b: B, mat, infra: !!(A.infra || B.infra) };
  });

  /* ---- packets: requests (teal) and jobs (amber) ---- */
  const P = 80;
  const pPos = new Float32Array(P * 3);
  const pCol = new Float32Array(P * 3);
  const cReq = new THREE.Color(0x5eead4);
  const cJob = new THREE.Color(0xfbbf24);
  const resetPacket = (p) => Object.assign(p, { e: edges[(Math.random() * edges.length) | 0], t: 0, sp: 0.25 + Math.random() * 0.4, dir: Math.random() < 0.7 ? 1 : -1 });
  const packets = Array.from({ length: P }, () => { const p = resetPacket({}); p.t = Math.random(); return p; });
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  spin.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.17, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

  /* ---- state driven by the page ---- */
  const state = { mode: 'hero', focusId: null, hit: false, nx: 0, ny: 0, pinned: null, tap: false };
  const isWide = () => window.innerWidth >= WIDE;

  function applyMode() {
    const strong = state.mode === 'hero' || (state.mode === 'focus' && isWide());
    canvas.style.opacity = strong ? '1' : '0.16';
    labelLayer.style.opacity = strong ? '1' : '0';
  }

  const sectionObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { state.mode = e.target.dataset.graph; applyMode(); } });
  }, { rootMargin: '-45% 0px -54% 0px' });
  document.querySelectorAll('[data-graph]').forEach((s) => sectionObs.observe(s));

  const focusEls = Array.from(document.querySelectorAll('[data-node]'));
  const focusObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      state.focusId = e.target.dataset.node;
      focusEls.forEach((el) => el.classList.toggle('is-focus', el === e.target));
    });
  }, { rootMargin: '-40% 0px -50% 0px' });
  focusEls.forEach((el) => focusObs.observe(el));

  function readPointer(e) {
    state.nx = (e.clientX / window.innerWidth) * 2 - 1;
    state.ny = -((e.clientY / window.innerHeight) * 2 - 1);
    const t = e.target;
    state.hit = !!(t && t.closest && t.closest('[data-graph-hit]') && !t.closest('.no-hit, a, button, header'));
  }
  window.addEventListener('pointermove', readPointer, { passive: true });
  window.addEventListener('pointerdown', (e) => { readPointer(e); state.tap = true; }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { state.hit = false; });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyMode();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---- loop ---- */
  const ray = new THREE.Raycaster();
  const v = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const project = (vec) => { v.copy(vec).project(camera); return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight }; };
  const tipTitle = tip.querySelector('strong');
  const tipText = tip.querySelector('span');
  let last = performance.now();
  let shown = false;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const wide = isWide();

    // what the graph should look at
    const focus = state.mode === 'focus' && wide ? byId[state.focusId] || null : null;
    let hovered = null;
    if (state.hit && state.mode === 'hero') {
      ndc.set(state.nx, state.ny);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(hitMeshes, false)[0];
      hovered = hit ? hit.object.userData.node : null;
    }
    if (state.tap) { state.pinned = state.mode === 'hero' ? hovered : null; state.tap = false; }
    if (state.mode !== 'hero') state.pinned = null;
    const active = hovered || state.pinned || focus;

    // layout targets
    let tx = wide ? 3.0 : 0, ty = wide ? 0 : -2.3, tz = wide ? 11 : 15.5;
    if (focus) {
      tx = 3.2; ty = -focus.pos.y * 0.55; tz = 9.4;
      const face = Math.atan2(-focus.pos.x, focus.pos.z);
      spin.rotation.y += angleTo(spin.rotation.y, face) * 0.06;
    } else if (!hovered && !state.pinned) {
      spin.rotation.y += dt * 0.14;
    }
    root.position.x = lerp(root.position.x, tx, 0.06);
    root.position.y = lerp(root.position.y, ty, 0.06);
    camera.position.z = lerp(camera.position.z, tz, 0.06);
    root.rotation.x = lerp(root.rotation.x, state.hit ? -state.ny * 0.15 : 0.06, 0.05);
    root.rotation.z = lerp(root.rotation.z, state.hit ? -state.nx * 0.05 : 0, 0.05);

    // packets
    for (let i = 0; i < P; i++) {
      const p = packets[i];
      p.t += dt * p.sp;
      if (p.t >= 1) resetPacket(p);
      const a = p.dir > 0 ? p.e.a.pos : p.e.b.pos;
      const b = p.dir > 0 ? p.e.b.pos : p.e.a.pos;
      pPos[i * 3] = lerp(a.x, b.x, p.t);
      pPos[i * 3 + 1] = lerp(a.y, b.y, p.t);
      pPos[i * 3 + 2] = lerp(a.z, b.z, p.t);
      const c = p.e.infra ? cJob : cReq;
      const dim = active && p.e.a !== active && p.e.b !== active ? 0.22 : 1;
      pCol[i * 3] = c.r * dim; pCol[i * 3 + 1] = c.g * dim; pCol[i * 3 + 2] = c.b * dim;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;

    edges.forEach((e) => {
      const on = active && (e.a === active || e.b === active);
      e.mat.color.setHex(on ? 0x5eead4 : 0x2a3a5c);
      e.mat.opacity = lerp(e.mat.opacity, active ? (on ? 1 : 0.2) : 0.75, 0.15);
    });

    // nodes + labels
    scene.updateMatrixWorld(true);
    const rootZ = root.getWorldPosition(v).z;
    NODES.forEach((n) => {
      n.cur = lerp(n.cur, n === active ? n.size * 1.6 : n.size, 0.18);
      n.mesh.scale.setScalar(n.cur);
      n.halo.material.opacity = n === active ? 0.6 : 0.32;
      n.mesh.getWorldPosition(v);
      const back = v.z - rootZ < -1.4;
      const s = project(v);
      n.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, 14px)`;
      n.el.style.opacity = back ? '0.35' : '1';
      n.el.classList.toggle('on', n === active);
    });

    // tooltip
    const showTip = active && (state.mode === 'hero' || (state.mode === 'focus' && wide));
    if (showTip) {
      active.mesh.getWorldPosition(v);
      const s = project(v);
      tipTitle.textContent = active.label;
      tipText.textContent = active.desc;
      const x = Math.min(Math.max(16, s.x + 24), window.innerWidth - 286);
      const y = Math.min(Math.max(80, s.y - 40), window.innerHeight - 140);
      tip.style.transform = `translate(${x}px, ${y}px)`;
    }
    tip.hidden = !showTip;

    renderer.render(scene, camera);

    if (!shown) {
      shown = true;
      document.documentElement.classList.add('has-3d');
      applyMode();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function makeDotTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.22, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
