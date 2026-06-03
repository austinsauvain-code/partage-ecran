// Serveur du salon : sert le client, relaie la signalisation WebRTC (voix + ecran)
// et les messages du chat texte. Aucune donnee n'est stockee durablement.

const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);

// Limite la taille des messages temps reel (anti-DoS : 100 Ko max par trame).
const io = new Server(server, { maxHttpBufferSize: 1e5 });

const PORT = process.env.PORT || 3000;

// Render place l'app derriere un proxy : necessaire pour HTTPS + limites par IP.
app.set('trust proxy', 1);

// --- En-tetes de securite (Helmet) ---
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://flagcdn.com", "https://*.supabase.co"],
      mediaSrc: ["'self'", "blob:", "https://*.supabase.co"],
      connectSrc: [
        "'self'",
        "https://*.supabase.co", "wss://*.supabase.co",
        "https://cdn.jsdelivr.net",
        "wss://partage-ecran.onrender.com", "ws://partage-ecran.onrender.com"
      ],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameSrc: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// --- Inscription pseudo + mot de passe, sans email ---
const SUPA_URL = process.env.SUPABASE_URL || 'https://pukzfqdfkvojwznxqqme.supabase.co';
const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const EMAIL_DOMAIN = 'tslive.app';
const admin = SUPA_SERVICE_KEY
  ? createClient(SUPA_URL, SUPA_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

function emailFromUsername(u) {
  const clean = String(u || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  return clean ? clean + '@' + EMAIL_DOMAIN : '';
}

// Corps JSON limite a 16 Ko.
app.use(express.json({ limit: '16kb' }));

// Anti-spam sur la creation de comptes : 12 tentatives / heure / IP.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives d'inscription. Reessayez dans une heure." }
});

app.post('/api/register', registerLimiter, async (req, res) => {
  if (!admin) return res.status(503).json({ error: "Inscription pas encore configuree sur le serveur." });
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  const email = emailFromUsername(name);
  if (!email) return res.status(400).json({ error: "Pseudo invalide (lettres, chiffres, . _ - )." });
  if (name.length > 40) return res.status(400).json({ error: "Pseudo trop long (40 caracteres max)." });
  if (!password || String(password).length < 6) return res.status(400).json({ error: "Mot de passe : 6 caracteres minimum." });
  if (String(password).length > 200) return res.status(400).json({ error: "Mot de passe trop long." });
  try {
    const { error } = await admin.auth.admin.createUser({
      email,
      password: String(password),
      email_confirm: true,
      user_metadata: { username: name }
    });
    if (error) {
      const taken = /already|exists|registered|duplicate/i.test(error.message);
      return res.status(taken ? 409 : 400).json({ error: taken ? "Ce pseudo est deja pris." : error.message });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.use(express.static(__dirname, { index: false }));

// --- Garde-fou anti-flood par socket ---
function makeBucket(maxEvents, windowMs) {
  let hits = [];
  return function allow() {
    const now = Date.now();
    hits = hits.filter(t => now - t < windowMs);
    if (hits.length >= maxEvents) return false;
    hits.push(now);
    return true;
  };
}

io.on('connection', (socket) => {
  let currentRoom = null;
  const chatBucket = makeBucket(20, 10000);
  const signalBucket = makeBucket(400, 10000);

  socket.on('join', ({ roomId, name } = {}) => {
    roomId = String(roomId || '').trim().slice(0, 80);
    if (!roomId) return;
    const displayName = (name && String(name).trim().slice(0, 40)) || 'Invite';
    socket.data.name = displayName;
    currentRoom = roomId;
    socket.join(roomId);
    const peers = [];
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      for (const id of room) {
        if (id === socket.id) continue;
        const s = io.sockets.sockets.get(id);
        peers.push({ id, name: (s && s.data && s.data.name) || 'Invite' });
      }
    }
    socket.emit('joined', { roomId, selfId: socket.id, peers });
    socket.to(roomId).emit('peer-joined', { peerId: socket.id, name: displayName });
    console.log('[join] ' + displayName + ' (' + socket.id + ') -> ' + roomId);
  });

  socket.on('signal', ({ to, data } = {}) => {
    if (!to || !currentRoom || !signalBucket()) return;
    const dest = io.sockets.sockets.get(to);
    if (!dest || !dest.rooms.has(currentRoom)) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('chat', ({ text } = {}) => {
    if (!currentRoom || !chatBucket()) return;
    text = String(text || '').slice(0, 2000);
    if (!text.trim()) return;
    socket.to(currentRoom).emit('chat', {
      from: socket.id,
      name: socket.data.name || 'Invite',
      text,
      ts: Date.now()
    });
  });

  socket.on('stop-share', () => {
    if (currentRoom) socket.to(currentRoom).emit('share-stopped', { peerId: socket.id });
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      socket.to(currentRoom).emit('peer-left', { peerId: socket.id, name: socket.data.name || 'Invite' });
    }
    console.log('[disconnect] ' + socket.id);
  });
});

server.listen(PORT, () => {
  console.log('Serveur de partage d ecran sur http://localhost:' + PORT);
});
