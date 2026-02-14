import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// --- PWA Installation Logic ---
let deferredPrompt;
const installBtn = document.getElementById('install-pwa-btn');

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => console.log('SW registered'))
            .catch(err => console.log('SW registration failed: ', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'flex';
});

installBtn.addEventListener('click', (e) => {
    installBtn.style.display = 'none';
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            deferredPrompt = null;
        });
    }
});

// --- Translation Logic ---
const translations = {
    'en': {
        'app-title': '3D Soccer Tactic Board',
        'settings-title': 'Tactical Board Settings',
        'general-settings': 'General Settings',
        'display-settings': 'Display Settings',
        'full-court': 'Full Court',
        'half-court': 'Half Court',
        'show-opponent': 'Show Opponent (Team B)',
        'dark-mode': 'Dark Mode',
        'language': 'Language',
        'team-config': 'Team Configuration',
        'team-a': 'Team A (Left)',
        'team-b': 'Team B (Right)',
        'kit-color': 'Kit Color',
        'formation': 'Formation',
        'reset-pos': 'Reset Positions',
        'download-pdf': 'Download PDF',
        'install-app': 'Install App',
        'init-loading': 'Initializing...',
        'version': 'v2.7 • 3D Tactical Board',
        'player-name-default': 'Name',
        'confirm-reset': 'Are you sure you want to reset all positions?',
        'set-start-alert': 'Start position set! Now move players to "End" position and click Play.'
    },
    'zh-TW': {
        'app-title': '3D 足球戰術板',
        'settings-title': '戰術板設定',
        'general-settings': '一般設定',
        'display-settings': '顯示設定',
        'full-court': '全場',
        'half-court': '半場',
        'show-opponent': '顯示對手 (B隊)',
        'dark-mode': '深色模式',
        'language': '語言 (Language)',
        'team-config': '球隊配置',
        'team-a': 'A 隊 (左)',
        'team-b': 'B 隊 (右)',
        'kit-color': '球衣顏色',
        'formation': '陣型',
        'reset-pos': '重置位置',
        'download-pdf': '下載 PDF',
        'install-app': '安裝 App',
        'init-loading': '初始化戰術板...',
        'version': 'v2.7 • 3D Tactical Board',
        'player-name-default': '名字',
        'confirm-reset': '確定要重置所有位置嗎？',
        'set-start-alert': '起點已設定！現在請將球員移動到「終點」位置，然後點擊播放。'
    }
};

let currentLang = 'zh-TW';

function updateLanguage(lang) {
    currentLang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });
}

// --- Globals ---
let scene, camera, renderer, labelRenderer, controls;
let fieldPlane;
let raycaster, pointer;

const playersGroup = new THREE.Group();
const linesGroup = new THREE.Group();
const goalsGroup = new THREE.Group(); 
let ball;

// Tool State
let currentTool = 'move';
let lineType = 'solid';
let isDragging = false;
let draggedObject = null;
let isDrawing = false;
let drawingPoints = [];
let currentLine = null;
let dragPlane; 

let currentViewMode = 'full'; 

// History System
let historyStack = [];
let historyStep = -1;
const MAX_HISTORY = 20;

// Animation System
let animStartPositions = null;
let isAnimating = false;

const FIELD_WIDTH = 105;
const FIELD_HEIGHT = 68;
const PLAYER_RADIUS = 2.5; 

// Formations
const formations = {
    '4-3-3': {
        teamA: [ {n:1, x:-50, z:0}, {n:2, x:-30, z:-20}, {n:3, x:-30, z:20}, {n:4, x:-40, z:-10}, {n:5, x:-40, z:10}, {n:6, x:-20, z:0}, {n:8, x:-10, z:-15}, {n:10, x:-10, z:15}, {n:7, x:-5, z:-20}, {n:11, x:-5, z:20}, {n:9, x:-1, z:0} ],
        teamB: [ {n:1, x:50, z:0}, {n:2, x:30, z:-20}, {n:3, x:30, z:20}, {n:4, x:40, z:-10}, {n:5, x:40, z:10}, {n:6, x:20, z:0}, {n:8, x:10, z:-15}, {n:10, x:10, z:15}, {n:7, x:5, z:-20}, {n:11, x:5, z:20}, {n:9, x:1, z:0} ]
    },
    '4-4-2': {
        teamA: [ {n:1, x:-50, z:0}, {n:2, x:-30, z:-20}, {n:3, x:-30, z:20}, {n:4, x:-40, z:-7}, {n:5, x:-40, z:7}, {n:7, x:-15, z:-20}, {n:6, x:-15, z:-7}, {n:8, x:-15, z:7}, {n:11, x:-15, z:20}, {n:9, x:-1, z:-7}, {n:10, x:-1, z:7} ],
        teamB: [ {n:1, x:50, z:0}, {n:2, x:30, z:-20}, {n:3, x:30, z:20}, {n:4, x:40, z:-7}, {n:5, x:40, z:7}, {n:7, x:15, z:-20}, {n:6, x:15, z:-7}, {n:8, x:15, z:7}, {n:11, x:15, z:20}, {n:9, x:1, z:-7}, {n:10, x:1, z:7} ]
    },
    '4-2-3-1': {
        teamA: [ {n:1, x:-50, z:0}, {n:2, x:-30, z:-20}, {n:3, x:-30, z:20}, {n:4, x:-40, z:-8}, {n:5, x:-40, z:8}, {n:6, x:-20, z:-8}, {n:8, x:-20, z:8}, {n:10, x:-10, z:0}, {n:7, x:-10, z:-20}, {n:11, x:-10, z:20}, {n:9, x:-1, z:0} ],
        teamB: [ {n:1, x:50, z:0}, {n:2, x:30, z:-20}, {n:3, x:30, z:20}, {n:4, x:40, z:-8}, {n:5, x:40, z:8}, {n:6, x:20, z:-8}, {n:8, x:20, z:8}, {n:10, x:10, z:0}, {n:7, x:10, z:-20}, {n:11, x:10, z:20}, {n:9, x:1, z:0} ]
    },
    '3-5-2': {
        teamA: [ {n:1, x:-50, z:0}, {n:2, x:-40, z:-15}, {n:4, x:-40, z:0}, {n:5, x:-40, z:15}, {n:7, x:-20, z:-25}, {n:11, x:-20, z:25}, {n:6, x:-20, z:0}, {n:8, x:-10, z:-10}, {n:10, x:-10, z:10}, {n:9, x:-1, z:-5}, {n:12, x:-1, z:5} ],
        teamB: [ {n:1, x:50, z:0}, {n:2, x:40, z:-15}, {n:4, x:40, z:0}, {n:5, x:40, z:15}, {n:7, x:20, z:-25}, {n:11, x:20, z:25}, {n:6, x:20, z:0}, {n:8, x:10, z:-10}, {n:10, x:10, z:10}, {n:9, x:1, z:-5}, {n:12, x:1, z:5} ]
    }
};

// --- Init ---
init();
animate();

function init() {
    const container = document.getElementById('canvas-container');

    // 1. Scene
    scene = new THREE.Scene();

    // 2. Camera
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 60, 60); 
    camera.lookAt(0, 0, 0);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.zIndex = '1';
    container.appendChild(renderer.domElement);

    // 4. Label Renderer
    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(container.clientWidth, container.clientHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.zIndex = '2'; 
    container.appendChild(labelRenderer.domElement);

    // 5. Controls
    controls = new OrbitControls(camera, labelRenderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; 
    controls.minDistance = 10;
    controls.maxDistance = 150;
    controls.rotateSpeed = 0.7;

    // 6. Light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // 7. Field
    createField('full');
    createGoals(); // Create Goal Posts
    
    // 8. Interaction Setup
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    
    dragPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(500, 500),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    dragPlane.rotation.x = -Math.PI / 2;
    scene.add(dragPlane);

    scene.add(playersGroup);
    scene.add(linesGroup);
    scene.add(goalsGroup);

    // 9. Initial Population & Local Storage Load
    loadData();

    // 10. Event Listeners
    const resizeObserver = new ResizeObserver(() => {
        onWindowResize();
    });
    resizeObserver.observe(container);

    labelRenderer.domElement.addEventListener('pointerdown', onPointerDown);
    labelRenderer.domElement.addEventListener('pointermove', onPointerMove);
    labelRenderer.domElement.addEventListener('pointerup', onPointerUp);
    labelRenderer.domElement.addEventListener('pointercancel', onPointerUp);
    
    labelRenderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault()); 

    setupUI(); 

    document.getElementById('loading').style.opacity = 0;
    setTimeout(() => document.getElementById('loading').remove(), 500);
}

// --- Core ---

function createFieldTexture(type) {
    const canvas = document.createElement('canvas');
    const isHalf = type === 'half';
    canvas.width = isHalf ? 512 : 1024;
    canvas.height = 664; 
    const ctx = canvas.getContext('2d');
    
    const w = canvas.width;
    const h = canvas.height;
    const lw = 5; 

    // Background
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, 0, w, h);

    // Pattern
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    const stripeCount = isHalf ? 6 : 12;
    const stripeW = w / stripeCount;
    for(let i=0; i<stripeCount; i+=2) {
        ctx.fillRect(i * stripeW, 0, stripeW, h);
    }

    // Lines
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = lw;
    ctx.lineCap = 'square';

    // Border
    ctx.strokeRect(lw/2, lw/2, w-lw, h-lw);

    if (!isHalf) {
        ctx.beginPath();
        ctx.moveTo(w/2, 0);
        ctx.lineTo(w/2, h);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(w/2, h/2, h * 0.15, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(w/2, h/2, lw, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.arc(w, h/2, h * 0.15, 0.5 * Math.PI, 1.5 * Math.PI);
        ctx.stroke();
    }

    // Penalty Areas
    const penaltyH = h * 0.6;
    const penaltyW = isHalf ? w * 0.32 : w * 0.16; 
    const penaltyY = (h - penaltyH) / 2;
    ctx.strokeRect(0, penaltyY, penaltyW, penaltyH);
    
    if (!isHalf) {
        ctx.strokeRect(w - penaltyW, penaltyY, penaltyW, penaltyH);
    }

    // Penalty Arcs & Spots
    const realWidth = isHalf ? 52.5 : 105;
    const scaleX = w / realWidth; 
    
    const penaltySpotDist = 11 * scaleX;
    const penaltyRadius = 9.15 * scaleX;
    const penaltyBoxWidth = penaltyW; 
    
    const arcAngle = Math.acos((penaltyBoxWidth - penaltySpotDist) / penaltyRadius);

    ctx.beginPath();
    ctx.arc(penaltySpotDist, h / 2, penaltyRadius, -arcAngle, arcAngle);
    ctx.stroke();

    if (!isHalf) {
        ctx.beginPath();
        ctx.arc(w - penaltySpotDist, h / 2, penaltyRadius, Math.PI - arcAngle, Math.PI + arcAngle);
        ctx.stroke();
    }

    const spotSize = lw * 1.5;
    ctx.beginPath();
    ctx.arc(penaltySpotDist, h / 2, spotSize, 0, Math.PI * 2);
    ctx.fill();

    if (!isHalf) {
        ctx.beginPath();
        ctx.arc(w - penaltySpotDist, h / 2, spotSize, 0, Math.PI * 2);
        ctx.fill();
    }

    // Goal Areas
    const goalH = h * 0.25;
    const goalW = isHalf ? w * 0.1 : w * 0.05; 
    const goalY = (h - goalH) / 2;
    ctx.strokeRect(0, goalY, goalW, goalH);
    
    if (!isHalf) {
        ctx.strokeRect(w - goalW, goalY, goalW, goalH);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 16;
    return texture;
}

function createField(type) {
    if (fieldPlane) scene.remove(fieldPlane);
    
    const isHalf = type === 'half';
    const width = isHalf ? FIELD_WIDTH / 2 : FIELD_WIDTH;
    const height = FIELD_HEIGHT;
    
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshStandardMaterial({ 
        map: createFieldTexture(type),
        roughness: 0.8,
        metalness: 0.1
    });
    
    fieldPlane = new THREE.Mesh(geometry, material);
    fieldPlane.rotation.x = -Math.PI / 2;
    fieldPlane.receiveShadow = true;
    fieldPlane.name = 'field';
    
    if (isHalf) {
        fieldPlane.position.set(-FIELD_WIDTH/4, 0, 0);
    } else {
        fieldPlane.position.set(0, 0, 0);
    }
    
    scene.add(fieldPlane);
}

// --- Goal Posts ---
function createGoals() {
    while(goalsGroup.children.length > 0){ 
        goalsGroup.remove(goalsGroup.children[0]); 
    }

    const goalWidth = 7.32;
    const goalHeight = 2.44;
    const goalDepth = 2.0; 
    const postRadius = 0.1;
    const material = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.5 });

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255, 255, 255, 0)'; 
    ctx.fillRect(0,0,64,64);
    ctx.strokeStyle = 'rgba(220, 220, 220, 0.6)'; 
    ctx.lineWidth = 3;
    ctx.strokeRect(0,0,64,64); 
    
    const netTexture = new THREE.CanvasTexture(canvas);
    netTexture.wrapS = THREE.RepeatWrapping;
    netTexture.wrapT = THREE.RepeatWrapping;
    
    const netMaterial = new THREE.MeshBasicMaterial({ 
        map: netTexture, 
        side: THREE.DoubleSide, 
        transparent: true,
        depthWrite: false 
    });

    function buildGoal(isLeft) {
        const goal = new THREE.Group();
        
        const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 16);
        const post1 = new THREE.Mesh(postGeo, material);
        post1.position.set(0, goalHeight / 2, -goalWidth / 2);
        const post2 = new THREE.Mesh(postGeo, material);
        post2.position.set(0, goalHeight / 2, goalWidth / 2);
        
        const barGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalWidth + postRadius * 2, 16);
        const bar = new THREE.Mesh(barGeo, material);
        bar.rotation.x = Math.PI / 2;
        bar.position.set(0, goalHeight, 0);

        const topSupportGeo = new THREE.CylinderGeometry(postRadius * 0.5, postRadius * 0.5, goalDepth, 8);
        const topSupport1 = new THREE.Mesh(topSupportGeo, material);
        topSupport1.rotation.z = Math.PI / 2;
        topSupport1.position.set(-goalDepth/2, goalHeight, -goalWidth/2);
        
        const topSupport2 = topSupport1.clone();
        topSupport2.position.set(-goalDepth/2, goalHeight, goalWidth/2);

        const backTopBarGeo = new THREE.CylinderGeometry(postRadius * 0.5, postRadius * 0.5, goalWidth, 8);
        const backTopBar = new THREE.Mesh(backTopBarGeo, material);
        backTopBar.rotation.x = Math.PI / 2;
        backTopBar.position.set(-goalDepth, goalHeight, 0);

        const bottomGeo = new THREE.CylinderGeometry(postRadius * 0.5, postRadius * 0.5, goalDepth, 8);
        const bottom1 = new THREE.Mesh(bottomGeo, material);
        bottom1.rotation.z = Math.PI / 2;
        bottom1.position.set(-goalDepth/2, 0, -goalWidth/2);
        
        const bottom2 = bottom1.clone();
        bottom2.position.set(-goalDepth/2, 0, goalWidth/2);

        const backBarGeo = new THREE.CylinderGeometry(postRadius * 0.5, postRadius * 0.5, goalWidth, 8);
        const backBar = new THREE.Mesh(backBarGeo, material);
        backBar.rotation.x = Math.PI / 2;
        backBar.position.set(-goalDepth, 0, 0);

        const backNetGeo = new THREE.PlaneGeometry(goalWidth, goalHeight);
        const backNet = new THREE.Mesh(backNetGeo, netMaterial.clone());
        backNet.material.map = netTexture.clone();
        backNet.material.map.repeat.set(goalWidth * 4, goalHeight * 4);
        backNet.material.map.needsUpdate = true;
        backNet.position.set(-goalDepth, goalHeight/2, 0);
        backNet.rotation.y = -Math.PI / 2;

        const topNetGeo = new THREE.PlaneGeometry(goalDepth, goalWidth);
        const topNet = new THREE.Mesh(topNetGeo, netMaterial.clone());
        topNet.material.map = netTexture.clone();
        topNet.material.map.repeat.set(goalDepth * 4, goalWidth * 4);
        topNet.material.map.needsUpdate = true;
        topNet.position.set(-goalDepth/2, goalHeight, 0);
        topNet.rotation.x = -Math.PI / 2;

        const sideNetGeo = new THREE.PlaneGeometry(goalDepth, goalHeight);
        const leftNet = new THREE.Mesh(sideNetGeo, netMaterial.clone());
        leftNet.material.map = netTexture.clone();
        leftNet.material.map.repeat.set(goalDepth * 4, goalHeight * 4);
        leftNet.material.map.needsUpdate = true;
        leftNet.position.set(-goalDepth/2, goalHeight/2, -goalWidth/2);
        
        const rightNet = leftNet.clone();
        rightNet.material = leftNet.material.clone(); 
        rightNet.position.set(-goalDepth/2, goalHeight/2, goalWidth/2);

        goal.add(post1, post2, bar, topSupport1, topSupport2, backTopBar, bottom1, bottom2, backBar);
        goal.add(backNet, topNet, leftNet, rightNet);
        
        const xPos = isLeft ? -FIELD_WIDTH / 2 : FIELD_WIDTH / 2;
        goal.position.set(xPos, 0, 0);
        
        if (!isLeft) {
            goal.rotation.y = Math.PI;
        }

        return goal;
    }

    goalsGroup.add(buildGoal(true));
    
    if (currentViewMode === 'full') {
        goalsGroup.add(buildGoal(false));
    }
}

// --- Ball Texture Generation ---
function createBallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 512, 256);
    
    // Draw simple black patches (Pentagon-ish circles)
    ctx.fillStyle = '#000000';
    const patches = [
        {x: 128, y: 128}, {x: 384, y: 128}, // Equator
        {x: 64, y: 64}, {x: 192, y: 64}, {x: 320, y: 64}, {x: 448, y: 64},
        {x: 64, y: 192}, {x: 192, y: 192}, {x: 320, y: 192}, {x: 448, y: 192}
    ];
    
    patches.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 35, 0, Math.PI * 2);
        ctx.fill();
    });

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function createBall(x = 0, z = 0) {
    if(ball) scene.remove(ball);

    const geometry = new THREE.SphereGeometry(1.2, 32, 32); 
    const material = new THREE.MeshStandardMaterial({ 
        map: createBallTexture(),
        roughness: 0.4,
        metalness: 0.1
    });
    ball = new THREE.Mesh(geometry, material);
    ball.position.set(x, 1.2, z);
    ball.castShadow = true;
    ball.userData = { type: 'ball', draggable: true };
    scene.add(ball);
    
    // Note: Removed label for "Real Ball" look as requested
}

function createPlayer(team, id, number, x, z, name = null) {
    const color = team === 'teamA' 
        ? document.getElementById('team-a-color').value 
        : document.getElementById('team-b-color').value;

    if (!name) {
        name = translations[currentLang]['player-name-default'];
    }

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    
    if (team === 'teamA') {
        group.rotation.y = Math.PI / 2;
    } else {
        group.rotation.y = -Math.PI / 2;
    }

    group.userData = { type: 'player', team: team, id: id, draggable: true };

    const kitMat = new THREE.MeshStandardMaterial({ color: color });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x333333 }); 
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    const baseGeo = new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, 0.2, 32);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.1;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const legGeo = new THREE.CylinderGeometry(0.35, 0.3, 1.4, 16);
    const leftLeg = new THREE.Mesh(legGeo, kitMat);
    leftLeg.position.set(-0.45, 0.9, 0); 
    leftLeg.castShadow = true;
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, kitMat);
    rightLeg.position.set(0.45, 0.9, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    const torsoGeo = new THREE.CylinderGeometry(0.8, 0.7, 1.6, 32);
    const torso = new THREE.Mesh(torsoGeo, kitMat);
    torso.position.set(0, 2.4, 0); 
    torso.castShadow = true;
    group.add(torso);

    const armGeo = new THREE.CylinderGeometry(0.25, 0.2, 1.3, 16);
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-1.0, 2.6, 0); 
    leftArm.rotation.z = 0.2; 
    leftArm.castShadow = true;
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.set(1.0, 2.6, 0);
    rightArm.rotation.z = -0.2;
    rightArm.castShadow = true;
    group.add(rightArm);

    const sleeveGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const leftSleeve = new THREE.Mesh(sleeveGeo, kitMat);
    leftSleeve.position.set(-0.9, 3.0, 0);
    group.add(leftSleeve);
    const rightSleeve = new THREE.Mesh(sleeveGeo, kitMat);
    rightSleeve.position.set(0.9, 3.0, 0);
    group.add(rightSleeve);

    const headGeo = new THREE.SphereGeometry(0.65, 32, 32);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 3.7, 0); 
    head.castShadow = true;
    group.add(head);

    const hairSimpleGeo = new THREE.SphereGeometry(0.7, 32, 32);
    const hairMesh = new THREE.Mesh(hairSimpleGeo, hairMat);
    hairMesh.position.set(0, 3.85, -0.25); 
    hairMesh.scale.set(0.95, 0.9, 0.85); 
    hairMesh.castShadow = true;
    group.add(hairMesh);

    const eyeGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.2, 3.8, 0.58); 
    group.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.2, 3.8, 0.58);
    group.add(rightEye);

    group.userData.kitMeshes = [leftLeg, rightLeg, torso, leftSleeve, rightSleeve];

    const div = document.createElement('div');
    div.className = 'player-label';
    const numSpan = document.createElement('span');
    numSpan.className = 'label-number';
    numSpan.textContent = number;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'label-name';
    nameSpan.textContent = name;
    nameSpan.contentEditable = true; 

    const disableControls = () => { controls.enabled = false; };
    const enableControls = () => { controls.enabled = true; };
    
    nameSpan.addEventListener('focus', disableControls);
    nameSpan.addEventListener('blur', () => {
        enableControls();
        saveData(); 
    });
    nameSpan.addEventListener('pointerdown', (e) => e.stopPropagation()); 
    nameSpan.addEventListener('touchstart', (e) => e.stopPropagation(), {passive: false});

    numSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        const newNum = prompt("輸入號碼", numSpan.textContent);
        if(newNum) {
            numSpan.textContent = newNum;
            saveData(); 
        }
    });
    numSpan.addEventListener('touchstart', (e) => {
        e.stopPropagation(); 
    }, {passive: false});

    div.appendChild(numSpan);
    div.appendChild(nameSpan);

    const label = new CSS2DObject(div);
    label.position.set(0, 8.5, 0); 
    group.add(label);

    return group;
}

function updateFormation(team) {
    const group = playersGroup;
    const formKey = document.getElementById(team === 'teamA' ? 'team-a-formation' : 'team-b-formation').value;
    const data = formations[formKey][team];
    
    const isHalfView = currentViewMode === 'half';
    const showOpponent = document.getElementById('show-opponent').checked;

    const toRemove = [];
    group.children.forEach(child => {
        if (child.userData.team === team) toRemove.push(child);
    });
    
    toRemove.forEach(child => {
        while(child.children.length > 0){
            child.remove(child.children[0]);
        }
        group.remove(child);
    });

    if (team === 'teamB' && !showOpponent) {
        return;
    }

    data.forEach(p => {
        let x = p.x;
        let z = p.z;
        
        if (isHalfView) {
            // Half Court Logic:
            // Field range: -52.5 to 0. Center is -26.25.
            
            if (team === 'teamA') {
                // Map Team A (-50 to 0) to Left sub-half (-50 to -30 approx)
                // Compress: x = -50 + (x + 50) * 0.4;
                x = -50 + (x + 50) * 0.4; 
            } else {
                // Map Team B (50 to 0) to Right sub-half (-2 to -22 approx)
                // Compress & Shift: x = -2 - (50 - x) * 0.4;
                x = -2 - (50 - x) * 0.4;
            }
        }
        
        group.add(createPlayer(team, `${team}-${p.n}`, p.n, x, z));
    });
}

// ... (Interaction, Drawing, History, Animation, Storage, UI, Loop functions remain same)
// Re-paste them to ensure full file integrity if needed, but for brevity here I ensure the above functions are the ones modified.
// For the final file output, I will include the full file content.

// --- Interaction ---

function onPointerDown(event) {
    if (event.isPrimary === false) return;

    const rect = labelRenderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    if (currentTool === 'move' || currentTool === 'rotate') {
        const objects = [...playersGroup.children, ball];
        const intersects = raycaster.intersectObjects(objects, true);

        if (intersects.length > 0) {
            let target = intersects[0].object;
            while (target.parent && !target.userData.draggable && target.parent !== scene && target.parent !== playersGroup) {
                target = target.parent;
            }

            if (target.userData.draggable) {
                isDragging = true;
                draggedObject = target;
                controls.enabled = false; 
                return; 
            }
        }
    } 
    
    if (currentTool === 'draw') {
        const intersects = raycaster.intersectObject(fieldPlane);
        if (intersects.length > 0) {
            isDrawing = true;
            isDragging = true; 
            controls.enabled = false; 
            startDrawing(intersects[0].point);
            return;
        }
    }
}

function onPointerMove(event) {
    if (!isDragging) return;

    const rect = labelRenderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    if (draggedObject && currentTool === 'rotate') {
        const intersects = raycaster.intersectObject(fieldPlane);
        if (intersects.length > 0) {
            const point = intersects[0].point;
            draggedObject.lookAt(point.x, draggedObject.position.y, point.z);
        }
        return;
    }

    if (draggedObject && currentTool === 'move') {
        const intersects = raycaster.intersectObject(dragPlane);
        if (intersects.length > 0) {
            const point = intersects[0].point;
            const x = Math.max(-FIELD_WIDTH/2, Math.min(FIELD_WIDTH/2, point.x));
            const z = Math.max(-FIELD_HEIGHT/2, Math.min(FIELD_HEIGHT/2, point.z));
            draggedObject.position.set(x, draggedObject.position.y, z);
        }
    } else if (isDrawing && currentTool === 'draw') {
        const intersects = raycaster.intersectObject(fieldPlane);
        if (intersects.length > 0) {
            continueDrawing(intersects[0].point);
        }
    }
}

function onPointerUp() {
    if (isDragging || isDrawing) {
        if (isDragging) pushHistory(); 
        if (isDrawing) {
            endDrawing();
            pushHistory(); 
        }

        saveData(); 
        isDragging = false;
        draggedObject = null;
        controls.enabled = true; 
    }
}

function startDrawing(point) {
    drawingPoints = [point];
    const geometry = new THREE.BufferGeometry().setFromPoints(drawingPoints);
    const color = document.getElementById('draw-color-input').value;
    
    let material;
    if (lineType === 'dashed') {
        material = new THREE.LineDashedMaterial({
            color: color,
            linewidth: 2, 
            scale: 1,
            dashSize: 2,
            gapSize: 1,
        });
    } else {
        material = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
    }

    point.y = 0.15;
    
    currentLine = new THREE.Line(geometry, material);
    currentLine.userData = { type: lineType, originalPoints: [point.clone()], color: color };
    linesGroup.add(currentLine);
}

function continueDrawing(point) {
    if (!currentLine) return;
    point.y = 0.15;
    
    const lastPoint = drawingPoints[drawingPoints.length-1];
    if (lastPoint.distanceTo(point) < 0.5) return;

    drawingPoints.push(point);
    currentLine.geometry.setFromPoints(drawingPoints);
    if (lineType === 'dashed') currentLine.computeLineDistances();
    currentLine.userData.originalPoints.push(point.clone());
}

function endDrawing() {
    if (!currentLine) return;
    
    if (lineType === 'wavy') {
        const points = currentLine.userData.originalPoints;
        if (points.length > 1) {
            const curve = new THREE.CatmullRomCurve3(points);
            const curvedPoints = curve.getPoints(points.length * 4);
            
            const wavyPoints = [];
            const axis = new THREE.Vector3(0, 1, 0); 
            for(let i=0; i<curvedPoints.length; i++) {
                const p = curvedPoints[i];
                const tangent = (i < curvedPoints.length - 1) 
                    ? curvedPoints[i+1].clone().sub(p).normalize()
                    : p.clone().sub(curvedPoints[i-1]).normalize();
                
                const normal = new THREE.Vector3().crossVectors(tangent, axis).normalize();
                const offset = Math.sin(i * 0.8) * 1.2; 
                wavyPoints.push(p.clone().add(normal.multiplyScalar(offset)));
            }
            
            currentLine.geometry.dispose();
            currentLine.geometry = new THREE.BufferGeometry().setFromPoints(wavyPoints);
        }
    } else {
            const points = drawingPoints;
            if(points.length > 1) {
                const end = points[points.length - 1];
                const start = points[points.length - 2];
                const dir = new THREE.Vector3().subVectors(end, start).normalize();
                
                const coneGeo = new THREE.ConeGeometry(0.6, 2, 12);
                const coneMat = new THREE.MeshBasicMaterial({ color: currentLine.material.color });
                const cone = new THREE.Mesh(coneGeo, coneMat);
                
                cone.position.copy(end);
                const target = end.clone().add(dir);
                cone.lookAt(target);
                cone.rotateX(Math.PI / 2); 
                cone.position.y = 0.15;
                
                linesGroup.add(cone);
                currentLine.userData.arrow = cone;
            }
    }
    
    isDrawing = false;
    currentLine = null;
    drawingPoints = [];
}

function getSnapshot() {
    const data = {
        players: [],
        lines: [],
        ball: { x: ball.position.x, z: ball.position.z }
    };

    playersGroup.children.forEach(group => {
        data.players.push({
            id: group.userData.id,
            x: group.position.x,
            z: group.position.z,
            rotY: group.rotation.y
        });
    });

    linesGroup.children.forEach(obj => {
        if (obj.userData.type) {
                data.lines.push({
                    type: obj.userData.type,
                    points: obj.userData.originalPoints.map(v => ({x: v.x, y: v.y, z: v.z})),
                    color: obj.userData.color
                });
        }
    });
    return JSON.stringify(data);
}

function pushHistory() {
    if (historyStep < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyStep + 1);
    }
    historyStack.push(getSnapshot());
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    else historyStep++;
    
    updateHistoryButtons();
}

function restoreSnapshot(json) {
    const data = JSON.parse(json);
    
    ball.position.set(data.ball.x, 1.2, data.ball.z);

    data.players.forEach(pData => {
        const player = playersGroup.children.find(p => p.userData.id === pData.id);
        if(player) {
            player.position.set(pData.x, 0, pData.z);
            player.rotation.y = pData.rotY || 0;
        }
    });

    while(linesGroup.children.length > 0){ 
        const obj = linesGroup.children[0];
        if(obj.userData.arrow) linesGroup.remove(obj.userData.arrow);
        linesGroup.remove(obj); 
    }

    data.lines.forEach(l => {
        lineType = l.type;
        const points = l.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
        let material;
        if (lineType === 'dashed') {
            material = new THREE.LineDashedMaterial({ color: l.color, linewidth: 2, scale: 1, dashSize: 2, gapSize: 1 });
        } else {
            material = new THREE.LineBasicMaterial({ color: l.color, linewidth: 2 });
        }
        drawingPoints = points;
        currentLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
        currentLine.userData = { type: lineType, originalPoints: points, color: l.color };
        linesGroup.add(currentLine);
        endDrawing(); 
    });
    
    drawingPoints = [];
    currentLine = null;
    saveData(); 
}

function updateHistoryButtons() {
    document.getElementById('undo-btn').disabled = historyStep <= 0;
    document.getElementById('redo-btn').disabled = historyStep >= historyStack.length - 1;
}

function setAnimStart() {
    const positions = {};
    playersGroup.children.forEach(p => {
        positions[p.userData.id] = { x: p.position.x, z: p.position.z, rot: p.rotation.y };
    });
    positions['ball'] = { x: ball.position.x, z: ball.position.z };
    animStartPositions = positions;
    
    document.getElementById('anim-set-start').classList.add('text-green-500');
    document.getElementById('anim-play').disabled = false;
    
    alert(translations[currentLang]['set-start-alert']);
}

function playAnim() {
    if (isAnimating || !animStartPositions) return;
    isAnimating = true;

    const endPositions = {};
    playersGroup.children.forEach(p => {
        endPositions[p.userData.id] = { x: p.position.x, z: p.position.z, rot: p.rotation.y };
    });
    endPositions['ball'] = { x: ball.position.x, z: ball.position.z };

    playersGroup.children.forEach(p => {
        const start = animStartPositions[p.userData.id];
        if(start) {
            p.position.set(start.x, 0, start.z);
            p.rotation.y = start.rot;
            
            const target = endPositions[p.userData.id];
            if(target) {
                new TWEEN.Tween(p.position)
                    .to({ x: target.x, z: target.z }, 2000)
                    .easing(TWEEN.Easing.Quadratic.InOut)
                    .start();
                
                new TWEEN.Tween(p.rotation)
                    .to({ y: target.rot }, 2000)
                    .start();
            }
        }
    });

    const bStart = animStartPositions['ball'];
    const bEnd = endPositions['ball'];
    if(bStart && bEnd) {
        ball.position.set(bStart.x, 1.2, bStart.z);
        new TWEEN.Tween(ball.position)
            .to({ x: bEnd.x, z: bEnd.z }, 2000)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .start();
    }

    setTimeout(() => {
        isAnimating = false;
    }, 2100);
}

function saveData() {
    const data = {
        teamAColor: document.getElementById('team-a-color').value,
        teamBColor: document.getElementById('team-b-color').value,
        teamAFormation: document.getElementById('team-a-formation').value,
        teamBFormation: document.getElementById('team-b-formation').value,
        showOpponent: document.getElementById('show-opponent').checked,
        viewMode: currentViewMode,
        isDarkMode: document.body.classList.contains('dark-mode'),
        language: currentLang, 
        ball: { x: ball.position.x, z: ball.position.z },
        players: [],
        lines: []
    };

    playersGroup.children.forEach(group => {
        const labelObj = group.children.find(c => c.isCSS2DObject);
        const number = labelObj ? labelObj.element.querySelector('.label-number').textContent : '';
        const name = labelObj ? labelObj.element.querySelector('.label-name').textContent : '';

        data.players.push({
            team: group.userData.team,
            id: group.userData.id,
            x: group.position.x,
            z: group.position.z,
            rotY: group.rotation.y, 
            number: number,
            name: name
        });
    });

    linesGroup.children.forEach(obj => {
        if (obj.userData.type) {
                data.lines.push({
                    type: obj.userData.type,
                    points: obj.userData.originalPoints.map(v => ({x: v.x, y: v.y, z: v.z})),
                    color: obj.userData.color
                });
        }
    });

    localStorage.setItem('soccerBoardState', JSON.stringify(data));
}

function loadData() {
    const json = localStorage.getItem('soccerBoardState');
    if (!json) {
        createBall();
        updateFormation('teamA');
        updateFormation('teamB');
        updateLanguage('zh-TW'); 
        pushHistory(); 
        return;
    }

    const data = JSON.parse(json);

    document.getElementById('team-a-color').value = data.teamAColor;
    document.getElementById('team-b-color').value = data.teamBColor;
    
    document.getElementById('team-a-formation').value = data.teamAFormation;
    const gridA = document.getElementById('team-a-formation-grid');
    if(gridA) {
        gridA.querySelectorAll('.formation-card').forEach(c => c.classList.remove('active'));
        const cardA = gridA.querySelector(`[data-value="${data.teamAFormation}"]`);
        if(cardA) cardA.classList.add('active');
    }

    document.getElementById('team-b-formation').value = data.teamBFormation;
    const gridB = document.getElementById('team-b-formation-grid');
    if(gridB) {
        gridB.querySelectorAll('.formation-card').forEach(c => c.classList.remove('active'));
        const cardB = gridB.querySelector(`[data-value="${data.teamBFormation}"]`);
        if(cardB) cardB.classList.add('active');
    }

    document.getElementById('show-opponent').checked = data.showOpponent;
    
    currentViewMode = data.viewMode || 'full';
    const viewControl = document.getElementById('view-mode-control');
    viewControl.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    viewControl.querySelector(`[data-value="${currentViewMode}"]`).classList.add('active');

    if (data.isDarkMode) {
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode').checked = true;
    }

    const savedLang = data.language || 'zh-TW';
    document.getElementById('language-select').value = savedLang;
    updateLanguage(savedLang);

    document.getElementById('team-a-dot').style.backgroundColor = data.teamAColor;
    document.getElementById('team-b-dot').style.backgroundColor = data.teamBColor;

    createBall(data.ball.x, data.ball.z);

    while(playersGroup.children.length > 0){ 
        const p = playersGroup.children[0];
        while(p.children.length > 0) p.remove(p.children[0]);
        playersGroup.remove(p);
    }

    data.players.forEach(p => {
        if (p.team === 'teamB' && !data.showOpponent) return;
        const player = createPlayer(p.team, p.id, p.number, p.x, p.z, p.name);
        player.rotation.y = p.rotY || 0; 
        playersGroup.add(player);
    });
    
    createField(currentViewMode);
    createGoals();
    handleViewChange(currentViewMode, false); 

    while(linesGroup.children.length > 0){ 
        const obj = linesGroup.children[0];
        if(obj.userData.arrow) linesGroup.remove(obj.userData.arrow);
        linesGroup.remove(obj); 
    }

    data.lines.forEach(l => {
        lineType = l.type;
        const points = l.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
        
        let material;
        if (lineType === 'dashed') {
            material = new THREE.LineDashedMaterial({
                color: l.color,
                linewidth: 2,
                scale: 1,
                dashSize: 2,
                gapSize: 1,
            });
        } else {
            material = new THREE.LineBasicMaterial({ color: l.color, linewidth: 2 });
        }
        
        drawingPoints = points;
        currentLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
        currentLine.userData = { type: lineType, originalPoints: points, color: l.color };
        linesGroup.add(currentLine);

        endDrawing(); 
    });
    
    drawingPoints = [];
    currentLine = null;
    
    pushHistory(); 
}

function handleViewChange(mode, refresh = true) {
    currentViewMode = mode;
    
    createField(mode);
    createGoals();

    if (mode === 'half') {
            controls.minDistance = 5;
            camera.position.set(-26.25, 50, 20); 
            controls.target.set(-26.25, 0, 0);
    } else {
            controls.minDistance = 20;
            camera.position.set(0, 60, 60);
            controls.target.set(0, 0, 0);
    }
    controls.update();
    
    if (refresh) {
        updateFormation('teamA');
        updateFormation('teamB');
        saveData();
        pushHistory();
    }
}

function setupUI() {
    const sidebar = document.getElementById('sidebar');
    const settingsToggle = document.getElementById('settings-toggle');
    const closeSidebarBtn = document.getElementById('close-sidebar');

    function toggleSidebar(show) {
        if (show) sidebar.classList.remove('collapsed');
        else sidebar.classList.add('collapsed');
    }

    settingsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar(true);
    });

    closeSidebarBtn.addEventListener('click', () => toggleSidebar(false));

    document.addEventListener('pointerdown', (e) => {
        if (!sidebar.classList.contains('collapsed') && 
            !sidebar.contains(e.target) && 
            !settingsToggle.contains(e.target)) {
            toggleSidebar(false);
        }
    });

    window.toggleAccordion = (id) => {
        const content = document.getElementById(id);
        const allContents = document.querySelectorAll('.accordion-content');
        allContents.forEach(el => {
            if (el.id !== id) el.classList.remove('open');
        });
        content.classList.toggle('open');
    };

    function setupFormationGrid(team) {
        const grid = document.getElementById(`${team}-formation-grid`);
        const select = document.getElementById(`${team}-formation`);
        
        grid.addEventListener('click', (e) => {
            if (e.target.classList.contains('formation-card')) {
                grid.querySelectorAll('.formation-card').forEach(c => c.classList.remove('active'));
                e.target.classList.add('active');
                select.value = e.target.dataset.value;
                select.dispatchEvent(new Event('change')); 
            }
        });
    }
    setupFormationGrid('team-a');
    setupFormationGrid('team-b');

    const viewControl = document.getElementById('view-mode-control');
    viewControl.addEventListener('click', (e) => {
        if (e.target.classList.contains('segment-btn')) {
            viewControl.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const val = e.target.dataset.value;
            handleViewChange(val);
        }
    });

    const langSelect = document.getElementById('language-select');
    langSelect.addEventListener('change', (e) => {
        updateLanguage(e.target.value);
        saveData();
    });

    const toolBtns = document.querySelectorAll('#bottom-toolbar .icon-btn[data-tool]');
    const drawOptionsPanel = document.getElementById('draw-options-panel');
    const lineTypeBtns = document.querySelectorAll('[data-tool-type]');
    
    toolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            toolBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tool = btn.dataset.tool;
            currentTool = tool; 
            if (tool === 'draw') {
                drawOptionsPanel.classList.add('visible');
            } else {
                drawOptionsPanel.classList.remove('visible');
            }
        });
    });

    lineTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            lineTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            lineType = btn.dataset.toolType; 
        });
    });
    document.querySelector('[data-tool-type="solid"]').classList.add('active');

    const colorSwatches = document.querySelectorAll('.color-swatch');
    const drawColorInput = document.getElementById('draw-color-input');
    const customColorTrigger = document.getElementById('custom-color-trigger');

    function setActiveColor(color) {
        colorSwatches.forEach(s => s.classList.remove('active'));
        const preset = Array.from(colorSwatches).find(s => s.dataset.color === color);
        if (preset) preset.classList.add('active');
        drawColorInput.value = color; 
    }

    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            setActiveColor(swatch.dataset.color);
        });
    });

    customColorTrigger.addEventListener('click', () => drawColorInput.click());
    drawColorInput.addEventListener('input', (e) => {
        colorSwatches.forEach(s => s.classList.remove('active'));
    });

    const updateColors = () => {
        const colorA = document.getElementById('team-a-color').value;
        const colorB = document.getElementById('team-b-color').value;
        document.getElementById('team-a-dot').style.backgroundColor = colorA;
        document.getElementById('team-b-dot').style.backgroundColor = colorB;

        playersGroup.children.forEach(group => {
            const color = group.userData.team === 'teamA' ? colorA : colorB;
            if(group.userData.kitMeshes) {
                group.userData.kitMeshes.forEach(mesh => {
                    mesh.material.color.set(color);
                });
            }
        });
        saveData(); 
    };
    document.getElementById('team-a-color').addEventListener('input', updateColors);
    document.getElementById('team-b-color').addEventListener('input', updateColors);

    const refreshFormation = () => {
        updateFormation('teamA');
        updateFormation('teamB');
        saveData(); 
        pushHistory();
    };
    document.getElementById('team-a-formation').addEventListener('change', refreshFormation);
    document.getElementById('team-b-formation').addEventListener('change', refreshFormation);

    document.getElementById('show-opponent').addEventListener('change', (e) => {
        refreshFormation(); 
        saveData(); 
    });

    document.getElementById('dark-mode').addEventListener('change', (e) => {
        document.body.classList.toggle('dark-mode', e.target.checked);
        saveData(); 
    });

    document.getElementById('reset-pos-btn').addEventListener('click', () => {
        if(confirm(translations[currentLang]['confirm-reset'])) {
            ball.position.set(0, 1.2, 0);
            updateFormation('teamA');
            updateFormation('teamB');
            saveData();
            pushHistory();
        }
    });

    document.getElementById('export-pdf-btn').addEventListener('click', () => {
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
        const element = document.getElementById('canvas-container');
        const toggleBtn = document.getElementById('settings-toggle');
        const bottomToolbar = document.getElementById('bottom-toolbar');
        controls.enabled = false;
        toggleBtn.style.display = 'none';
        bottomToolbar.style.display = 'none'; 
        html2canvas(element, {
            backgroundColor: document.body.classList.contains('dark-mode') ? '#111827' : '#f3f4f6',
            useCORS: true,
            logging: false
        }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('l', 'px', [canvas.width, canvas.height]);
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save('3d-soccer-tactic.pdf');
            controls.enabled = true;
            toggleBtn.style.display = 'flex';
            bottomToolbar.style.display = 'flex';
        });
    });
    
    document.getElementById('clear-lines-btn').addEventListener('click', () => {
        while(linesGroup.children.length > 0){ 
            const obj = linesGroup.children[0];
            if(obj.userData.arrow) linesGroup.remove(obj.userData.arrow);
            obj.geometry.dispose();
            linesGroup.remove(obj); 
        }
        saveData(); 
        pushHistory();
    });

    document.getElementById('undo-btn').addEventListener('click', () => {
        if(historyStep > 0) {
            historyStep--;
            restoreSnapshot(historyStack[historyStep]);
            updateHistoryButtons();
        }
    });

    document.getElementById('redo-btn').addEventListener('click', () => {
        if(historyStep < historyStack.length - 1) {
            historyStep++;
            restoreSnapshot(historyStack[historyStep]);
            updateHistoryButtons();
        }
    });

    document.getElementById('anim-set-start').addEventListener('click', setAnimStart);
    document.getElementById('anim-play').addEventListener('click', playAnim);
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    if (container && camera && renderer && labelRenderer) {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
        labelRenderer.setSize(container.clientWidth, container.clientHeight);
    }
}

function animate() {
    requestAnimationFrame(animate);
    TWEEN.update(); 
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
    if (labelRenderer && scene && camera) labelRenderer.render(scene, camera);
}
