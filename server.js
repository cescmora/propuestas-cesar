const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'proposals.json');
const TEMPLATE = fs.readFileSync(path.join(__dirname, 'templates', 'propuesta.html'), 'utf-8');

const ADMIN_USER = 'cesar';
const ADMIN_PASS = 'Prop#2025cesar';
const SESSION_SECRET = 'p9Kx2mQv7nRw4tLs6hJcYeAzBuFdGiNo';

app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 },
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login.html');
}

app.get('/admin.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ── helpers ──────────────────────────────────────────────────────────────────

function generateSlug(firstName, lastName, proposals) {
  const name = [firstName, lastName].filter(Boolean).join(' ');
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  const existing = proposals.map(p => p.id);
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function readProposals() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeProposals(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatDate(iso) {
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                  'septiembre','octubre','noviembre','diciembre'];
  const d = new Date(iso);
  return `${d.getUTCDate()} de ${months[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

// contentTypes puede ser array de strings (legado) u objetos {name, desc}
function generateContentTypesHTML(types) {
  if (!types || !types.length) return '';
  return types.map((t, i) => {
    const num  = String(i + 1).padStart(2, '0');
    const name = typeof t === 'string' ? t : (t.name || '');
    const desc = typeof t === 'string' ? '' : (t.desc || '');
    return (
      '<div class="content-type-item">' +
        '<div class="prop-num">'  + num       + '</div>' +
        '<div class="prop-tipo">' + esc(name) + '</div>' +
        '<div class="prop-desc">' + esc(desc) + '</div>' +
      '</div>'
    );
  }).join('\n');
}

// semanas puede ser array de objetos {tipo, plus} o derivarse de contentTypes (legado)
function generateSemanasHTML(semanas, types) {
  let items;
  if (semanas && semanas.length) {
    items = semanas.slice(0, 4).map(s => ({ tipo: s.tipo || '', plus: s.plus || '' }));
  } else {
    // legado: distribuir tipos entre 4 semanas
    const fallback = (types || []).map(t => (typeof t === 'string' ? t : t.name));
    if (!fallback.length) fallback.push('Contenido');
    items = [0, 1, 2, 3].map(i => ({
      tipo: fallback[i % fallback.length],
      plus: fallback.length > 1 ? '+ Coordinación' : '',
    }));
  }
  return items.map((s, i) =>
    '<div class="sem-block">' +
      '<div class="sem-num">Semana ' + (i + 1) + '</div>' +
      '<div class="sem-tipo">' + esc(s.tipo) + '</div>' +
      '<div class="sem-plus">' + esc(s.plus) + '</div>' +
    '</div>'
  ).join('\n');
}

function generateIncludesHTML(includes, types) {
  let items = [];
  if (includes && includes.trim()) {
    items = includes.split('\n').map(l => l.trim()).filter(Boolean);
  } else if (types && types.length) {
    items = types.map(t => {
      const name = typeof t === 'string' ? t : (t.name || '');
      return `${name} — producción completa incluida`;
    });
  }
  return items
    .map(item => '<li><span class="inv-dash">—</span> ' + esc(item) + '</li>')
    .join('\n');
}

function renderProposal(p) {
  const firstName  = esc(p.firstName || (p.clientName || '').split(' ')[0]);
  const lastName   = esc(p.lastName  || (p.clientName || '').split(' ').slice(1).join(' ') || '');
  const clientName = [firstName, lastName].filter(Boolean).join(' ');
  const date       = formatDate(p.createdAt);
  const price      = '$' + Number(p.price).toLocaleString('es-CR');

  const contentTypesHTML = generateContentTypesHTML(p.contentTypes);
  const semanasHTML      = generateSemanasHTML(p.semanas, p.contentTypes);
  const includesHTML     = generateIncludesHTML(p.includes, p.contentTypes);
  const proposalIntro    = p.proposalIntro
    ? esc(p.proposalIntro)
    : 'Preparé esta propuesta pensando en ' + firstName +
      ' y en lo que ' + esc(p.industry || 'tu marca') +
      ' necesita para crecer con constancia en redes sociales.';

  // Usar funciones en replace() evita que $, $& etc. del valor se interpreten como patrones
  return TEMPLATE
    .replace(/\{\{CLIENT_NAME\}\}/g,         () => clientName)
    .replace(/\{\{CLIENT_FIRST_NAME\}\}/g,   () => firstName)
    .replace(/\{\{CLIENT_LAST_NAME\}\}/g,    () => lastName)
    .replace(/\{\{CLIENT_INDUSTRY\}\}/g,     () => esc(p.industry || ''))
    .replace(/\{\{DATE\}\}/g,               () => date)
    .replace(/\{\{PLAN_NAME\}\}/g,           () => esc(p.plan || ''))
    .replace(/\{\{PRICE\}\}/g,              () => price)
    .replace(/\{\{PROPOSAL_INTRO\}\}/g,      () => proposalIntro)
    .replace(/\{\{CONTENT_TYPES_HTML\}\}/g,  () => contentTypesHTML)
    .replace(/\{\{SEMANAS_HTML\}\}/g,        () => semanasHTML)
    .replace(/\{\{INCLUDES_HTML\}\}/g,       () => includesHTML);
}

// ── rutas ─────────────────────────────────────────────────────────────────────

app.get('/p/:id', (req, res) => {
  try {
    const proposal = readProposals().find(p => p.id === req.params.id);
    if (!proposal) return res.status(404).send('<h2>Propuesta no encontrada</h2>');
    res.send(renderProposal(proposal));
  } catch (err) {
    console.error('Error al renderizar propuesta:', err);
    res.status(500).send('<h2>Error interno al generar la propuesta</h2>');
  }
});

app.post('/api/proposals', (req, res) => {
  const { firstName, lastName, industry, plan, price,
          contentTypes, semanas, proposalIntro, includes } = req.body;
  if (!firstName || !plan || !price) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }
  const proposals = readProposals();
  const id = generateSlug(firstName, lastName, proposals);
  proposals.push({
    id,
    firstName,
    lastName:      lastName      || '',
    industry:      industry      || '',
    plan,
    price:         Number(price),
    contentTypes:  contentTypes  || [],
    semanas:       semanas       || [],
    proposalIntro: proposalIntro || '',
    includes:      includes      || '',
    createdAt: new Date().toISOString(),
  });
  writeProposals(proposals);
  res.json({ id, url: `/p/${id}` });
});

app.get('/api/proposals', (req, res) => {
  res.json(readProposals());
});

app.get('/api/proposals/:id', (req, res) => {
  const proposal = readProposals().find(p => p.id === req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada.' });
  res.json(proposal);
});

app.delete('/api/proposals/:id', (req, res) => {
  const proposals = readProposals();
  const filtered = proposals.filter(p => p.id !== req.params.id);
  if (filtered.length === proposals.length) {
    return res.status(404).json({ error: 'Propuesta no encontrada.' });
  }
  writeProposals(filtered);
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Credenciales incorrectas.' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin.html`);
});
