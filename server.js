Const express = require('express');
Const http = require('http');
Const { Server } = require('socket.io');

Const app = express();
Const server = http.createServer(app);
Const io = new Server(server, { 
    Cors: { origin: "*" } 
});

App.use(express.static(__dirname));

Const clubes = [
    { nome: "Arsenal", logo: "/imagens/Clubes/Europa/Arsenal.png", cor: "#EF0107" },
    { nome: "Barcelona", logo: "/imagens/Clubes/Europa/Barcelona.png", cor: "#004D98" },
    { nome: "Bayern", logo: "/imagens/Clubes/Europa/Bayern_Munich.png", cor: "#DC052D" },
    { nome: "Chelsea", logo: "/imagens/Clubes/Europa/Chelsea.png", cor: "#034694" },
    { nome: "Man. City", logo: "/imagens/Clubes/Europa/Manchester_City.png", cor: "#6CABDD" },
    { nome: "Real Madrid", logo: "/imagens/Clubes/Europa/Real_Madrid.png", cor: "#FEBE10" }
];

Let estadoPartida = {
    Jogadores: {},
    Bola: { x: 150, y: 225, vx: 0, vy: 0, raio: 6 },
    GolsA: 0,
    GolsB: 0,
    TempoSegundos: 0,
    Periodo: 1,
    TimeA: null,
    TimeB: null,
    JogoAtivo: false
};

// Posições iniciais balanceadas para 6 jogadores (3 no Time A / 3 no Time B)
Const posicoesIniciais = {
    1: { x: 150, y: 350, time: 'A' }, // P1: Centro/Defesa (Baixo)
    2: { x: 150, y: 100, time: 'B' }, // P2: Centro/Defesa (Cima)
    3: { x: 80,  y: 300, time: 'A' }, // P3: Esquerda/Ataque (Baixo)
    4: { x: 220, y: 150, time: 'B' }, // P4: Direita/Ataque (Cima)
    5: { x: 220, y: 300, time: 'A' }, // P5: Direita/Ataque (Baixo)
    6: { x: 80,  y: 150, time: 'B' }  // P6: Esquerda/Ataque (Cima)
};

Function sortearTimes() {
    Let idxA = Math.floor(Math.random() * clubes.length);
    Let idxB;
    Do { 
        IdxB = Math.floor(Math.random() * clubes.length); 
    } while (idxA === idxB);
    
    EstadoPartida.timeA = clubes[idxA];
    EstadoPartida.timeB = clubes[idxB];
}

Io.on('connection', (socket) => {
    Const numJogadores = Object.keys(estadoPartida.jogadores).length;

    // CAPACIDADE AUMENTADA: Limite de 6 jogadores na sala
    If (numJogadores >= 6) {
        Socket.emit('sala_cheia');
        Return;
    }

    Const ehDono = numJogadores === 0;
    Const numJogador = numJogadores + 1; // P1 a P6

    If (ehDono) {
        SortearTimes();
        EstadoPartida.golsA = 0;
        EstadoPartida.golsB = 0;
        EstadoPartida.tempoSegundos = 0;
        EstadoPartida.periodo = 1;
        EstadoPartida.jogoAtivo = true;
    }

    // Atribuição da posição e time baseada no índice (P1-P6)
    Const pos = posicoesIniciais[numJogador];
    EstadoPartida.jogadores[socket.id] = {
        Id: socket.id,
        Num: numJogador,
        Team: pos.time,
        X: pos.x,
        Y: pos.y,
        Raio: 11,
        Nome: `Jogador ${numJogador}`
    };

    Socket.emit('entrou_na_sala', {
        NumJogador: numJogador,
        TimeA: estadoPartida.timeA,
        TimeB: estadoPartida.timeB,
        TempoSegundos: estadoPartida.tempoSegundos,
        Periodo: estadoPartida.periodo,
        GolsA: estadoPartida.golsA,
        GolsB: estadoPartida.golsB
    });

    Socket.on('registrar_nome', (nome) => {
        If (estadoPartida.jogadores[socket.id]) {
            EstadoPartida.jogadores[socket.id].nome = nome;
        }
    });

    Socket.on('mover', (vector) => {
        Const p = estadoPartida.jogadores[socket.id];
        If (p && estadoPartida.jogoAtivo) {
            P.x += vector.x * 2.2;
            P.y += vector.y * 2.2;

            // Limite do campo para jogadores (largura 300 x altura 450)
            P.x = Math.max(p.raio, Math.min(300 - p.raio, p.x));
            P.y = Math.max(p.raio, Math.min(450 - p.raio, p.y));
        }
    });

    Socket.on('chutar', () => {
        Const p = estadoPartida.jogadores[socket.id];
        If (!p || !estadoPartida.jogoAtivo) return;

        Const dx = estadoPartida.bola.x - p.x;
        Const dy = estadoPartida.bola.y - p.y;
        Const dist = Math.hypot(dx, dy);

        If (dist <= p.raio + estadoPartida.bola.raio + 8) {
            Const angulo = Math.atan2(dy, dx);
            Const forca = 9;
            EstadoPartida.bola.vx = Math.cos(angulo) * forca;
            EstadoPartida.bola.vy = Math.sin(angulo) * forca;
        }
    });

    Socket.on('disconnect', () => {
        Delete estadoPartida.jogadores[socket.id];
        If (Object.keys(estadoPartida.jogadores).length === 0) {
            EstadoPartida.jogoAtivo = false;
        }
    });
});

// Loop principal de física (60 FPS)
SetInterval(() => {
    If (!estadoPartida.jogoAtivo) return;

    // Atualiza posição da bola
    EstadoPartida.bola.x += estadoPartida.bola.vx;
    EstadoPartida.bola.y += estadoPartida.bola.vy;

    // Fricção da bola
    EstadoPartida.bola.vx *= 0.96;
    EstadoPartida.bola.vy *= 0.96;

    // Paredes Laterais
    If (estadoPartida.bola.x - estadoPartida.bola.raio < 0) {
        EstadoPartida.bola.x = estadoPartida.bola.raio;
        EstadoPartida.bola.vx *= -1;
    }
    If (estadoPartida.bola.x + estadoPartida.bola.raio > 300) {
        EstadoPartida.bola.x = 300 - estadoPartida.bola.raio;
        EstadoPartida.bola.vx *= -1;
    }

    // Paredes Superior e Inferior / Detecção de Gol
    Const emAreaDeGol = estadoPartida.bola.x > 100 && estadoPartida.bola.x < 200;

    If (estadoPartida.bola.y - estadoPartida.bola.raio < 0) {
        If (emAreaDeGol) {
            EstadoPartida.golsA++;
            ResetarBola();
        } else {
            EstadoPartida.bola.y = estadoPartida.bola.raio;
            EstadoPartida.bola.vy *= -1;
        }
    }

    If (estadoPartida.bola.y + estadoPartida.bola.raio > 450) {
        If (emAreaDeGol) {
            EstadoPartida.golsB++;
            ResetarBola();
        } else {
            EstadoPartida.bola.y = 450 - estadoPartida.bola.raio;
            EstadoPartida.bola.vy *= -1;
        }
    }

    // Colisão entre múltiplos Jogadores e Bola
    Const listaJogadores = Object.values(estadoPartida.jogadores);
    For (let i = 0; i < listaJogadores.length; i++) {
        For (let j = i + 1; j < listaJogadores.length; j++) {
            Const p1 = listaJogadores[i];
            Const p2 = listaJogadores[j];

            Const dx = p2.x - p1.x;
            Const dy = p2.y - p1.y;
            Const dist = Math.hypot(dx, dy);
            Const minDist = p1.raio + p2.raio;

            If (dist < minDist && dist > 0) {
                Const overlap = minDist - dist;
                Const nx = dx / dist;
                Const ny = dy / dist;

                P1.x -= nx * (overlap / 2);
                P1.y -= ny * (overlap / 2);
                P2.x += nx * (overlap / 2);
                P2.y += ny * (overlap / 2);
            }
        }

        // Colisão com a bola
        Const p = listaJogadores[i];
        Const dxB = estadoPartida.bola.x - p.x;
        Const dyB = estadoPartida.bola.y - p.y;
        Const distB = Math.hypot(dxB, dyB);
        Const minDistB = p.raio + estadoPartida.bola.raio;

        If (distB < minDistB && distB > 0) {
            Const overlapB = minDistB - distB;
            Const nxB = dxB / distB;
            Const nyB = dyB / distB;

            EstadoPartida.bola.x += nxB * overlapB;
            EstadoPartida.bola.y += nyB * overlapB;
            EstadoPartida.bola.vx += nxB * 0.5;
            EstadoPartida.bola.vy += nyB * 0.5;
        }
    }

    Io.emit('atualizar_estado', estadoPartida);
}, 1000 / 60);

Function resetarBola() {
    EstadoPartida.bola = { x: 150, y: 225, vx: 0, vy: 0, raio: 6 };
}

// Cronômetro
SetInterval(() => {
    If (!estadoPartida.jogoAtivo) return;

    EstadoPartida.tempoSegundos++;
    If (estadoPartida.tempoSegundos >= 150 && estadoPartida.periodo === 1) {
        EstadoPartida.periodo = 2;
        EstadoPartida.tempoSegundos = 0;
        ResetarBola();
    } else if (estadoPartida.tempoSegundos >= 150 && estadoPartida.periodo === 2) {
        EstadoPartida.jogoAtivo = false;
        Io.emit('fim_de_jogo', estadoPartida);
    }
}, 1000);

Const PORTA = 3000;
Server.listen(PORTA, () => {
    Console.log(`Servidor rodando em http://localhost:${PORTA}`);
});
        
