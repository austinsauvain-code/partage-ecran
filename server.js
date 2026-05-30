// Serveur du salon : sert le client, relaie la signalisation WebRTC (voix + écran)
// et les messages du chat texte. Aucune donnée n'est stockée durablement.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Sert le client. index.html est à la racine du projet.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
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
