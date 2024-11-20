import * as THREE from "three";
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

document
  .getElementById("leaderboard-btn")
  .addEventListener("click", function () {
    const leaderboard = document.getElementById("leaderboard");
    leaderboard.style.display =
      leaderboard.style.display === "none" || leaderboard.style.display === ""
        ? "block"
        : "none";
    document.getElementById("leaderboard-btn").textContent =
      leaderboard.style.display === "none"
        ? "Show Leaderboard"
        : "Hide Leaderboard";
  });

function fetchLeaderboard() {
  const leaderboardRef = ref(database, "players");
  get(leaderboardRef)
    .then((snapshot) => {
      if (snapshot.exists()) {
        const players = snapshot.val();
        const leaderboard = Object.keys(players)
          .map((key) => ({
            name: players[key].name,
            score: players[key].score,
          }))
          .sort((a, b) => b.score - a.score);

        displayLeaderboard(leaderboard);
      } else {
        console.log("No players found");
      }
    })
    .catch((error) => {
      console.error("Error fetching leaderboard: ", error);
    });
}

function displayLeaderboard(leaderboard) {
  const leaderboardList = document.getElementById("leaderboard-list");
  leaderboardList.innerHTML = "";

  leaderboard.forEach((player, index) => {
    const playerScore = player.score || 0;
    const scoreDisplay = playerScore !== 0 ? `${playerScore}s` : playerScore;
    const playerElement = document.createElement("div");

    let rankClass = "other";
    if (index === 0) {
      rankClass = "first";
    } else if (index === 1) {
      rankClass = "second";
    } else if (index === 2) {
      rankClass = "third";
    }

    playerElement.textContent = `${index + 1}. ${player.name}: ${scoreDisplay}`;
    playerElement.classList.add(rankClass);

    leaderboardList.appendChild(playerElement);
  });
}

document.addEventListener("DOMContentLoaded", fetchLeaderboard);

const toggleControlsBtn = document.getElementById("toggle-controls-btn");
const controlsPanel = document.getElementById("controls-panel");

toggleControlsBtn.addEventListener("click", () => {
  if (
    controlsPanel.style.display === "none" ||
    controlsPanel.style.display === ""
  ) {
    controlsPanel.style.display = "block";
    toggleControlsBtn.innerText = "Hide Controls";
  } else {
    controlsPanel.style.display = "none";
    toggleControlsBtn.innerText = "Show Controls";
  }
});

const form = document.getElementById("send-it");

document.getElementById("submit-name").addEventListener("click", () => {
  const name = document.getElementById("name").value;
  if (name) {
    localStorage.setItem("playerName", name);
    const userRef = ref(database, "players/" + name);
    set(userRef, {
      name: name,
    })
      .then(() => {
        window.location.href = "game.html";
      })
      .catch((error) => {
        console.error("Error saving name: ", error);
      });
  } else {
    alert("Please enter your name!");
  }
});

const canvas = document.getElementById("c");
const hiddens = document.querySelectorAll(".hidden");

document.addEventListener("DOMContentLoaded", () => {
  canvas.style.opacity = 1;
  hiddens.forEach((hid) => hid.classList.remove("hidden"));
});

const getRandomParticelPos = (particleCount) => {
  const arr = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    arr[i] = (Math.random() - 0.5) * 10;
  }
  return arr;
};
const resizeRendererToDisplaySize = (renderer) => {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
  }
  return needResize;
};

let mouseX = 0;
let mouseY = 0;
document.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

const starFieldBG = () => {
  const canvas = document.getElementById("c");
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setClearColor(new THREE.Color("#000000"));
  const scene = new THREE.Scene();

  const color = 0xffffff,
    intensity = 1;
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(-1, 2, 4);
  scene.add(light);

  const fov = 75,
    aspect = 2,
    near = 1.5,
    far = 5;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.z = 2;

  const geometrys = [new THREE.BufferGeometry(), new THREE.BufferGeometry()];

  geometrys[0].setAttribute(
    "position",
    new THREE.BufferAttribute(getRandomParticelPos(350), 3)
  );
  geometrys[1].setAttribute(
    "position",
    new THREE.BufferAttribute(getRandomParticelPos(1500), 3)
  );

  const loader = new THREE.TextureLoader();

  const materials = [
    new THREE.PointsMaterial({
      size: 0.05,
      map: loader.load(
        "https://raw.githubusercontent.com/Kuntal-Das/textures/main/sp1.png"
      ),
      transparent: true,
      color: "#0369a1",
    }),
    new THREE.PointsMaterial({
      size: 0.075,
      map: loader.load(
        "https://raw.githubusercontent.com/Kuntal-Das/textures/main/sp2.png"
      ),
      transparent: true,
      // color: "#0369a1"
    }),
  ];

  const starsT1 = new THREE.Points(geometrys[0], materials[0]);
  const starsT2 = new THREE.Points(geometrys[1], materials[1]);
  scene.add(starsT1);
  scene.add(starsT2);

  const render = (time) => {
    time *= 0.001;

    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    starsT1.position.x = mouseX * 0.0001;
    starsT1.position.y = mouseY * -0.0001;

    starsT2.position.x = mouseX * 0.0001;
    starsT2.position.y = mouseY * -0.0001;

    renderer.render(scene, camera);
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);
};
starFieldBG();
