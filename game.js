import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import { EffectComposer } from "jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "jsm/postprocessing/UnrealBloomPass.js";
import { GLTFLoader } from "jsm/loaders/GLTFLoader.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBDP807efNTMOuQc6jdi23NKnb2LbvxBlM",
  authDomain: "infinite-horizon-1.firebaseapp.com",
  projectId: "infinite-horizon-1",
  storageBucket: "infinite-horizon-1.firebasestorage.app",
  messagingSenderId: "393334686227",
  appId: "1:393334686227:web:06ca63ecd18e2c43d2f5e6",
  measurementId: "G-GDXH9NE5PT",
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
let isLoading = true;

const loadingManager = new THREE.LoadingManager();

loadingManager.onStart = () => {
  document.getElementById("loading-screen").style.display = "flex";
};

loadingManager.onLoad = () => {
  isLoading = false;
  startTime = Date.now();
  document.getElementById("loading-screen").style.display = "none";
  animate();
};

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  console.log(`Loaded ${itemsLoaded} of ${itemsTotal} files.`);
};

loadingManager.onError = (url) => {
  console.error(`Error loading ${url}`);
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.04);
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 2, 0);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,
  0.4,
  100
);
bloomPass.threshold = 0.002;
bloomPass.strength = 2.0;
bloomPass.radius = 0;
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

const slowModeOverlay = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0.0 },
      uColor: { value: new THREE.Color(0x0369a1) },
    },
    vertexShader: `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;

      void main() {
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
    transparent: true,
  })
);

slowModeOverlay.frustumCulled = false;
scene.add(slowModeOverlay);

const enemies = [];
const speedLines = [];
let isJumping = false;
let isGameOver = false;
let isPaused = false;
let frames = 0;
let timeScale = 1.0;
let spawnRate = 15;
let survivedTime = 0;
let cubeVelocity = 0.15;
let enemyVelocity = 0.3;
let startTime = Date.now();
const audioElement = new Audio("/public/audio/music.mp3");
audioElement.loop = true;
let animationId;

let audioContext;
let audioSource;
let lowPassFilter;
let gainNode;

function updateScore() {
  const playerName = localStorage.getItem("playerName");
  const playerScore = survivedTime;

  if (!playerName) {
    console.log("Player name is not set.");
    return;
  }

  const playerScoreRef = ref(database, "players/" + playerName + "/score");

  get(playerScoreRef)
    .then((snapshot) => {
      if (snapshot.exists()) {
        const existingScore = snapshot.val();
        if (playerScore > existingScore) {
          set(playerScoreRef, playerScore)
            .then(() => {
              console.log("Score updated successfully!");
            })
            .catch((error) => {
              console.error("Error updating score:", error);
            });
        } else {
          console.log(
            "Existing score is higher or equal, no update necessary."
          );
        }
      } else {
        set(playerScoreRef, playerScore)
          .then(() => {
            console.log("No existing score. New score set successfully.");
          })
          .catch((error) => {
            console.error("Error setting score:", error);
          });
      }
    })
    .catch((error) => {
      console.error("Error fetching score:", error);
    });
}

class Box extends THREE.Mesh {
  constructor({
    width,
    height,
    depth,
    color = 0xffff00,
    velocity = {
      x: 0,
      y: 0,
      z: 0,
    },
    position = {
      x: 0,
      y: 0,
      z: 0,
    },
    zAcceleration = false,
    emissiveIntensity = 1,
  }) {
    super(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity,
      })
    );
    this.height = height;
    this.width = width;
    this.depth = depth;
    this.position.set(position.x, position.y, position.z);

    this.right = this.position.x + this.width / 2;
    this.left = this.position.x - this.width / 2;

    this.bottom = this.position.y - this.height / 2;
    this.top = this.position.y + this.height / 2;

    this.front = this.position.z + this.depth / 2;
    this.back = this.position.z - this.depth / 2;

    this.velocity = velocity;
    this.gravity = -0.002;

    this.zAcceleration = zAcceleration;
  }
  updateSides() {
    this.bottom = this.position.y - this.height / 2;
    this.top = this.position.y + this.height / 2;

    this.right = this.position.x + this.width / 2;
    this.left = this.position.x - this.width / 2;

    this.front = this.position.z + this.depth / 2;
    this.back = this.position.z - this.depth / 2;
  }
  update(ground) {
    this.updateSides();
    if (this.zAcceleration) {
      this.velocity.z += 0.0001;
    }
    this.position.x += this.velocity.x;
    this.position.z += this.velocity.z;

    this.applyGravity(ground);
  }

  applyGravity(ground) {
    this.velocity.y += this.gravity;

    if (
      boxCollision({
        box1: this,
        box2: ground,
      })
    ) {
      const friction = 0.5;
      this.velocity.y *= friction;
      this.velocity.y = -this.velocity.y;
    } else {
      this.position.y += this.velocity.y;
    }
  }
}

function boxCollision({ box1, box2 }) {
  const zCollision = box1.front >= box2.back && box1.back <= box2.front;
  const yCollision =
    box1.bottom + box1.velocity.y <= box2.top && box1.top >= box2.bottom;
  const xCollision = box1.right >= box2.left && box1.left <= box2.right;

  return xCollision && yCollision && zCollision;
}

const loader = new GLTFLoader(loadingManager);
function createCubeWithModel(modelUrl, cubeConfig) {
  const cube = new Box(cubeConfig);
  loader.load(
    modelUrl,
    (gltf) => {
      const model = gltf.scene;

      model.scale.set(
        cubeConfig.scale || 0.2,
        cubeConfig.scale || 0.2,
        cubeConfig.scale || 0.2
      );

      model.rotation.y = Math.PI;
      cube.add(model);
    },
    undefined,
    (error) => {
      console.error("Error loading GLTF model:", error);
    }
  );
  return cube;
}

const cubeConfig = {
  width: 1.4,
  height: 1,
  depth: 1.4,
  position: { x: 0, y: 2, z: 0 },
  velocity: { x: 0, y: -0.01, z: 0 },
  zAcceleration: false,
};
const cube = createCubeWithModel("/public/spaceship/scene.gltf", cubeConfig);
cube.material = new THREE.MeshBasicMaterial({
  opacity: 0,
  transparent: true,
});
cube.castShadow = true;
scene.add(cube);

const ground = new Box({
  width: 20,
  height: 0.5,
  depth: 100,
  color: 0x0369a1,
  position: {
    x: 0,
    y: -2,
    z: 0,
  },
});
ground.material = new THREE.MeshBasicMaterial({
  color: 0x0369a1,
  wireframe: true,
  side: THREE.DoubleSide,
});
ground.receiveShadow = true;
scene.add(ground);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.y = 3;
directionalLight.position.z = 1;
directionalLight.castShadow = true;
scene.add(directionalLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const keys = {
  a: {
    pressed: false,
  },
  d: {
    pressed: false,
  },
  w: {
    pressed: false,
  },
  s: {
    pressed: false,
  },
};

window.addEventListener("keydown", (event) => {
  switch (event.code) {
    case "KeyA":
      keys.a.pressed = true;
      break;
    case "KeyD":
      keys.d.pressed = true;
      break;
    case "KeyW":
      keys.w.pressed = true;
      break;
    case "KeyS":
      keys.s.pressed = true;
      break;
    case "Space":
      if (!isJumping) {
        cube.velocity.y = 0.08;
        isJumping = true;
      }
      break;
    case "ShiftRight":
      timeScale = 0.3;
      slowModeOverlay.material.uniforms.uOpacity.value = 0.04;
      muffleAudio();
      break;
  }
});

window.addEventListener("keyup", (event) => {
  switch (event.code) {
    case "KeyA":
      keys.a.pressed = false;
      break;
    case "KeyD":
      keys.d.pressed = false;
    case "KeyW":
      keys.w.pressed = false;
      break;
    case "KeyS":
      keys.s.pressed = false;
    case "Space":
      isJumping = false;
      break;
    case "ShiftRight":
      timeScale = 1.0;
      slowModeOverlay.material.uniforms.uOpacity.value = 0.0;
      unmuffleAudio();
      break;
  }
});

const starsTextureUrl = "/public/background.jpg";
const cubeTextureLoader = new THREE.CubeTextureLoader(loadingManager);
scene.background = cubeTextureLoader.load([
  starsTextureUrl,
  starsTextureUrl,
  starsTextureUrl,
  starsTextureUrl,
  starsTextureUrl,
  starsTextureUrl,
]);

setInterval(() => {
  enemyVelocity += 0.02;
}, 1000);

function enemyPositionGenerator() {
  return (Math.random() - 0.5) * 20;
}
function getRandomColor() {
  return Math.floor(Math.random() * 16777215);
}

function createSpeedLines(numLines = 100) {
  for (let i = 0; i < numLines; i++) {
    const x = (Math.random() - 0.5) * 100;
    const y = (Math.random() - 0.5) * 100;
    const z = Math.random() * -100;

    const lineLength = Math.random() * 10 + 5;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(2 * 3);

    positions[0] = x;
    positions[1] = y;
    positions[2] = z;

    positions[3] = x;
    positions[4] = y;
    positions[5] = z - lineLength;

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      opacity: 0.8,
      transparent: true,
      linewidth: 2,
    });

    const line = new THREE.Line(geometry, material);
    scene.add(line);
    speedLines.push(line);
  }
}

createSpeedLines();

function updateSpeedLines(timeScale = 1) {
  speedLines.forEach((line) => {
    const positions = line.geometry.attributes.position.array;

    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 2] += 0.5 * timeScale;
      if (positions[i + 2] > 5) {
        positions[i + 2] = -100;
      }
    }

    line.geometry.attributes.position.needsUpdate = true;
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
}

function adjustCameraFov() {
  const fov = window.innerWidth / window.innerHeight > 1.6 ? 75 : 65;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", () => {
  onWindowResize();
  adjustCameraFov();
});

const timeElement = document.getElementById("survival-time");
timeElement.innerText = "0s";
document.body.appendChild(timeElement);

const gamePlayPauseBtn = document.getElementById("game-play-pause-btn");
const playPauseImg = document.getElementById("play-pause-img");
gamePlayPauseBtn.addEventListener("click", () => {
  togglePause();
  gamePlayPauseBtn.blur();
});

function togglePause() {
  if (isGameOver) return;
  if (isPaused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

function pauseGame() {
  isPaused = true;
  playPauseImg.src = "https://cdn-icons-png.flaticon.com/512/3318/3318660.png";
  console.log("Game paused");
  cancelAnimationFrame(animationId);
  audioElement.pause();
}

function resumeGame() {
  isPaused = false;
  playPauseImg.src =
    "https://www.pngarts.com/files/4/Pause-Button-PNG-Free-Download.png";
  console.log("Game resumed");
  audioElement.play().catch((error) => {
    console.warn("Audio playback blocked or failed to resume:", error);
  });
  animate();
}

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyP" && !isGameOver) {
    togglePause();
    document.activeElement.blur();
  }
});

document.getElementById("restart-btn").addEventListener("click", () => {
  restartGame();
});

function restartGame() {
  enemies.forEach((enemy) => {
    scene.remove(enemy);
  });
  enemies.length = 0;
  survivedTime = 0;
  timeElement.innerText = "0";
  frames = 0;
  enemyVelocity = 0.3;
  enemies.length = 0;

  cube.position.set(0, 2, 0);
  cube.velocity = { x: 0, y: 0, z: 0 };

  document.getElementById("game-over-overlay").style.display = "none";

  startTime = Date.now();
  isGameOver = false;
  animate();
}

function animate() {
  if (isPaused || isLoading) return;
  animationId = requestAnimationFrame(animate);

  cube.velocity.x = 0;
  cube.velocity.z = 0;

  if (keys.w.pressed) {
    cube.velocity.z -= cubeVelocity * timeScale;
  } else if (keys.s.pressed) {
    cube.velocity.z += cubeVelocity * timeScale;
  }
  if (keys.a.pressed) {
    cube.velocity.x = -cubeVelocity * timeScale;
  } else if (keys.d.pressed) {
    cube.velocity.x = cubeVelocity * timeScale;
  }

  updateSpeedLines(timeScale);
  cube.update(ground);

  const elapsedTime = (Date.now() - startTime) / 1000;
  survivedTime = Math.floor(elapsedTime);
  timeElement.innerText = `${survivedTime}${survivedTime === 0 ? "" : "s"}`;

  camera.position.x = THREE.MathUtils.lerp(
    camera.position.x,
    cube.position.x,
    0.1
  );

  enemies.forEach((enemy) => {
    enemy.velocity.z *= timeScale;
    enemy.update(ground);
    enemy.velocity.z /= timeScale;

    if (
      boxCollision({
        box1: cube,
        box2: enemy,
      })
    ) {
      cancelAnimationFrame(animationId);
      isGameOver = true;
      updateScore();
      timeElement.innerText = "";
      document.getElementById("final-time").innerText = survivedTime;
      document.getElementById("game-over-overlay").style.display = "flex";
    }
  });

  if (frames % spawnRate === 0) {
    if (spawnRate > 10) {
      spawnRate -= 5;
    }
    const randomColor = getRandomColor();
    const enemy = new Box({
      width: 1,
      height: 1,
      depth: 1,
      position: {
        x: enemyPositionGenerator(),
        y: 0,
        z: -35,
      },
      velocity: { x: 0, y: 0, z: enemyVelocity },
      color: randomColor,
      zAcceleration: true,
    });

    const geometries = [
      new THREE.SphereGeometry(0.5, 32, 32),
      new THREE.ConeGeometry(0.5, 1, 32),
      new THREE.BoxGeometry(1, 1, 1),
    ];
    const randomGeometry =
      geometries[Math.floor(Math.random() * geometries.length)];
    enemy.geometry = randomGeometry;

    enemy.castShadow = true;
    scene.add(enemy);
    enemies.push(enemy);
  }

  frames++;
  controls.update();
  composer.render();
}
animate();

window.addEventListener("load", () => {
  setupAudioContext();
  toggleAudioPlayPause();
});

function setupAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioSource = audioContext.createMediaElementSource(audioElement);

    lowPassFilter = audioContext.createBiquadFilter();
    lowPassFilter.type = "lowpass";
    lowPassFilter.frequency.setValueAtTime(20000, audioContext.currentTime);

    gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(1, audioContext.currentTime);

    audioSource.connect(gainNode);
    gainNode.connect(lowPassFilter);
    lowPassFilter.connect(audioContext.destination);
  }
}

function toggleAudioPlayPause() {
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }

  if (audioElement.paused) {
    audioElement
      .play()
      .then(() => {
        document.getElementById("audio-img").src =
          "https://cdn-icons-png.flaticon.com/512/786/786373.png";
        console.log("Audio started playing.");
      })
      .catch((error) => console.warn("Autoplay blocked:", error));
  } else {
    audioElement.pause();
    document.getElementById("audio-img").src =
      "https://cdn4.iconfinder.com/data/icons/mosaicon-05/512/nosound-512.png";
  }
}

function muffleAudio() {
  if (lowPassFilter && gainNode) {
    lowPassFilter.frequency.setValueAtTime(400, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    console.log("Audio muffled.");
  }
}

function unmuffleAudio() {
  if (lowPassFilter && gainNode) {
    lowPassFilter.frequency.setValueAtTime(20000, audioContext.currentTime);
    gainNode.gain.setValueAtTime(1, audioContext.currentTime);
    console.log("Audio unmuffled.");
  }
}

document
  .getElementById("audio-play-pause-btn")
  .addEventListener("click", () => {
    setupAudioContext();
    toggleAudioPlayPause();
    document.getElementById("audio-play-pause-btn").blur();
  });

window.addEventListener("keydown", (event) => {
  setupAudioContext();

  if (event.code === "KeyM") {
    toggleAudioPlayPause();
    document.activeElement.blur();
  }

  if (event.code === "KeyG") {
    muffleAudio();
  }

  if (event.code === "KeyU") {
    unmuffleAudio();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    if (!isPaused && !isGameOver) {
      pauseGame();
    }
  } else if (document.visibilityState === "visible") {
    if (!isPaused && !isGameOver) {
      resumeGame();
    }
  }
});
