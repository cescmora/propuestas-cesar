const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'proposals.json');
const COT_FILE  = path.join(__dirname, 'data', 'cotizaciones.json');
const TEMPLATE     = fs.readFileSync(path.join(__dirname, 'templates', 'propuesta.html'), 'utf-8');
const COT_TEMPLATE = fs.readFileSync(path.join(__dirname, 'templates', 'cotizacion.html'), 'utf-8');

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

app.get('/admin-cotizacion.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-cotizacion.html'));
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

function readJSON(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function readProposals() {
  return readJSON(DATA_FILE);
}

function writeProposals(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function readCotizaciones() {
  return readJSON(COT_FILE);
}

function writeCotizaciones(data) {
  fs.mkdirSync(path.dirname(COT_FILE), { recursive: true });
  fs.writeFileSync(COT_FILE, JSON.stringify(data, null, 2));
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
function generateSemanasHTML(semanas, types, stepLabel = 'Semana') {
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
      '<div class="sem-num">' + stepLabel + ' ' + (i + 1) + '</div>' +
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
  const isProyecto       = p.tipo === 'proyecto';
  const semanasHTML      = generateSemanasHTML(p.semanas, p.contentTypes, isProyecto ? 'Paso' : 'Semana');
  const T = isProyecto ? {
    procesoTitle: 'paso a paso',
    procesoIntro: 'Un solo día de producción. Antes definimos guion y hooks, el día de grabación llegamos con equipo listo, y después editamos y entregamos todo listo para publicar.',
    cadencia:     'pago único',
    pagoTxt:      '50% para reservar la fecha de producción y 50% contra entrega del material final.',
    cierre1:      'Un video no funciona solo por cómo se ve. Funciona cuando los primeros segundos detienen a la persona correcta. Por eso cada video sale con varias versiones de hook: las publicamos, medimos cuál retiene mejor y sabemos con datos qué mensaje conecta.',
    cierre2:      'Eso te deja dos videos listos y una lectura clara de qué decir y cómo decirlo en lo que venga.',
    footNote:     'Propuesta válida 30 días · Precios en USD',
  } : {
    procesoTitle: 'cada mes',
    procesoIntro: 'Un día de producción al mes es todo lo que necesitamos. Organizamos la fecha, llegamos al sitio con equipo listo y grabamos el material para el mes completo. Cuatro piezas editadas y listas para publicar.',
    cadencia:     'por mes &nbsp;·&nbsp; mínimo 3 meses',
    pagoTxt:      'El pago mensual se realiza dentro de los primeros 5 días de cada mes para iniciar la planificación a tiempo.',
    cierre1:      'Los resultados en redes no son inmediatos — y cualquiera que te diga lo contrario no te está siendo honesto. Lo que sí ocurre cuando hay constancia y criterio es que con el tiempo la audiencia correcta empieza a encontrarte, a seguirte y a confiar en ti.',
    cierre2:      'Para esto vamos a probar formatos, identificar qué conecta con tu audiencia y repetirlo con intención.',
    footNote:     'Propuesta válida 30 días · Precios en USD · Mínimo 3 meses',
  };
  const includesHTML     = generateIncludesHTML(p.includes, p.contentTypes);
  const proposalIntro    = p.proposalIntro
    ? esc(p.proposalIntro)
    : 'Lo que vamos a construir juntos no es una cuenta más de redes. Es la versión digital de lo que ya eres: alguien con experiencia, criterio y una forma propia de hacer las cosas. La estrategia parte de escucharte: cómo hablas de tu trabajo, qué detalles te importan y cómo describes lo que haces con orgullo. Eso es lo que traducimos en contenido. Y por eso se va a ver diferente a todo lo demás.';

  // Usar funciones en replace() evita que $, $& etc. del valor se interpreten como patrones
  if (p.iva) {
    T.cadencia += ' &nbsp;·&nbsp; + IVA (13%)';
    T.footNote  = T.footNote.replace('Precios en USD', 'Precios en USD + IVA');
  }

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
    .replace(/\{\{INCLUDES_HTML\}\}/g,       () => includesHTML)
    .replace(/\{\{PROCESO_TITLE\}\}/g,       () => T.procesoTitle)
    .replace(/\{\{PROCESO_INTRO\}\}/g,       () => T.procesoIntro)
    .replace(/\{\{INV_CADENCIA\}\}/g,        () => T.cadencia)
    .replace(/\{\{PAGO_TXT\}\}/g,            () => T.pagoTxt)
    .replace(/\{\{CIERRE_1\}\}/g,            () => T.cierre1)
    .replace(/\{\{CIERRE_2\}\}/g,            () => T.cierre2)
    .replace(/\{\{FOOT_NOTE\}\}/g,           () => T.footNote);
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
  const { firstName, lastName, industry, plan, price, tipo, iva,
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
    tipo:          tipo === 'proyecto' ? 'proyecto' : 'mensual',
    iva:           iva === true,
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

// ── cotizaciones ──────────────────────────────────────────────────────────────

function generateCotizacionId(clientName, cotizaciones) {
  const base = 'cot-' + clientName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const existing = cotizaciones.map(c => c.id);
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function generateCotizacionRef(cotizaciones) {
  const year = new Date().getFullYear();
  const re = new RegExp(`^COT-${year}-(\\d+)$`);
  let max = 0;
  cotizaciones.forEach(c => {
    if (c.ref) { const m = c.ref.match(re); if (m) max = Math.max(max, parseInt(m[1])); }
  });
  return `COT-${year}-${String(max + 1).padStart(3, '0')}`;
}

function formatDateFromISO(iso) {
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                  'septiembre','octubre','noviembre','diciembre'];
  const d = new Date(iso + 'T12:00:00Z');
  return `${d.getUTCDate()} de ${months[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtUSD(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderCotizacion(c) {
  const iva   = Math.round(c.subtotal * 0.13 * 100) / 100;
  const total = Math.round(c.subtotal * 1.13 * 100) / 100;
  const validUntil = addDays(c.fecha, 30);

  return COT_TEMPLATE
    .replace(/\{\{CLIENT_NAME\}\}/g,           () => esc(c.clientName))
    .replace(/\{\{EMPRESA\}\}/g,               () => esc(c.empresa || ''))
    .replace(/\{\{COT_REF\}\}/g,               () => esc(c.ref))
    .replace(/\{\{DATE\}\}/g,                  () => formatDateFromISO(c.fecha))
    .replace(/\{\{VALID_UNTIL\}\}/g,           () => formatDateFromISO(validUntil))
    .replace(/\{\{DESCRIPCION_SERVICIO\}\}/g,  () => esc(c.descripcionServicio))
    .replace(/\{\{DETALLES_PROYECTO\}\}/g,     () => esc(c.detallesProyecto || ''))
    .replace(/\{\{CANTIDAD_PIEZAS\}\}/g,       () => esc(String(c.cantidadPiezas || '—')))
    .replace(/\{\{FORMATO\}\}/g,               () => esc(c.formato || '—'))
    .replace(/\{\{DURACION_ESTIMADA\}\}/g,     () => esc(c.duracionEstimada || '—'))
    .replace(/\{\{TIEMPO_PRODUCCION\}\}/g,     () => esc(c.tiempoProduccion || '—'))
    .replace(/\{\{SUBTOTAL_FMT\}\}/g,          () => fmtUSD(c.subtotal))
    .replace(/\{\{IVA_FMT\}\}/g,               () => fmtUSD(iva))
    .replace(/\{\{TOTAL_FMT\}\}/g,             () => fmtUSD(total));
}

app.get('/cotizacion/:id', (req, res) => {
  try {
    const cot = readCotizaciones().find(c => c.id === req.params.id);
    if (!cot) return res.status(404).send('<h2>Cotización no encontrada</h2>');
    res.send(renderCotizacion(cot));
  } catch (err) {
    console.error('Error al renderizar cotización:', err);
    res.status(500).send('<h2>Error interno al generar la cotización</h2>');
  }
});

app.post('/api/cotizaciones', (req, res) => {
  const { clientName, empresa, fecha, descripcionServicio, detallesProyecto,
          cantidadPiezas, formato, duracionEstimada, tiempoProduccion, subtotal } = req.body;
  if (!clientName || !fecha || !descripcionServicio || subtotal === undefined) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }
  const cotizaciones = readCotizaciones();
  const id  = generateCotizacionId(clientName, cotizaciones);
  const ref = generateCotizacionRef(cotizaciones);
  cotizaciones.push({
    id, ref,
    clientName,
    empresa:             empresa             || '',
    fecha,
    descripcionServicio,
    detallesProyecto:    detallesProyecto    || '',
    cantidadPiezas:      cantidadPiezas      || '',
    formato:             formato             || '',
    duracionEstimada:    duracionEstimada    || '',
    tiempoProduccion:    tiempoProduccion    || '',
    subtotal:            Number(subtotal),
    createdAt: new Date().toISOString(),
  });
  writeCotizaciones(cotizaciones);
  res.json({ id, ref, url: `/cotizacion/${id}` });
});

app.get('/api/cotizaciones', (req, res) => {
  res.json(readCotizaciones());
});

app.get('/api/cotizaciones/:id', (req, res) => {
  const cot = readCotizaciones().find(c => c.id === req.params.id);
  if (!cot) return res.status(404).json({ error: 'Cotización no encontrada.' });
  res.json(cot);
});

app.delete('/api/cotizaciones/:id', (req, res) => {
  const list = readCotizaciones();
  const filtered = list.filter(c => c.id !== req.params.id);
  if (filtered.length === list.length) {
    return res.status(404).json({ error: 'Cotización no encontrada.' });
  }
  writeCotizaciones(filtered);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin.html`);
});
