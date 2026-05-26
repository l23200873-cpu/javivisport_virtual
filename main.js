import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/webxr/VRButton.js';

const container = document.getElementById('canvas-container');

// ─── AUDIO Y EFECTOS SONOROS ──────────────────────────────────────
const sfxSlide = new Audio('assets/uuyy.mp3'); sfxSlide.volume = 1.0;
const bgMusic = new Audio('assets/audio/forest_night.mp3'); bgMusic.loop = true; bgMusic.volume = 0.4; 

const sfxCoin = new Audio('assets/audio/chime.mp3'); sfxCoin.volume = 0.5;
const sfxPower = new Audio('assets/audio/win.mp3'); sfxPower.volume = 0.7;

// ─── MOTOR GRÁFICO Y CONFIGURACIÓN WEBXR ──────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x023459, 0.035); 

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
const cameraGroup = new THREE.Group();
cameraGroup.position.set(0, 1.6, 0); 
cameraGroup.add(camera);
scene.add(cameraGroup);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true; 
container.appendChild(renderer.domElement);

const vrButtonElement = VRButton.createButton(renderer);
document.getElementById('vr-button-container').appendChild(vrButtonElement);

// ─── PARCHE DETECTOR DE SESIÓN VR (INICIO AUTOMÁTICO) ──────────────
renderer.xr.addEventListener('sessionstart', () => {
    if (!state.running && !state.gameOver) {
        startGame();
    }
});

// ─── CARGA DE TEXTURAS EN ENTORNO ─────────────────────────────────
const textureLoader = new THREE.TextureLoader();
textureLoader.load('assets/fondo_360.jpg', tex => { tex.mapping = THREE.EquirectangularReflectionMapping; scene.background = tex; scene.environment = tex; });
const texturaPiso = textureLoader.load('assets/asfalto.jpeg'); texturaPiso.wrapS = texturaPiso.wrapT = THREE.RepeatWrapping; texturaPiso.repeat.set(1, 4); 
const tileMat = new THREE.MeshStandardMaterial({ map: texturaPiso, roughness: 0.8, metalness: 0.2 });

// ─── GESTIÓN Y CARGA ASÍNCRONA DE MODELOS 3D ──────────────────────
const gltfLoader = new THREE.GLTFLoader();

const modelosBase = {
    edificio: null,
    tren: null,
    valla: null
};

function cargarModelos() {
    // Cargar Rascacielos Urbano
    gltfLoader.load('assets/models/building-a.glb', (gltf) => {
        modelosBase.edificio = gltf.scene;
        modelosBase.edificio.traverse(node => { if(node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });

        if (typeof tiles !== 'undefined' && tiles.length > 0) {
            tiles.forEach(tile => {
                [-8, 8].forEach(xPos => {
                    if (Math.random() > 0.25) {
                        const building = modelosBase.edificio.clone();

                        const escalaBaseBase = 6.5; 
                        building.scale.set(escalaBaseBase, escalaBaseBase, escalaBaseBase); 

                        const escalaAlturaAleatoria = 1.0 + Math.random() * 2.5; 
                        building.scale.y *= escalaAlturaAleatoria;

                        building.position.set(xPos + (Math.random() * 2 - 1), 0, (Math.random() * 10 - 5));
                        building.rotation.y = Math.random() * Math.PI * 2;
                        tile.mesh.add(building); 
                    }
                });
            });
        }
    });

    // Cargar Tren
    gltfLoader.load('assets/models/train-locomotive-b.glb', (gltf) => {
        modelosBase.tren = gltf.scene;
        modelosBase.tren.scale.set(1.1, 1.1, 1.1); 
        modelosBase.tren.traverse(node => { if(node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    });

    // Cargar Valla
    gltfLoader.load('assets/models/valla_salto.glb', (gltf) => {
        modelosBase.valla = gltf.scene;
        modelosBase.valla.traverse(node => { if(node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    });
}

// ─── LUCES Y ILUMINACIÓN ──────────────────────────────────────────
const hemiLight = new THREE.HemisphereLight(0x00ffe7, 0x050a0f, 0.4); 
scene.add(hemiLight);

scene.add(new THREE.AmbientLight(0xffffff, 0.4)); 
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2); 
dirLight.position.set(10, 25, 10); 
dirLight.castShadow = true; 
scene.add(dirLight);

// ─── VARIABLES DE DISEÑO Y PARÁMETROS DEL JUEGO ──────────────────
const LANES = [-2.2, 0, 2.2]; 
const LANE_COUNT = 3;
const TILE_LENGTH = 20;
const TILE_COUNT = 8;
const OBSTACLE_TYPES = ['barrier', 'train', 'overhead'];
const POWERUP_TYPES = ['turbo', 'slowmo', 'superjump']; 

let state = {
  running: false, score: 0, coins: 0, speed: 0.18, baseSpeed: 0.18,
  playerLane: 1, targetLane: 1, playerY: 0,
  isJumping: false, isSliding: false, jumpVel: 0, gameOver: false,
  lives: 3, invulnerable: false,
  jumpForce: 0.18, currentPower: 'NINGUNO',
  startTime: 0
};

// ─── GENERACIÓN PROCEDURAL DE LA CIUDAD ───────────────────────────
const tiles = [];
const tileGeoBase = new THREE.BoxGeometry(8, 0.3, TILE_LENGTH);

function makeTile(z) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(tileGeoBase, tileMat); base.receiveShadow = true; group.add(base);
  
  for (let i = -1; i <= 1; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, TILE_LENGTH), new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.4, transparent: true }));
    line.position.set(i * 2.2, 0.16, 0); group.add(line);
  }

  [-8, 8].forEach(xPos => {
    if (Math.random() > 0.25 && modelosBase.edificio) {
        const building = modelosBase.edificio.clone();
        const escalaBaseBase = 6.5; 
        building.scale.set(escalaBaseBase, escalaBaseBase, escalaBaseBase); 
        const escalaAlturaAleatoria = 1.0 + Math.random() * 2.5; 
        building.scale.y *= escalaAlturaAleatoria;
        building.position.set(xPos + (Math.random() * 2 - 1), 0, (Math.random() * 10 - 5));
        building.rotation.y = Math.random() * Math.PI * 2;
        group.add(building);     
    }
  });

  group.position.z = z; scene.add(group); return group;
}

for (let i = 0; i < TILE_COUNT; i++) tiles.push({ mesh: makeTile(-i * TILE_LENGTH), items: [] });
cargarModelos(); 

// ─── GEOMETRÍAS DE MONEDAS Y GEMAS DE PODER ───────────────────────
const coinGeo = new THREE.TorusGeometry(0.3, 0.08, 16, 50); 
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.1, emissive: 0xaa6600 });

const powerGeo = new THREE.OctahedronGeometry(0.35, 0); 
const powerMats = {
  turbo:     new THREE.MeshStandardMaterial({ color: 0xff1133, emissive: 0x440000, roughness: 0.1 }), 
  slowmo:    new THREE.MeshStandardMaterial({ color: 0x0088ff, emissive: 0x002244, roughness: 0.1 }), 
  superjump: new THREE.MeshStandardMaterial({ color: 0x00ff44, emissive: 0x004411, roughness: 0.1 })  
};

// ─── GENERADOR ALEATORIO DE OBSTÁCULOS EN PISTA ──────────────────
function spawnItemsOnTile(tile) {
  tile.items.forEach(i => tile.mesh.remove(i.mesh)); tile.items = [];
  const usedLanes = new Set();
  
  if (Math.random() > 0.25) {
    const count = Math.random() < 0.7 ? 2 : 1; 
    for (let i = 0; i < count; i++) {
      let lane; do { lane = Math.floor(Math.random() * LANE_COUNT); } while (usedLanes.has(lane));
      usedLanes.add(lane);
      
      const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
      let mesh; 

      if (type === 'barrier' && modelosBase.valla) { 
        mesh = modelosBase.valla.clone();
        mesh.position.y = 0.15; 
      } else if (type === 'train' && modelosBase.tren) { 
        mesh = modelosBase.tren.clone();
        mesh.position.y = 0.15; 
      } else if (type === 'overhead') { 
        mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.4, 1.2), 
            new THREE.MeshStandardMaterial({ color: 0x00ffd7, emissive: 0x005544, roughness: 0.1 })
        ); 
        mesh.position.y = 1.85; 
        mesh.castShadow = mesh.receiveShadow = true;
      }

      if (mesh) {
        mesh.position.x = LANES[lane]; 
        mesh.position.z = (Math.random() - 0.5) * (TILE_LENGTH - 6);
        tile.mesh.add(mesh); 
        tile.items.push({ mesh, lane, type, isCoin: false, isPower: false });
      }
    }
  }

  for (let l = 0; l < LANE_COUNT; l++) {
    if (!usedLanes.has(l)) {
      const rand = Math.random();
      if (rand > 0.93) { 
        const pType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
        const mesh = new THREE.Mesh(powerGeo, powerMats[pType]);
        mesh.position.set(LANES[l], 1.2, (Math.random() - 0.5) * (TILE_LENGTH - 4));
        tile.mesh.add(mesh); tile.items.push({ mesh, lane: l, type: pType, isCoin: false, isPower: true });
      } else if (rand > 0.5) {
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        mesh.position.set(LANES[l], 0.7, (Math.random() - 0.5) * (TILE_LENGTH - 4));
        tile.mesh.add(mesh); tile.items.push({ mesh, lane: l, type: 'coin', isCoin: true, isPower: false });
      }
    }
  }
}
for (let i = 3; i < TILE_COUNT; i++) spawnItemsOnTile(tiles[i]);

// ─── BOTÓN Y EVENTOS DE INICIO DE SESIÓN ──────────────────────────
document.getElementById('start-btn').addEventListener('click', () => { sfxSlide.play().then(() => { sfxSlide.pause(); sfxSlide.currentTime = 0; }); startGame(); });

function startGame() {
  state = { 
    running: true, score: 0, coins: 0, speed: 0.18, baseSpeed: 0.18, 
    playerLane: 1, targetLane: 1, playerY: 0, 
    isJumping: false, isSliding: false, jumpVel: 0, gameOver: false, 
    lives: 3, invulnerable: false, jumpForce: 0.18, currentPower: 'NINGUNO',
    startTime: Date.now() 
  };
  
  document.getElementById('start-overlay').style.display = 'none'; 
  document.getElementById('lives-val').textContent = '♥♥♥';
  document.getElementById('coin-val').textContent = '000'; 
  document.getElementById('power-val').textContent = 'NINGUNO'; 
  document.getElementById('power-val').style.color = '#fff';
  cameraGroup.position.set(LANES[1], 1.6, 0);
  bgMusic.currentTime = 0; bgMusic.play().catch(e=>e);
}

// ─── CAPTURA DE CONTROLES TECLADO (PC) ────────────────────────────
document.addEventListener('keydown', e => {
  if (!state.running || state.gameOver) return;
  if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && state.targetLane > 0) state.targetLane--;
  if ((e.code === 'ArrowRight' || e.code === 'KeyD') && state.targetLane < LANE_COUNT - 1) state.targetLane++;
  
  if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && !state.isJumping) { 
    state.isJumping = true; state.jumpVel = state.jumpForce; state.isSliding = false; 
  }
  if ((e.code === 'ArrowDown' || e.code === 'KeyS') && !state.isSliding && !state.isJumping) {
    state.isSliding = true; sfxSlide.currentTime = 0; sfxSlide.play().catch(e=>e); setTimeout(() => { state.isSliding = false; }, 600);
  }
});

// ─── CAPTURA DE CONTROLES JOYSTICK (META QUEST 3) CALIBRADO ────────
let vrJoystickReady = true;

function handleVRInput() {
  const session = renderer.xr.getSession(); if (!session) return; 
  for (const source of session.inputSources) {
    if (source.gamepad && source.gamepad.axes) {
      const joystickX = source.gamepad.axes[2]; 
      const joystickY = source.gamepad.axes[3]; 
      
      if (Math.abs(joystickX) > 0.6) { 
          if (vrJoystickReady) {
              if (joystickX < -0.6 && state.targetLane > 0) {
                  state.targetLane--;
                  vrJoystickReady = false; 
              } 
              else if (joystickX > 0.6 && state.targetLane < LANE_COUNT - 1) {
                  state.targetLane++;
                  vrJoystickReady = false; 
              }
          }
      } 
      else if (Math.abs(joystickY) > 0.6) {
          if (vrJoystickReady) {
              if (joystickY < -0.6 && !state.isJumping) { 
                  state.isJumping = true; 
                  state.jumpVel = state.jumpForce; 
                  state.isSliding = false; 
                  vrJoystickReady = false;
              } 
              else if (joystickY > 0.6 && !state.isSliding && !state.isJumping) { 
                  state.isSliding = true; 
                  sfxSlide.currentTime = 0; 
                  sfxSlide.play().catch(e=>e); 
                  setTimeout(() => { state.isSliding = false; }, 600); 
                  vrJoystickReady = false;
              }
          }
      } 
      else {
          vrJoystickReady = true;
      }
    }
  }
}

// ─── ADMINISTRADOR DE ESTADOS DE POWER-UPS ────────────────────────
function activatePowerUp(type) {
  state.baseSpeed = 0.18; state.jumpForce = 0.18; 
  const pLabel = document.getElementById('power-val');
  
  if (type === 'turbo') {
    state.baseSpeed = 0.32; state.currentPower = 'TURBO VELOCIDAD'; pLabel.style.color = '#ff1133';
  } else if (type === 'slowmo') {
    state.baseSpeed = 0.09; state.currentPower = 'CÁMARA LENTA'; pLabel.style.color = '#0088ff';
  } else if (type === 'superjump') {
    state.jumpForce = 0.35; 
    state.currentPower = 'SÚPER SALTO'; pLabel.style.color = '#00ff44';
  }
  pLabel.textContent = state.currentPower;

  clearTimeout(window.powerTimer);
  window.powerTimer = setTimeout(() => {
    state.baseSpeed = 0.18; state.jumpForce = 0.18; state.currentPower = 'NINGUNO';
    pLabel.textContent = 'NINGUNO'; pLabel.style.color = '#fff';
  }, 5000);
}

// ─── BUCLE PRINCIPAL DE FÍSICAS, SUELO Y COLISIONES ───────────────
renderer.setAnimationLoop(function () {
  if (!state.running) { renderer.render(scene, camera); return; }
  
  handleVRInput(); 

  state.speed = state.baseSpeed + (state.score / 15000) * 0.25;
  const targetX = LANES[state.targetLane]; cameraGroup.position.x += (targetX - cameraGroup.position.x) * 0.18;
  if (Math.abs(cameraGroup.position.x - targetX) < 0.05) state.playerLane = state.targetLane;

  let currentFloorY = 0; 
  for (const tile of tiles) {
    for (const item of tile.items) {
      if (item.type === 'train' && item.lane === state.playerLane) {
        const worldZ = tile.mesh.position.z + item.mesh.position.z;
        if (worldZ > -3.2 && worldZ < 3.2) currentFloorY = 2.8; 
      }
    }
  }

  if (state.isJumping || state.playerY > currentFloorY) { 
    state.playerY += state.jumpVel; 
    state.jumpVel -= 0.012; 
    
    if (state.playerY <= currentFloorY && state.jumpVel <= 0) { 
      state.playerY = currentFloorY; 
      state.isJumping = false; 
      state.jumpVel = 0;
    } 
  }

  cameraGroup.position.y += ((state.isSliding ? 0.6 : 1.6) + state.playerY - cameraGroup.position.y) * 0.2;

  for (const tile of tiles) {
    tile.mesh.position.z += state.speed;
    
    for (let i = tile.items.length - 1; i >= 0; i--) {
      const item = tile.items[i];
      if (item.isCoin || item.isPower) item.mesh.rotation.y += 0.04; 
      
      const worldZ = tile.mesh.position.z + item.mesh.position.z;
      
      if (worldZ > -0.6 && worldZ < 0.6) {
        if (item.lane === state.playerLane) {
          
          if (item.isCoin) {
            state.coins++; document.getElementById('coin-val').textContent = String(state.coins).padStart(3, '0');
            state.score += 200; tile.mesh.remove(item.mesh); tile.items.splice(i, 1);
            sfxCoin.currentTime = 0; sfxCoin.play().catch(e=>e); 
            
          } else if (item.isPower) {
            activatePowerUp(item.type); tile.mesh.remove(item.mesh); tile.items.splice(i, 1);
            sfxPower.currentTime = 0; sfxPower.play().catch(e=>e); 
            
          } else if (!state.invulnerable) {
            
            let hit = false;
            
            if (item.type === 'train') {
                if (state.playerY < 1.8) hit = true;
                else if (state.playerY < 2.8) state.playerY = 2.8; 
            }
            
            if (item.type === 'barrier' && state.playerY < 0.6) hit = true;
            if (item.type === 'overhead' && !state.isSliding && state.playerY < 0.8) hit = true;
            
            if (hit) {
              state.lives--;
              document.getElementById('lives-val').textContent = '♥'.repeat(Math.max(0, state.lives)) + '•'.repeat(Math.max(0, 3 - state.lives));
              state.invulnerable = true;
              
              const dmgOverlay = document.getElementById('damage-overlay');
              dmgOverlay.style.display = 'block'; setTimeout(() => { dmgOverlay.style.display = 'none'; state.invulnerable = false; }, 800);
              
              if (state.lives <= 0) {
                state.running = false; state.gameOver = true; bgMusic.pause();
                
                const timeSeconds = (Date.now() - state.startTime) / 1000;
                const distanceKm = state.score / 1000;
                
                let paceText = "--:--";
                if (distanceKm > 0) {
                    const paceMinutes = (timeSeconds / 60) / distanceKm;
                    const mins = Math.floor(paceMinutes);
                    const secs = Math.floor((paceMinutes - mins) * 60);
                    paceText = `${mins}:${secs.toString().padStart(2, '0')}`;
                }

                let milestone = "Calentamiento Rápido";
                if (distanceKm >= 21) milestone = "¡Medio Maratón Superado! (21km+)";
                else if (distanceKm >= 10) milestone = "Resistencia de 10km Diarios";
                else if (distanceKm >= 5) milestone = "Sprint de 5km completado";
                else if (distanceKm >= 2) milestone = "Ruta de 2km superada";
                
                document.getElementById('start-overlay').style.display = 'flex';
                document.getElementById('main-title').textContent = "SIMULACIÓN TERMINADA";
                document.getElementById('main-title').style.color = "#00ffe7"; 
                
                document.getElementById('instructions-box').innerHTML = `
                    <h3 style="color: #ff3c5f; font-size: 16px;">MÉTRICAS DEL ATLETA</h3>
                    <p style="font-size: 18px; margin-top: 10px;"><strong>Distancia Virtual:</strong> ${distanceKm.toFixed(2)} km</p>
                    <p style="font-size: 15px; margin-top: 5px;"><strong>Ritmo Promedio:</strong> ${paceText} min/km</p>
                    <p style="color: #ffd700; margin-top: 15px; font-weight: bold; text-transform: uppercase;">▶ ${milestone}</p>
                    <hr style="border-color: rgba(0,255,231,0.2); margin: 15px 0;">
                    <p style="font-size: 12px; opacity: 0.8;">Monedas Recolectadas: ${state.coins}</p>
                `;
                
                document.getElementById('team-box').style.display = 'none';
                document.getElementById('start-btn').textContent = "NUEVA SESIÓN DE ENTRENAMIENTO";
                document.getElementById('start-btn').onclick = () => location.reload();

                // AUTOMÁTICO PARA REALIDAD VIRTUAL (4 segundos y reinicia)
                setTimeout(() => {
                    location.reload();
                }, 4000);
              }
            }
          }
        }
      }
    }

    if (tile.mesh.position.z > TILE_LENGTH) {
      tile.mesh.position.z = Math.min(...tiles.map(t => t.mesh.position.z)) - TILE_LENGTH;
      spawnItemsOnTile(tile);
    }
  }

  if(!state.gameOver) state.score += state.speed * 5;
  document.getElementById('score-val').textContent = String(Math.floor(state.score)).padStart(6, '0');
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });