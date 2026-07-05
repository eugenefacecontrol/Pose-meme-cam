const video = document.querySelector("#camera");
const canvas = document.querySelector("#overlay");
const ctx = canvas.getContext("2d");
const permission = document.querySelector("#permission");
const startBtn = document.querySelector("#startBtn");
const memeImage = document.querySelector("#memeImage");
const memeTitle = document.querySelector("#memeTitle");
const memeReason = document.querySelector("#memeReason");
const poseLabel = document.querySelector("#poseLabel");
const modeSelect = document.querySelector("#mode");
const tagForUploads = document.querySelector("#tagForUploads");
const memeFiles = document.querySelector("#memeFiles");
const nextBtn = document.querySelector("#nextBtn");
const shotBtn = document.querySelector("#shotBtn");
const saveTinyBtn = document.querySelector("#saveTinyBtn");
const memeGrid = document.querySelector("#memeGrid");
const buildVersion = "1.0.5";

const poseConnections = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28], [27, 29], [29, 31], [28, 30],
  [30, 32], [15, 17], [15, 19], [15, 21], [16, 18],
  [16, 20], [16, 22], [0, 2], [0, 5], [2, 7], [5, 8]
];

const defaultMemes = [
  {
    title: "Когда созвон начался без предупреждения",
    tags: ["hands_up", "any"],
    image: makeMemeSvg("SOS", "руки вверх")
  },
  {
    title: "Я просто стою, а уже контент",
    tags: ["t_pose", "any"],
    image: makeMemeSvg("T-POSE", "режим босса")
  },
  {
    title: "Вот туда надо было нажать",
    tags: ["pointing", "any"],
    image: makeMemeSvg("ТУДА", "указание")
  },
  {
    title: "Пытаюсь вспомнить, зачем открыл вкладку",
    tags: ["thinking", "any"],
    image: makeMemeSvg("ХМ", "думает")
  },
  {
    title: "Слишком близко к дедлайну",
    tags: ["close", "any"],
    image: makeMemeSvg("БЛИЗКО", "камера")
  },
  {
    title: "Нормально, работаем",
    tags: ["any"],
    image: makeMemeSvg("ОК", "рандом")
  }
];

let memes = [...defaultMemes];
let activeMeme = 0;
let lastSwitch = 0;
let poseLandmarker = null;
let running = false;
let lastVideoTime = -1;

console.log(`Pose Meme Cam v${buildVersion}`);

renderLibrary();
setMeme(0, "Дефолтный мем");

startBtn.addEventListener("click", startCamera);
nextBtn.addEventListener("click", () => pickNext("Вручную выбран следующий мем", true));
shotBtn.addEventListener("click", downloadFrame);
saveTinyBtn.addEventListener("click", downloadFrame);
memeFiles.addEventListener("change", addMemes);

async function startCamera() {
  startBtn.disabled = true;
  startBtn.textContent = "Запрашиваю камеру...";

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Браузер не дает доступ к камере. Открой ссылку в Safari/Chrome, не внутри Threads/Instagram.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });

    video.srcObject = stream;
    await video.play();
    permission.classList.add("hidden");

    memeReason.textContent = "Камера включена, загружаю модель трекинга...";
    poseLandmarker = await createPoseLandmarker();

    running = true;
    requestAnimationFrame(loop);
  } catch (error) {
    console.error(error);
    startBtn.disabled = false;
    startBtn.textContent = "Попробовать снова";
    memeReason.textContent = error.message || "Камера или модель не запустились. Открой страницу через HTTPS или localhost.";
  }
}

async function createPoseLandmarker() {
  startBtn.textContent = "Загружаю модель...";

  // Ждём загрузки MediaPipe если его ещё нет
  while (!window.MediaPipe || !window.MediaPipe.FilesetResolver) {
    console.log("Ожидаю загрузки MediaPipe...");
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const { FilesetResolver, PoseLandmarker } = window.MediaPipe;
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  const options = {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.55,
    minPosePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55
  };

  try {
    return await PoseLandmarker.createFromOptions(vision, options);
  } catch (error) {
    console.warn("GPU delegate failed, retrying with CPU.", error);
    return PoseLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: {
        ...options.baseOptions,
        delegate: "CPU"
      }
    });
  }
}

// Загружаем MediaPipe UMD скрипт при загрузке страницы
function loadMediaPipeUMD() {
  return new Promise((resolve, reject) => {
    console.log("Загружаю MediaPipe UMD...");
    
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js";
    script.type = "text/javascript";
    
    script.onload = () => {
      console.log("UMD скрипт загружен, ожидаю инициализации window.MediaPipe...");
      // Даём время на инициализацию
      setTimeout(() => {
        if (window.MediaPipe) {
          console.log("MediaPipe определён в window");
          resolve(window.MediaPipe);
        } else {
          console.log("Пытаюсь через window.Vision...");
          if (window.Vision) {
            window.MediaPipe = window.Vision;
            resolve(window.MediaPipe);
          } else {
            reject(new Error("MediaPipe не найден в window после загрузки"));
          }
        }
      }, 500);
    };
    
    script.onerror = () => {
      reject(new Error(`Ошибка загрузки MediaPipe с ${script.src}`));
    };
    
    document.head.appendChild(script);
  });
}

loadMediaPipeUMD().catch(error => {
  console.error("Ошибка при загрузке MediaPipe:", error);
});

function loop() {
  if (!running) return;

  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (video.currentTime !== lastVideoTime && poseLandmarker) {
    const result = poseLandmarker.detectForVideo(video, performance.now());
    const landmarks = result.landmarks?.[0];

    if (landmarks) {
      drawPose(landmarks);
      const pose = classifyPose(landmarks);
      poseLabel.textContent = pose.label;
      maybeSelectMeme(pose);
    } else {
      memeReason.textContent = "Ищу человека в кадре";
      poseLabel.textContent = "поиск";
    }

    lastVideoTime = video.currentTime;
  }

  requestAnimationFrame(loop);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawPose(landmarks) {
  const w = canvas.width;
  const h = canvas.height;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "rgba(54, 211, 153, 0.92)";
  ctx.lineWidth = Math.max(3, w / 260);
  for (const [a, b] of poseConnections) {
    const p1 = landmarks[a];
    const p2 = landmarks[b];
    if (isVisible(p1) && isVisible(p2)) {
      ctx.beginPath();
      ctx.moveTo((1 - p1.x) * w, p1.y * h);
      ctx.lineTo((1 - p2.x) * w, p2.y * h);
      ctx.stroke();
    }
  }

  for (const point of landmarks) {
    if (!isVisible(point)) continue;
    ctx.beginPath();
    ctx.fillStyle = "rgba(56, 189, 248, 0.95)";
    ctx.arc((1 - point.x) * w, point.y * h, Math.max(4, w / 190), 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
    ctx.stroke();
  }

  ctx.restore();
}

function isVisible(point) {
  return point && (point.visibility === undefined || point.visibility > 0.45);
}

function classifyPose(lm) {
  const nose = lm[0];
  const leftShoulder = lm[11];
  const rightShoulder = lm[12];
  const leftWrist = lm[15];
  const rightWrist = lm[16];
  const leftHip = lm[23];
  const rightHip = lm[24];

  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
  const hipMidY = (leftHip.y + rightHip.y) / 2;
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const leftArmOut = Math.abs(leftWrist.y - leftShoulder.y) < 0.1 && Math.abs(leftWrist.x - leftShoulder.x) > shoulderWidth * 0.9;
  const rightArmOut = Math.abs(rightWrist.y - rightShoulder.y) < 0.1 && Math.abs(rightWrist.x - rightShoulder.x) > shoulderWidth * 0.9;
  const wristsHigh = leftWrist.y < shoulderY - 0.12 && rightWrist.y < shoulderY - 0.12;
  const pointing = Math.abs(leftWrist.x - rightWrist.x) > shoulderWidth * 1.7 && Math.abs(leftWrist.y - rightWrist.y) < 0.18;
  const thinking = (leftWrist.y < nose.y + 0.16 && leftWrist.y > nose.y - 0.1) || (rightWrist.y < nose.y + 0.16 && rightWrist.y > nose.y - 0.1);
  const close = Math.abs(hipMidY - shoulderY) > 0.34 || shoulderWidth > 0.38;

  if (wristsHigh) return { tag: "hands_up", label: "双手抬头", reason: "Руки выше плеч" };
  if (leftArmOut && rightArmOut) return { tag: "t_pose", label: "T字姿势", reason: "Поза похожа на T-pose" };
  if (pointing) return { tag: "pointing", label: "指向", reason: "Руки вытянуты в сторону" };
  if (thinking) return { tag: "thinking", label: "思考", reason: "Рука рядом с лицом" };
  if (close) return { tag: "close", label: "靠近", reason: "Человек близко к камере" };
  return { tag: "any", label: "中性", reason: "Нейтральная поза" };
}

function maybeSelectMeme(pose) {
  const now = performance.now();
  const mode = modeSelect.value;

  if (mode === "manual") {
    memeReason.textContent = "Ручной режим";
    return;
  }

  if (now - lastSwitch < 1500) {
    return;
  }

  if (mode === "random") {
    pickNext("Случайный режим", true);
    lastSwitch = now;
    return;
  }

  const candidates = memes
    .map((meme, index) => ({ meme, index }))
    .filter(({ meme }) => meme.tags.includes(pose.tag) || meme.tags.includes("any"));

  if (!candidates.length) return;

  const exact = candidates.filter(({ meme }) => meme.tags.includes(pose.tag));
  const pool = exact.length ? exact : candidates;
  const choice = pool[Math.floor(Math.random() * pool.length)];

  if (choice.index !== activeMeme || now - lastSwitch > 4500) {
    setMeme(choice.index, pose.reason);
    lastSwitch = now;
  }
}

function pickNext(reason, force) {
  if (memes.length < 1) return;
  const next = force ? (activeMeme + 1) % memes.length : Math.floor(Math.random() * memes.length);
  setMeme(next, reason);
}

function setMeme(index, reason) {
  activeMeme = index;
  const meme = memes[index];
  memeImage.src = meme.image;
  memeTitle.textContent = meme.title;
  memeReason.textContent = `${reason} · теги: ${meme.tags.join(", ")}`;

  for (const [cardIndex, card] of [...memeGrid.children].entries()) {
    card.classList.toggle("active", cardIndex === index);
  }
}

function addMemes(event) {
  const files = [...event.target.files].filter((file) => file.type.startsWith("image/"));
  const tag = tagForUploads.value;

  for (const file of files) {
    memes.push({
      title: file.name.replace(/\.[^.]+$/, ""),
      tags: tag === "any" ? ["any"] : [tag, "any"],
      image: URL.createObjectURL(file)
    });
  }

  renderLibrary();
  setMeme(memes.length - files.length, `Добавлено: ${files.length}`);
  event.target.value = "";
}

function renderLibrary() {
  memeGrid.replaceChildren();

  for (const [index, meme] of memes.entries()) {
    const card = document.createElement("button");
    card.className = "meme-card";
    card.type = "button";
    card.innerHTML = `
      <img src="${meme.image}" alt="">
      <strong></strong>
      <small></small>
    `;
    card.querySelector("strong").textContent = meme.title;
    card.querySelector("small").textContent = meme.tags.join(", ");
    card.addEventListener("click", () => {
      modeSelect.value = "manual";
      setMeme(index, "Выбрано из библиотеки");
    });
    memeGrid.append(card);
  }
}

function downloadFrame() {
  const exportCanvas = document.createElement("canvas");
  const width = 1280;
  const height = 900;
  exportCanvas.width = width;
  exportCanvas.height = height;
  const out = exportCanvas.getContext("2d");

  out.fillStyle = "#111111";
  out.fillRect(0, 0, width, height);

  out.save();
  out.translate(width, 0);
  out.scale(-1, 1);
  out.drawImage(video, 0, 0, width, 720);
  out.restore();
  out.drawImage(canvas, 0, 0, width, 720);

  out.fillStyle = "#1a1a1a";
  out.fillRect(0, 720, width, 180);
  out.drawImage(memeImage, 0, 720, 300, 180);
  out.fillStyle = "#f4f4f4";
  out.font = "700 44px system-ui, sans-serif";
  wrapText(out, memeTitle.textContent, 330, 785, 900, 52);
  out.fillStyle = "#a8a8a8";
  out.font = "24px system-ui, sans-serif";
  wrapText(out, memeReason.textContent, 330, 855, 900, 32);

  const link = document.createElement("a");
  link.download = `pose-meme-${Date.now()}.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
}

function wrapText(out, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (out.measureText(testLine).width > maxWidth && line) {
      out.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }

  out.fillText(line, x, y);
}

function makeMemeSvg(big, small) {
  const bg = big.length > 4 ? "#1f2937" : "#18181b";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="675" viewBox="0 0 900 675">
      <rect width="900" height="675" fill="${bg}"/>
      <rect x="38" y="38" width="824" height="599" rx="34" fill="#f4f4f4"/>
      <rect x="66" y="66" width="768" height="543" rx="24" fill="#111111"/>
      <text x="450" y="318" text-anchor="middle" fill="#36d399" font-family="Arial, sans-serif" font-size="126" font-weight="900">${escapeSvg(big)}</text>
      <text x="450" y="410" text-anchor="middle" fill="#f4f4f4" font-family="Arial, sans-serif" font-size="52" font-weight="700">${escapeSvg(small)}</text>
    </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
