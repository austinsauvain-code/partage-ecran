// Serveur du salon : sert le client, relaie la signalisation WebRTC (voix + écran)
// et les messages du chat texte. Aucune donnée n'est stockée durablement.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- Inscription pseudo + mot de passe, sans email ---
// Le serveur crée les comptes déjà confirmés via la clé service Supabase.
// La clé secrète est lue depuis l'environnement (jamais en clair dans le code).
const SUPA_URL = process.env.SUPABASE_URL || 'https://pukzfqdfkvojwznxqqme.supabase.co';
const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const EMAIL_DOMAIN = 'tslive.app'; // domaine interne (aucun email n'est envoyé)
const admin = SUPA_SERVICE_KEY
  ? createClient(SUPA_URL, SUPA_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

// Normalise un pseudo en identifiant d'email interne (doit être identique côté client)
function emailFromUsername(u) {
  const clean = String(u || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  return clean ? clean + '@' + EMAIL_DOMAIN : '';
}

app.use(express.json());

app.post('/api/register', async (req, res) => {
  if (!admin) return res.status(503).json({ error: "Inscription pas encore configurée sur le serveur." });
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  const email = emailFromUsername(name);
  if (!email) return res.status(400).json({ error: "Pseudo invalide (lettres, chiffres, . _ - )." });
  if (!password || String(password).length < 6) return res.status(400).json({ error: "Mot de passe : 6 caractères minimum." });
  try {
    const { error } = await admin.auth.admin.createUser({
      email,
      password: String(password),
      email_confirm: true,
      user_metadata: { username: name }
    });
    if (error) {
      const taken = /already|exists|registered|duplicate/i.test(error.message);
      return res.status(taken ? 409 : 400).json({ error: taken ? "Ce pseudo est déjà pris." : error.message });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur lors de l'inscription." });
  }
});

// Accueil = coquille de l'app (Discord-like). L'app de streaming reste
// accessible en /index.html (affichée dans un cadre intégré).
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.use(express.static(__dirname, { index: false }));

io.on('connection', (socket) => {
  let currentRoom = null;

  // Rejoindre un salon
  socket.on('join', ({ roomId, name } = {}) => {
    roomId = String(roomId || '').trim();
    if (!roomId) return;

    const displayName = (name && String(name).trim().slice(0, 40)) || 'Invité';
    socket.data.name = displayName;
    currentRoom = roomId;
    socket.join(roomId);

    // Liste des pairs déjà présents (avec leur nom)
    const peers = [];
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      for (const id of room) {
        if (id === socket.id) continue;
        const s = io.sockets.sockets.get(id);
        peers.push({ id, name: (s && s.data && s.data.name) || 'Invité' });
      }
    }

    socket.emit('joined', { roomId, selfId: socket.id, peers });
    socket.to(roomId).emit('peer-joined', { peerId: socket.id, name: displayName });
    console.log(`[join] ${displayName} (${socket.id}) -> ${roomId}`);
  });

  // Relais de signalisation WebRTC (perfect negotiation : description ou candidate)
  // payload = { to: <socketId>, data: { description } | { candidate } }
  socket.on('signal', ({ to, data }) => {
    if (!to) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // Message du chat texte : diffusé aux autres membres du salon
  socket.on('chat', ({ text } = {}) => {
    text = String(text || '').slice(0, 2000);
    if (!text.trim() || !currentRoom) return;
    socket.to(currentRoom).emit('chat', {
      from: socket.id,
      name: socket.data.name || 'Invité',
      text,
      ts: Date.now()
    });
  });

  // L'émetteur a arrêté son partage d'écran
  socket.on('stop-share', () => {
    if (currentRoom) socket.to(currentRoom).emit('share-stopped', { peerId: socket.id });
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      socket.to(currentRoom).emit('peer-left', {
        peerId: socket.id,
        name: socket.data.name || 'Invité'
      });
    }
    console.log(`[disconnect] ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Serveur de partage d'écran sur http://localhost:${PORT}`);
});
