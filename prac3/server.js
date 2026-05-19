"use strict";

// ============================================================
// server.js — Servidor de señalización WebRTC
// Compatible con visualizador.js y respondedor.js
//
// Eventos que gestiona:
//   join      → un cliente se une a una sala
//   message   → reenvía offer / answer / ice-candidate
//               entre visualizador y respondedor
//
// Cuando hay 2 clientes en la sala emite "ready" al primero
// (visualizador) para que inicie el handshake WebRTC.
// ============================================================

const express    = require("express");
const http       = require("http");
const path       = require("path");
const { Server } = require("socket.io");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);
const PORT   = process.env.PORT || 80;

// Sirve TODOS los archivos de la carpeta raíz del proyecto
// (donde están visualizador.html, respondedor.html, css/, js/, media/, tracks/)
// En producción, __dirname apunta a /ruta/al/servidor/app
app.use(express.static(path.join(__dirname)));

// ── Salas ────────────────────────────────────────────────────
// rooms[roomId] = [socketId, socketId]
const rooms = {};

io.on("connection", (socket) => {
    console.log(`[+] Conectado: ${socket.id}`);

    // ── join ─────────────────────────────────────────────────
    // El visualizador y el respondedor emiten join('sala-quiz')
    socket.on("join", (roomId) => {
        if (!rooms[roomId]) rooms[roomId] = [];

        const room = rooms[roomId];

        if (room.length >= 2) {
            socket.emit("full", roomId);
            console.log(`[!] Sala "${roomId}" llena.`);
            return;
        }

        room.push(socket.id);
        socket.join(roomId);
        socket.currentRoom = roomId;

        console.log(`[=] ${socket.id} → sala "${roomId}" (${room.length}/2)`);

        // Cuando hay 2 clientes → avisar al PRIMERO (visualizador)
        // para que cree la RTCPeerConnection y emita el offer
        if (room.length === 2) {
            // room[0] es el visualizador (llegó primero)
            io.to(room[0]).emit("ready");
            console.log(`[✓] Sala "${roomId}" lista. Emitiendo "ready" al visualizador.`);
        }
    });

    // ── message ──────────────────────────────────────────────
    // Reenvía offer, answer y candidatos ICE entre los dos peers.
    // Payload: { room: string, message: RTCSessionDescription | candidate }
    socket.on("message", ({ room: roomId, message }) => {
        // Reenviar al OTRO socket de la sala (no al emisor)
        socket.to(roomId).emit("message", message);

        const tipo = message.type || "candidate";
        console.log(`[>] ${tipo} de ${socket.id} → sala "${roomId}"`);
    });

    // ── disconnect ───────────────────────────────────────────
    socket.on("disconnect", () => {
        console.log(`[-] Desconectado: ${socket.id}`);

        const roomId = socket.currentRoom;
        if (!roomId || !rooms[roomId]) return;

        rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);

        if (rooms[roomId].length === 0) {
            delete rooms[roomId];
            console.log(`[x] Sala "${roomId}" eliminada.`);
        } else {
            // Avisar al que queda
            io.to(roomId).emit("peer-disconnected");
            console.log(`[x] ${socket.id} abandonó "${roomId}".`);
        }
    });
});

// ── Arranque ─────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`\n✅  Servidor corriendo en https://gdie2603.ltim.uib.es`);
    console.log(`    Visualizador: https://gdie2603.ltim.uib.es/visualizador.html`);
    console.log(`    Respondedor:  https://gdie2603.ltim.uib.es/respondedor.html\n`);
});
