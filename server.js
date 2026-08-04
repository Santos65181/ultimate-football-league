const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" } 
});

app.use(express.static(__dirname));

const clubes = [
    { nome: "Arsenal", logo: "/imagens/Clubes/Europa/Arsenal.png", cor: "#EF0107" },
    { nome: "Barcelona", logo: "/imagens/Clubes/Europa/Barcelona.png", cor: "#004D98" },
    { nome: "Bayern", logo: "/imagens/Clubes/Europa/Bayern_Munich.png", cor: "#DC052D" },
    { nome: "Chelsea", logo: "/imagens/Clubes/Europa/Chelsea.png", cor: "#034694" },
    { nome: "Man. City", logo: "/imagens/Clubes/Europa/Manchester_City.png", cor: "#6CABDD" },
    { nome: "Real Madrid", logo: "/imagens/Clubes/Europa/Real_Madrid.png", cor: "#FEBE10" }
];

let estadoPartida = {
    jogadores: {},
    bola: { x: 150, y: 225, vx: 0, vy: 0, raio: 6 },
    golsA: 0,
    golsB: 0,
    tempoSegundos: 0,
    periodo: 1,
    timeA: null,
    timeB: null,
    jogoAtivo: false
};

// Posições iniciais fixas para até 3 jogadores
const posicoesIniciais = {
    1: { x: 150, y: 330, time: 'A' }, // P1 -> Time A (Baixo)
    2: { x: 150, y: 120, time: 'B' }, // P2 -> Time B (Cima)
    3: { x: 100, y: 330, time: 'A' }  // P3 -> Time A (Baixo)
};

function sortearTimes() {
    let idxA = Math.floor(Math.random() * clubes.length);
    let idxB;
    do { 
        idxB = Math.floor(Math.random() * clubes.length); 
    } while (idxA === idxB);
    
    estadoPartida.timeA = clubes[idxA];
    estadoPartida.timeB = clubes[idxB];
}

io.on('connection', (socket) => {
    const numJogadores = Object.keys(estadoPartida.jogadores).length;

    // CORREÇÃO 3: Limite de 3 jogadores na sala
    if (numJogadores >= 3) {
        socket.emit('sala_cheia');
        return;
    }

    const ehDono = numJogadores === 0;
    const numJogador = numJogadores + 1; // P1, P2 ou P3

    if (ehDono) {
        sortearTimes();
        estadoPartida.golsA = 0;
        estadoPartida.golsB = 0;
        estadoPartida.tempoSegundos = 0;
        estadoPartida.periodo = 1;
        estadoPartida.jogoAtivo = true;
    }

    // CORREÇÃO 4: Atribuição dos times (P1 -> Time A, P2 -> Time B, P3 -> Time A)
    const pos = posicoesIniciais[numJogador];
    estadoPartida.jogadores[socket.id] = {
        id: socket.id,
        num: numJogador,
        team: pos.time,
        x: pos.x,
        y: pos.y,
        raio: 11,
        nome: `Jogador ${numJogador}`
    };

    socket.emit('entrou_na_sala', {
        numJogador: numJogador,
        timeA: estadoPartida.timeA,
        timeB: estadoPartida.timeB,
        tempoSegundos: estadoPartida.tempoSegundos,
        periodo: estadoPartida.periodo,
        golsA: estadoPartida.golsA,
        golsB: estadoPartida.golsB
    });

    socket.on('registrar_nome', (nome) => {
        if (estadoPartida.jogadores[socket.id]) {
            estadoPartida.jogadores[socket.id].nome = nome;
        }
    });

    socket.on('mover', (vector) => {
        const p = estadoPartida.jogadores[socket.id];
        if (p && estadoPartida.jogoAtivo) {
            p.x += vector.x * 2.2;
            p.y += vector.y * 2.2;

            // Limite do campo para jogadores
            p.x = Math.max(p.raio, Math.min(300 - p.raio, p.x));
            p.y = Math.max(p.raio, Math.min(450 - p.raio, p.y));
        }
    });

    socket.on('chutar', () => {
        const p = estadoPartida.jogadores[socket.id];
        if (!p || !estadoPartida.jogoAtivo) return;

        const dx = estadoPartida.bola.x - p.x;
        const dy = estadoPartida.bola.y - p.y;
        const dist = Math.hypot(dx, dy);

        // Distância de chute (Hitbox do jogador + bola + alcance)
        if (dist <= p.raio + estadoPartida.bola.raio + 8) {
            const angulo = Math.atan2(dy, dx);
            const forca = 9;
            estadoPartida.bola.vx = Math.cos(angulo) * forca;
            estadoPartida.bola.vy = Math.sin(angulo) * forca;
        }
    });

    socket.on('disconnect', () => {
        delete estadoPartida.jogadores[socket.id];
        if (Object.keys(estadoPartida.jogadores).length === 0) {
            estadoPartida.jogoAtivo = false;
        }
    });
});

// Loop principal de física (60 FPS)
setInterval(() => {
    if (!estadoPartida.jogoAtivo) return;

    // Atualiza posição da bola
    estadoPartida.bola.x += estadoPartida.bola.vx;
    estadoPartida.bola.y += estadoPartida.bola.vy;

    // Fricção da bola
    estadoPartida.bola.vx *= 0.96;
    estadoPartida.bola.vy *= 0.96;

    // CORREÇÃO 1: Colisão perfeita da bola com as paredes (Limites do mapa)
    // Paredes Laterais
    if (estadoPartida.bola.x - estadoPartida.bola.raio < 0) {
        estadoPartida.bola.x = estadoPartida.bola.raio;
        estadoPartida.bola.vx *= -1;
    }
    if (estadoPartida.bola.x + estadoPartida.bola.raio > 300) {
        estadoPartida.bola.x = 300 - estadoPartida.bola.raio;
        estadoPartida.bola.vx *= -1;
    }

    // Paredes Superior e Inferior (Fora da área do gol)
    const emAreaDeGol = estadoPartida.bola.x > 100 && estadoPartida.bola.x < 200;

    if (estadoPartida.bola.y - estadoPartida.bola.raio < 0) {
        if (emAreaDeGol) {
            // Gol do Time A! (Bola entrou na trave de cima)
            estadoPartida.golsA++;
            resetarBola();
        } else {
            estadoPartida.bola.y = estadoPartida.bola.raio;
            estadoPartida.bola.vy *= -1;
        }
    }

    if (estadoPartida.bola.y + estadoPartida.bola.raio > 450) {
        if (emAreaDeGol) {
            // Gol do Time B! (Bola entrou na trave de baixo)
            estadoPartida.golsB++;
            resetarBola();
        } else {
            estadoPartida.bola.y = 450 - estadoPartida.bola.raio;
            estadoPartida.bola.vy *= -1;
        }
    }

    // CORREÇÃO 2: Hitbox / Colisão entre Jogador e Jogador
    const listaJogadores = Object.values(estadoPartida.jogadores);
    for (let i = 0; i < listaJogadores.length; i++) {
        for (let j = i + 1; j < listaJogadores.length; j++) {
            const p1 = listaJogadores[i];
            const p2 = listaJogadores[j];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy);
            const minDist = p1.raio + p2.raio;

            if (dist < minDist && dist > 0) {
                const overlap = minDist - dist;
                const nx = dx / dist;
                const ny = dy / dist;

                // Empurra ambos os jogadores para fora do outro
                p1.x -= nx * (overlap / 2);
                p1.y -= ny * (overlap / 2);
                p2.x += nx * (overlap / 2);
                p2.y += ny * (overlap / 2);
            }
        }

        // Colisão entre Jogador e Bola (Física ao empurrar a bola andando)
        const p = listaJogadores[i];
        const dxB = estadoPartida.bola.x - p.x;
        const dyB = estadoPartida.bola.y - p.y;
        const distB = Math.hypot(dxB, dyB);
        const minDistB = p.raio + estadoPartida.bola.raio;

        if (distB < minDistB && distB > 0) {
            const overlapB = minDistB - distB;
            const nxB = dxB / distB;
            const nyB = dyB / distB;

            estadoPartida.bola.x += nxB * overlapB;
            estadoPartida.bola.y += nyB * overlapB;
            estadoPartida.bola.vx += nxB * 0.5;
            estadoPartida.bola.vy += nyB * 0.5;
        }
    }

    io.emit('atualizar_estado', estadoPartida);
}, 1000 / 60);

function resetarBola() {
    estadoPartida.bola = { x: 150, y: 225, vx: 0, vy: 0, raio: 6 };
}

// Cronômetro
setInterval(() => {
    if (!estadoPartida.jogoAtivo) return;

    estadoPartida.tempoSegundos++;
    if (estadoPartida.tempoSegundos >= 150 && estadoPartida.periodo === 1) {
        estadoPartida.periodo = 2;
        estadoPartida.tempoSegundos = 0;
        resetarBola();
    } else if (estadoPartida.tempoSegundos >= 150 && estadoPartida.periodo === 2) {
        estadoPartida.jogoAtivo = false;
        io.emit('fim_de_jogo', estadoPartida);
    }
}, 1000);

const PORTA = 3000;
server.listen(PORTA, () => {
    console.log(`Servidor rodando em http://localhost:${PORTA}`);
});
