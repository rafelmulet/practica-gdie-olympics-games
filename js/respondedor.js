"use strict";

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // --- 1. CONFIGURACIÓN WEBRTC P2P ---
    // ==========================================
    const socket = io();
    const room = 'sala-quiz';
    let peerConnection = null;
    let dataChannel = null;
    let isCreatingPC = false; // Evita race condition al crear PeerConnection

    const quizOverlay = document.getElementById('quiz-overlay');
    const quizQuestion = document.getElementById('quiz-question');
    const quizOptionsContainer = document.getElementById('quiz-options');
    const quizFeedback = document.getElementById('quiz-feedback');
    const esperandoMsg = document.getElementById('esperando-msg');

    // Unirse a la sala para señalización
    socket.emit('join', room);

    socket.on('connect', () => {
        console.log('Socket conectado:', socket.id);
        socket.emit('join', room);
    });

    socket.on('full', () => {
        esperandoMsg.innerHTML = '<h2>Sala llena</h2><p>Ya hay dos dispositivos conectados. Recarga la página del visualizador.</p>';
    });

    socket.on('peer-disconnected', () => {
        console.log('Visualizador desconectado.');
        limpiarConexion();
        esperandoMsg.innerHTML = '<h2>Visualizador desconectado</h2><p>Espera a que el visualizador se recargue.</p>';
        esperandoMsg.style.display = 'block';
        quizOverlay.style.display = 'none';
    });

    socket.on('message', async (message) => {
        if (message.type === 'offer') {
            // Limpiar PC anterior si existía
            if (peerConnection) limpiarConexion();
            await crearPeerConnectionYResponder(message);
        } else if (message.type === 'candidate') {
            if (peerConnection) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                } catch (e) {
                    console.error("Error addIceCandidate:", e);
                }
            }
        }
    });

    function limpiarConexion() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        dataChannel = null;
        isCreatingPC = false;
    }

    async function crearPeerConnectionYResponder(offer) {
        if (isCreatingPC) return;
        isCreatingPC = true;

        peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('message', { room, message: { type: 'candidate', candidate: event.candidate } });
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('WebRTC estado:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
                esperandoMsg.innerHTML = '<h2>Conexión perdida</h2><p>Recarga ambas páginas para reconectar.</p>';
                esperandoMsg.style.display = 'block';
                quizOverlay.style.display = 'none';
            }
        };

        // Escuchar cuando el Visualizador abre el canal de datos remoto
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            
            dataChannel.onopen = () => {
                console.log('DataChannel P2P abierto en el Respondedor.');
                esperandoMsg.innerHTML = "<h2>¡Vinculado al Visualizador!</h2><p>Mando listo. Atento al vídeo.</p>";
                esperandoMsg.style.display = 'block';
                quizOverlay.style.display = 'none';
            };

            dataChannel.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'SHOW_QUIZ') {
                    mostrarQuiz(msg.payload);
                }
            };

            dataChannel.onclose = () => {
                console.log('DataChannel cerrado.');
            };
        };

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('message', { room, message: peerConnection.localDescription });
        } catch (e) {
            console.error("Error en el handshake WebRTC:", e);
            limpiarConexion();
        }

        isCreatingPC = false;
    }

    // ==========================================
    // --- 2. LÓGICA DE INTERFAZ DEL QUIZ ---
    // ==========================================
    function mostrarQuiz(quizData) {
        // Alternar vistas
        esperandoMsg.style.display = 'none';
        quizOverlay.style.display = 'flex';
        
        // Limpiar datos anteriores
        quizQuestion.textContent = quizData.question;
        quizOptionsContainer.innerHTML = '';
        quizFeedback.textContent = '';

        // Generar botones dinámicos
        quizData.options.forEach((opcion, index) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option';
            btn.textContent = opcion;

            btn.addEventListener('click', () => {
                const todosBotones = quizOptionsContainer.querySelectorAll('.quiz-option');
                todosBotones.forEach(b => b.disabled = true);

                if (index === quizData.correctIndex) {
                    btn.classList.add('correct');
                    quizFeedback.textContent = '¡Correcto!';
                    quizFeedback.style.color = '#28a745';
                } else {
                    btn.classList.add('incorrect');
                    quizFeedback.textContent = 'Respuesta incorrecta.';
                    quizFeedback.style.color = '#dc3545';
                    // Marcar la correcta
                    todosBotones[quizData.correctIndex].classList.add('correct');
                }

                // Esperar unos segundos para mostrar el feedback antes de reanudar
                setTimeout(() => {
                    quizOverlay.style.display = 'none';
                    esperandoMsg.style.display = 'block';
                    
                    // Enviar comando P2P al visualizador
                    if (dataChannel && dataChannel.readyState === 'open') {
                        dataChannel.send(JSON.stringify({ type: 'RESUME_VIDEO' }));
                    }
                }, 2500);
            });

            quizOptionsContainer.appendChild(btn);
        });
    }

});