// Serveur de signalisation WebRTC pour le partage d'écran
// Express sert les fichiers statiques, Socket.io relaie offer/answer/ICE par "room".

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

// État en mémoire : qui est dans quelle room
// rooms[roomId] = Set des socket.id présents
const rooms = {};

io.on('connection', (socket) => {
  let currentRoom = null;

  // Rejoindre une room
  socket.on('join', (roomId) => {
    roomId = String(roomId || '').trim();
    if (!roomId) return;

    currentRoom = roomId;
    socket.join(roomId);
    rooms[roomId] = rooms[roomId] || new Set();
    rooms[roomId].add(socket.id);

    const others = [...rooms[roomId]].filter((id) => id !== socket.id);

    // Confirme au nouvel arrivant qui est déjà présent
    socket.emit('joined', { roomId, peers: others });

    // Prévient les autres qu'un pair a rejoint
    socket.to(roomId).emit('peer-joined', { peerId: socket.id });

    console.log(`[join] ${socket.id} -> room ${roomId} (${rooms[roomId].size} pairs)`);
  });

  // Relais des messages de signalisation (offer / answer / candidate)
  // payload = { to: <socketId>, data: <SDP ou ICE> }
  socket.on('signal', ({ to, data }) => {
    if (!to) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // L'émetteur a arrêté le partage
  socket.on('stop-share', () => {
    if (currentRoom) socket.to(currentRoom).emit('share-stopped', { peerId: socket.id });
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].delete(socket.id);
      socket.to(currentRoom).emit('peer-left', { peerId: socket.id });
      if (rooms[currentRoom].size === 0) delete rooms[currentRoom];
    }
    console.log(`[disconnect] ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Serveur de partage d'écran sur http://localhost:${PORT}`);
});
