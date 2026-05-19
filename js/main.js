"use strict";

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // --- 1. SELECCIÓN DE ELEMENTOS --- 
    // ==========================================
    const video = document.getElementById('mainVideo');
    const audio = document.getElementById('mainAudio');
    const controls = document.getElementById('video-controls');

    // Controles básicos
    const stopBtn = document.getElementById('stopBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playPauseImg = playPauseBtn.querySelector('img');
    const muteBtn = document.getElementById('muteBtn');
    const volumeBar = document.getElementById('volume-bar');
    const volumeImg = muteBtn.querySelector('img');
    const progressBar = document.getElementById('progress-bar');

    // Controles de subtítulos y calidad
    const subtitlesBtn = document.getElementById('subtitlesBtn');
    const subtitlesImg = document.getElementById('subtitles-img');
    const videoQImg = document.getElementById('video-q-img');
    const audioQImg = document.getElementById('audio-q-img');

    const langOptions = document.querySelectorAll('.opt-btn[data-lang]');
    const videoOptions = document.querySelectorAll('.opt-btn[data-video-src]');
    const audioOptions = document.querySelectorAll('.opt-btn[data-audio-src]');

    // ==========================================
    // --- VARIABLES DASH --- 
    // ==========================================
    let dashPlayer = null;
    let isDashActive = false;
    const DASH_MANIFEST_URL = 'media/dash/manifest.mpd';

    // ==========================================
    // --- 2. CONFIGURACIÓN INICIAL --- 
    // ==========================================
    video.controls = false;
    audio.controls = false;
    controls.setAttribute('data-state', 'visible');
    video.muted = true;
    audio.volume = 0.5;

    // Asegurar que js reconozca los src de los tag <source> iniciales
    if (!video.src) video.src = video.querySelector('source').src;
    if (!audio.src) audio.src = audio.querySelector('source').src;

    // ==========================================
    // --- LÓGICA MPEG-DASH ---
    // ==========================================
    function activarDash() {
        if (isDashActive) return;
        isDashActive = true;

        const currentTime = video.currentTime;
        const wasPlaying = !video.paused;

        // Pausar los elementos nativos independientes
        video.pause();
        audio.pause();

        // Inicializar Dash.js en el elemento de video principal
        dashPlayer = dashjs.MediaPlayer().create();
        
        // Activar AutoSwitching (ABR) para cambiar entre las calidades
        dashPlayer.updateSettings({
            streaming: {
                abr: { autoSwitchBitrate: { video: true, audio: true } }
            }
        });

        dashPlayer.initialize(video, DASH_MANIFEST_URL, wasPlaying);
        dashPlayer.seek(currentTime);

        // Ajustar volúmenes: DASH reproducirá el audio a través del <video>
        video.volume = audio.volume;
        video.muted = audio.muted;
        
        // Silenciamos el <audio> nativo para que no suene el MP4 por detrás
        audio.muted = true;
    }

    function desactivarDash() {
        if (!isDashActive) return;
        isDashActive = false;

        if (dashPlayer) {
            dashPlayer.reset();
            dashPlayer = null;
        }

        // Restaurar el mute nativo del audio según la interfaz gráfica
        audio.muted = muteBtn.querySelector('img').src.includes('volume-mute');
    }

    // ==========================================
    // --- 3. FUNCIÓN DE CARGA ROBUSTA --- 
    // ==========================================
    window.waitForMediaLoad = function(resumePlay = false, restoreTime = 0) {
        let isVideoReady = false;
        let isAudioReady = false;

        // Deshabilita el botón de play mientras carga el buffer
        playPauseBtn.disabled = true;
        playPauseBtn.style.opacity = '0.5';

        const checkReadyState = () => {
            if (isVideoReady && isAudioReady) {
                playPauseBtn.disabled = false;
                playPauseBtn.style.opacity = '1';

                if (resumePlay) {
                    if (isDashActive) {
                        video.play().then(() => playPauseImg.src = 'media/images/controls/pause-icon.png').catch(e => console.log(e));
                    } else {
                        Promise.all([video.play(), audio.play()]).then(() => {
                            playPauseImg.src = 'media/images/controls/pause-icon.png';
                        }).catch(e => console.log("Auto-play interceptado:", e));
                    }
                }
            }
        };

        const handleMediaError = (type) => {
            console.error(`Error: El ${type} no pudo cargarse o hubo un problema de red.`);
        };

        // Restaurar tiempo (cambio de calidad)
        if (restoreTime > 0) {
            video.addEventListener('loadedmetadata', () => { video.currentTime = restoreTime; }, { once: true });
            audio.addEventListener('loadedmetadata', () => { audio.currentTime = restoreTime; }, { once: true });
        }

        // Listeners para la carga del buffer
        video.addEventListener('canplaythrough', () => {
            isVideoReady = true;
            checkReadyState();
        }, { once: true });
        video.addEventListener('error', () => handleMediaError('Video'), { once: true });

        audio.addEventListener('canplaythrough', () => {
            isAudioReady = true;
            checkReadyState();
        }, { once: true });
        audio.addEventListener('error', () => handleMediaError('Audio'), { once: true });

        // Forzar la carga
        video.load();
        audio.load();
    };

    // Activar la espera inicial al cargar la página por primera vez
    window.waitForMediaLoad();

    // ==========================================
    // --- 4. SINCRONIZACIÓN PERFECTA --- 
    // ==========================================
    const syncMedia = () => {
        if (!isDashActive && Math.abs(video.currentTime - audio.currentTime) > 0.15) {
            audio.currentTime = video.currentTime;
        }
    };

    const checkStreamingSync = (label) => {
        if (label === 'DASH') {
            const allBtns = document.querySelectorAll('.opt-btn');
            allBtns.forEach(btn => {
                if (btn.textContent.trim() === label) {
                    const parent = btn.parentElement;
                    parent.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active-opt'));
                    btn.classList.add('active-opt');

                    if (parent.id === 'video-options') videoQImg.src = btn.dataset.icon;
                    if (parent.id === 'audio-options') audioQImg.src = btn.dataset.icon;
                }
            });
            console.log(`Modo ${label} activado. ABR Gestionando calidades.`);
            activarDash();
            return true;
        }
        return false;
    };

    video.addEventListener('seeking', () => { if (!isDashActive) audio.currentTime = video.currentTime; });
    video.addEventListener('waiting', () => { if (!isDashActive) audio.pause(); });
    video.addEventListener('timeupdate', syncMedia);
    video.addEventListener('playing', () => {
        syncMedia();
        if (!video.paused && !isDashActive) {
            audio.play().catch(e => console.log("Audio play interceptado", e));
        }
    });

    // ==========================================
    // --- 5. CAMBIO DE CALIDAD DINÁMICO ---
    // ==========================================
    const wasInSyncMode = () => {
        const activeOpt = Array.from(videoOptions).find(opt => opt.classList.contains('active-opt'));
        return activeOpt && (activeOpt.textContent.trim() === 'DASH' || activeOpt.textContent.trim() === 'HLS');
    };

    function setAudioQuality(label) {
        const audioQuality = Array.from(audioOptions).find(opt => opt.textContent.trim() === label);
        if (audioQuality) {
            audioOptions.forEach(b => b.classList.remove('active-opt'));
            audioQuality.classList.add('active-opt');
            audioQImg.src = audioQuality.dataset.icon;
            audio.src = audioQuality.dataset.audioSrc;
            console.log("Audio forzado");
        }
    }

    videoOptions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const label = e.target.textContent.trim();
            if (label === 'DASH') {
                checkStreamingSync(label);
                return;
            }
            if (e.target.classList.contains('active-opt')) return;

            if (isDashActive) desactivarDash();

            const comingFromSync = wasInSyncMode();
            const newSrc = e.target.dataset.videoSrc;
            const newIcon = e.target.dataset.icon;
            const wasPlaying = !video.paused;
            const currentTime = video.currentTime;

            videoOptions.forEach(b => b.classList.remove('active-opt'));
            e.target.classList.add('active-opt');
            videoQImg.src = newIcon;
            video.src = newSrc;

            if (comingFromSync) setAudioQuality('MD');

            window.waitForMediaLoad(wasPlaying, currentTime);
        });
    });

    function setVideoQuality(label) {
        const videoQuality = Array.from(videoOptions).find(opt => opt.textContent.trim() === label);
        if (videoQuality) {
            videoOptions.forEach(b => b.classList.remove('active-opt'));
            videoQuality.classList.add('active-opt');
            videoQImg.src = videoQuality.dataset.icon;
            video.src = videoQuality.dataset.videoSrc;
            console.log("Video forzado");
        }
    }

    audioOptions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const label = e.target.textContent.trim();
            if (label === 'DASH') {
                checkStreamingSync(label);
                return;
            }
            if (e.target.classList.contains('active-opt')) return;

            if (isDashActive) desactivarDash();

            const comingFromSync = wasInSyncMode();
            const newSrc = e.target.dataset.audioSrc;
            const newIcon = e.target.dataset.icon;
            const wasPlaying = !video.paused;
            const currentTime = video.currentTime;

            audioOptions.forEach(b => b.classList.remove('active-opt'));
            e.target.classList.add('active-opt');
            audioQImg.src = newIcon; 
            
            audio.src = newSrc;

            if (comingFromSync) setVideoQuality('720p');

            window.waitForMediaLoad(wasPlaying, currentTime);
        });
    });

    // ==========================================
    // --- 6. LÓGICA DE REPRODUCCIÓN Y VOLUMEN ---
    // ==========================================
    function actualizarIconoVolumen() {
        if (audio.muted && (!isDashActive || video.muted)) {
            volumeImg.src = 'media/images/controls/volume-mute-icon.png';
            volumeBar.style.background = `rgba(255, 255, 255, 0.3)`;
        } else {
            const currentVolume = isDashActive ? video.volume : audio.volume;
            if (currentVolume < 0.4) {
                volumeImg.src = 'media/images/controls/volume-icon.png';
            } else if (currentVolume < 0.8) {
                volumeImg.src = 'media/images/controls/volume-down-icon.png';
            } else {
                volumeImg.src = 'media/images/controls/volume-up-icon.png';
            }

            const porcentaje = currentVolume * 100;
            volumeBar.style.background = `linear-gradient(to right, #0505A1 ${porcentaje}%, rgba(255, 255, 255, 0.3) ${porcentaje}%)`;
        }
    }

    stopBtn.addEventListener('click', () => {
        if (isDashActive) desactivarDash();

        video.pause();
        audio.pause();
        playPauseImg.src = 'media/images/controls/play-icon.png';

        audio.volume = 0.5;
        volumeBar.value = 0.5;
        audio.muted = false;
        actualizarIconoVolumen();

        video.currentTime = 0;
        audio.currentTime = 0;
     
        progressBar.value = 0;
        progressBar.style.background = `rgba(255, 255, 255, 0.3)`;

        setAudioQuality('MD');
        setVideoQuality('720p');

        hideAllTracks();
        currentLang = 'en';

        window.waitForMediaLoad(false, 0);
    });

    playPauseBtn.addEventListener('click', async () => {
        if (video.paused || video.ended) {
            try {
                if (isDashActive) {
                    await video.play();
                } else {
                    audio.currentTime = video.currentTime;
                    await Promise.all([video.play(), audio.play()]);
                }
                playPauseImg.src = 'media/images/controls/pause-icon.png';
            } catch (error) {
                console.error("Error en reproducción:", error);
            }
        } else {
            if (isDashActive) {
                video.pause();
            } else {
                await Promise.all([video.pause(), audio.pause()]);
                audio.currentTime = video.currentTime;
            }
            playPauseImg.src = 'media/images/controls/play-icon.png';
        }
    });

    volumeBar.addEventListener('input', () => {
        audio.volume = volumeBar.value;
        if (isDashActive) video.volume = volumeBar.value;
        actualizarIconoVolumen();
    });

    muteBtn.addEventListener('click', () => {
        audio.muted = !audio.muted;
        if (isDashActive) video.muted = audio.muted;
        if (!audio.muted) {
            volumeBar.value = audio.volume;
        }
        actualizarIconoVolumen();
    });

    actualizarIconoVolumen();

    // ==========================================
    // --- 7. LÓGICA DE LA BARRA DE PROGRESO --- 
    // ==========================================
    video.addEventListener('timeupdate', () => {
        if (!isNaN(video.duration)) {
            const porcentaje = (video.currentTime / video.duration) * 100;
            progressBar.value = porcentaje;
            progressBar.style.background = `linear-gradient(to right, #0505A1 ${porcentaje}%, rgba(255, 255, 255, 0.2) ${porcentaje}%)`;
        }
    });

    progressBar.addEventListener('input', () => {
        const tiempoDestino = (progressBar.value / 100) * video.duration;
        video.currentTime = tiempoDestino; 
    });

    video.addEventListener('ended', () => {
        stopBtn.click();
    });

    // ==========================================
    // --- 8. LÓGICA DE SUBTÍTULOS ---
    // ==========================================
    let isSubtitlesActive = false;
    let currentLang = 'en';

    const hideAllTracks = () => {
        for (let i = 0; i < video.textTracks.length; i++) {
            video.textTracks[i].mode = 'hidden';
        }
        isSubtitlesActive = false;
        subtitlesImg.src = 'media/images/controls/subtitles-off-icon.png';
        updateActiveButton(null, false);
    };

    const showTrack = (lang) => {
        hideAllTracks();
        for (let i = 0; i < video.textTracks.length; i++) {
            if (video.textTracks[i].language === lang) {
                video.textTracks[i].mode = 'showing';
                isSubtitlesActive = true;
                currentLang = lang;
                subtitlesImg.src = 'media/images/controls/subtitles-on-icon.png';
                updateActiveButton(lang, true);
                break;
            }
        }
    };

    const updateActiveButton = (lang, isActive) => {
        langOptions.forEach(btn => {
            if (isActive && btn.dataset.lang === lang) {
                btn.classList.add('active-opt');
            } else {
                btn.classList.remove('active-opt');
            }
        });
    };

    subtitlesBtn.addEventListener('click', () => {
        if (isSubtitlesActive) {
            hideAllTracks();
        } else {
            showTrack(currentLang);
        }
    });

    langOptions.forEach(btn => {
        btn.addEventListener('click', (event) => {
            const selectedLang = event.target.dataset.lang;
            if (isSubtitlesActive && currentLang === selectedLang) {
                hideAllTracks();
            } else {
                showTrack(selectedLang);
            }
        });
    });

    // ==========================================
    // --- 9. GESTIÓN DE PESTAÑA ACTIVA ---
    // ==========================================
    let wasPlayingBeforeHidden = false;

    document.addEventListener("visibilitychange", async () => {
        if (document.hidden) {
            wasPlayingBeforeHidden = !video.paused;
            video.pause();
            audio.pause();
        } else {
            audio.currentTime = video.currentTime;
            if (wasPlayingBeforeHidden) {
                try {
                    if (isDashActive) {
                        await video.play();
                    } else {
                        await Promise.all([video.play(), audio.play()]);
                    }
                } catch (e) {
                    console.log("Reanudación bloqueada por el navegador");
                }
            }
        }
    });

    // ==========================================
    // --- 10. LÓGICA DE METADATOS (WEBVTT) ---
    // ==========================================
    const metadataTrack = Array.from(video.textTracks).find(t => t.kind === 'metadata');

    if (metadataTrack) {
        metadataTrack.mode = 'hidden';

        metadataTrack.addEventListener('cuechange', () => {
            const cue = metadataTrack.activeCues[0];
            if (!cue) return;

            try {
                const data = JSON.parse(cue.text);

                document.querySelector('.info-bajo-video h2').textContent = data.title;
                document.querySelector('.info-bajo-video p').textContent = data.desc;

                const imgMas = document.getElementById('meta-mas-jugado-img');
                imgMas.src = data.p_mas.f;
                document.getElementById('meta-mas-jugado-p').textContent = data.p_mas.n;

                const imgOri = document.getElementById('meta-origen-img');
                imgOri.src = data.p_ori.f;
                document.getElementById('meta-origen-p').textContent = data.p_ori.n;

                const imgTop1 = document.getElementById('meta-top1-img');
                imgTop1.src = data.tops[0].p;
                document.getElementById('meta-top1-p').textContent = data.tops[0].n;

                const imgTop2 = document.getElementById('meta-top2-img');
                imgTop2.src = data.tops[1].p;
                document.getElementById('meta-top2-p').textContent = data.tops[1].n;

                const imgTop3 = document.getElementById('meta-top3-img');
                imgTop3.src = data.tops[2].p;
                document.getElementById('meta-top3-p').textContent = data.tops[2].n;

            } catch (e) { console.error("Error metadatos:", e); }
        });
    }

    // ==========================================
    // --- 11. LÓGICA DE PREGUNTAS (QUIZ) ---
    // ==========================================
    const quizOverlay = document.getElementById('quiz-overlay');
    const quizQuestion = document.getElementById('quiz-question');
    const quizOptionsContainer = document.getElementById('quiz-options');
    const quizFeedback = document.getElementById('quiz-feedback');

    const trackElementPreguntas = document.getElementById('track-preguntas');

    if (trackElementPreguntas) {
        const preguntasTrack = trackElementPreguntas.track;
        preguntasTrack.mode = 'hidden';

        preguntasTrack.addEventListener('cuechange', () => {
            const cue = preguntasTrack.activeCues[0];
            if (!cue) return;

            try {
                const quizData = JSON.parse(cue.text);

                // 1. Pausar la reproducción
                video.pause();
                if (!isDashActive) audio.pause();
                playPauseImg.src = 'media/images/controls/play-icon.png';
                
                // NUEVO: Bloquear los controles mientras se muestra el quiz
                controls.classList.add('controls-disabled');

                // 2. Preparar la interfaz del quiz
                quizQuestion.textContent = quizData.question;
                quizOptionsContainer.innerHTML = ''; 
                quizFeedback.textContent = '';
                
                quizOverlay.style.display = 'flex'; // Mostrar overlay

                // 3. Generar los botones dinámicamente
                quizData.options.forEach((opcion, index) => {
                    const btn = document.createElement('button');
                    btn.className = 'quiz-option';
                    btn.textContent = opcion;

                    btn.addEventListener('click', () => {
                        // Deshabilitar todos los botones una vez respondido
                        const todosBotones = quizOptionsContainer.querySelectorAll('.quiz-option');
                        todosBotones.forEach(b => b.disabled = true);

                        // Comprobar si acertó
                        if (index === quizData.correctIndex) {
                            btn.classList.add('correct');
                            quizFeedback.textContent = '¡Correcto!';
                            quizFeedback.style.color = '#28a745';
                        } else {
                            btn.classList.add('incorrect');
                            quizFeedback.textContent = 'Respuesta incorrecta.';
                            quizFeedback.style.color = '#dc3545';
                            // Resaltar también cuál era la verdadera
                            todosBotones[quizData.correctIndex].classList.add('correct');
                        }

                        // 4. Reanudar el vídeo tras 2 segundos exactos
                        setTimeout(async () => {
                            quizOverlay.style.display = 'none';
                            
                            // NUEVO: Desbloquear los controles
                            controls.classList.remove('controls-disabled');
                            
                            // Aseguramos la sincronización antes de darle al play
                            if (!isDashActive) audio.currentTime = video.currentTime; 
                            
                            try {
                                if (isDashActive) {
                                    await video.play();
                                } else {
                                    await Promise.all([video.play(), audio.play()]);
                                }
                                playPauseImg.src = 'media/images/controls/pause-icon.png';
                            } catch (e) {
                                console.log("Error al reanudar tras la pregunta:", e);
                            }
                        }, 2500);
                    });

                    quizOptionsContainer.appendChild(btn);
                });

            } catch (e) {
                console.error("Error al parsear la pregunta del VTT:", e);
            }
        });
    }

});
