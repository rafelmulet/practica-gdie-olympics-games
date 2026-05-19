const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Sirve los archivos estáticos desde el directorio donde pongas tus HTML, CSS, JS y media
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    // Gestión de salas
    socket.on('join', (room) => {
        const clients = io.sockets.adapter.rooms.get(room);
        const numClients = clients ? clients.size : 0;

        if (numClients === 0) {
            socket.join(room);
            socket.emit('created', room, socket.id);
        } else if (numClients === 1) {
            socket.join(room);
            socket.emit('joined', room, socket.id);
            // Avisamos a la sala entera de que ya hay 2 peers listos
            io.sockets.in(room).emit('ready');
        } else {
            // Sala llena (max 2 clientes para WebRTC P2P básico)
            socket.emit('full', room);
        }
    });

    // Reenvío de mensajes de señalización (offer, answer, ICE candidates)
    socket.on('message', (data) => {
        // Envia el mensaje a la sala especificada, excepto al emisor
        socket.to(data.room).emit('message', data.message);
    });

    socket.on('disconnect', () => {
        console.log(`Usuario desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de señalización escuchando en http://localhost:${PORT}`);
});