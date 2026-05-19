"use strict";

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // --- 1. CONFIGURACIÓN WEBRTC P2P ---
    // ==========================================
    const socket = io();
    const room = 'sala-quiz'; // Debe coincidir con main.js
    let peerConnection;
    let dataChannel;

    const quizOverlay = document.getElementById('quiz-overlay');
    const quizQuestion = document.getElementById('quiz-question');
    const quizOptionsContainer = document.getElementById('quiz-options');
    const quizFeedback = document.getElementById('quiz-feedback');
    const esperandoMsg = document.getElementById('esperando-msg');

    // Unirse a la sala para señalización
    socket.emit('join', room);

    socket.on('message', async (message) => {
        if (!peerConnection) crearPeerConnection();

        if (message.type === 'offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('message', { room, message: peerConnection.localDescription });
        } else if (message.type === 'candidate') {
            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
    });

    function crearPeerConnection() {
        if (peerConnection) return;
        
        peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('message', { room, message: { type: 'candidate', candidate: event.candidate } });
            }
        };

        // Escuchar cuando el Visualizador abre el canal de datos remoto
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            
            dataChannel.onopen = () => {
                console.log('DataChannel P2P abierto en el Respondedor.');
                esperandoMsg.innerHTML = "<h2>¡Vinculado al Visualizador!</h2><p>Mando listo. Atento al vídeo.</p>";
            };

            dataChannel.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'SHOW_QUIZ') {
                    mostrarQuiz(msg.payload);
                }
            };
        };
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