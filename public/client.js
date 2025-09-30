// ----------------- INITIALIZATION -----------------
const socket = io();

let scene, camera, renderer;
let localPlayer = { x:0, y:20, z:0, hp:100, inventory:[], equipped:{}, username:"" };
let playersMeshes = {};
let zombiesMeshes = {};
let bullets = [];
let muzzleFlashes = [];
let damageNumbers = [];
let clock = new THREE.Clock();
let keys = {};
let recoilAmount = 0;
let recoilRecovery = 0.05;
let timeOfDay = 0;
let daySpeed = 0.001;

// ----------------- MILITARY COMPOUNDS -----------------
let compounds = []; // store all compound objects for collision

function createMilitaryCompound(centerX, centerZ) {
    const compound = new THREE.Group();

    const wallMat = new THREE.MeshLambertMaterial({color:0x555555});
    const barrackMat = new THREE.MeshLambertMaterial({color:0x888888});
    const towerMat = new THREE.MeshLambertMaterial({color:0x333333});

    // Walls
    const wallThickness = 2, wallHeight = 8, compoundSize = 50;
    const gateWidth = 10;

    const wallFront = new THREE.Mesh(new THREE.BoxGeometry(compoundSize - gateWidth, wallHeight, wallThickness), wallMat);
    wallFront.position.set(centerX + gateWidth/4, wallHeight/2, centerZ - compoundSize/2);
    compound.add(wallFront);

    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(compoundSize, wallHeight, wallThickness), wallMat);
    wallBack.position.set(centerX, wallHeight/2, centerZ + compoundSize/2);
    compound.add(wallBack);

    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, compoundSize), wallMat);
    wallLeft.position.set(centerX - compoundSize/2, wallHeight/2, centerZ);
    compound.add(wallLeft);

    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, compoundSize), wallMat);
    wallRight.position.set(centerX + compoundSize/2, wallHeight/2, centerZ);
    compound.add(wallRight);

    // L-shaped barracks
    const barrackWidth = 8, barrackLength = 16, barrackHeight = 6;
    const barrackPositions = [
        [-compoundSize/4, 0, -compoundSize/4],
        [compoundSize/4, 0, -compoundSize/4],
        [-compoundSize/4, 0, compoundSize/4],
        [compoundSize/4, 0, compoundSize/4]
    ];

    barrackPositions.forEach(pos => {
        const barrack = new THREE.Group();
        const part1 = new THREE.Mesh(new THREE.BoxGeometry(barrackLength, barrackHeight, barrackWidth), barrackMat);
        part1.position.set(barrackLength/2 - barrackLength/2, barrackHeight/2, barrackWidth/2 - barrackWidth/2);
        barrack.add(part1);
        const part2 = new THREE.Mesh(new THREE.BoxGeometry(barrackWidth, barrackHeight, barrackLength), barrackMat);
        part2.position.set(barrackLength/2 - barrackLength/2, barrackHeight/2, barrackLength/2 - barrackLength/2);
        barrack.add(part2);
        barrack.position.set(centerX + pos[0], 0, centerZ + pos[2]);
        compound.add(barrack);
    });

    // Watchtowers
    const towerSize = 4, towerHeight = 12;
    const offsets = [
        [-compoundSize/2, -compoundSize/2],
        [-compoundSize/2, compoundSize/2],
        [compoundSize/2, -compoundSize/2],
        [compoundSize/2, compoundSize/2]
    ];

    offsets.forEach(off => {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(towerSize, towerHeight, towerSize), towerMat);
        tower.position.set(centerX + off[0], towerHeight/2, centerZ + off[1]);
        compound.add(tower);
    });

    scene.add(compound);
    compounds.push(compound);
}

function checkCollisions(nextPosition){
    for(let i=0;i<compounds.length;i++){
        const compound = compounds[i];
        for(let j=0;j<compound.children.length;j++){
            const obj = compound.children[j];
            const box = new THREE.Box3().setFromObject(obj);
            if(box.containsPoint(new THREE.Vector3(nextPosition.x, nextPosition.y, nextPosition.z))){
                return true;
            }
        }
    }
    return false;
}

// ----------------- INIT SCENE -----------------
function init(){
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
    camera.position.set(localPlayer.x, localPlayer.y, localPlayer.z);

    renderer = new THREE.WebGLRenderer({canvas:document.getElementById("gameCanvas")});
    renderer.setSize(window.innerWidth, window.innerHeight);

    const ambient = new THREE.AmbientLight(0xffffff,0.5);
    scene.add(ambient);
    window.sun = new THREE.DirectionalLight(0xffffff,1);
    sun.position.set(100,200,100);
    scene.add(sun);

    const groundGeo = new THREE.PlaneGeometry(5000,5000,100,100);
    const groundMat = new THREE.MeshLambertMaterial({color:0x228B22});
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI/2;
    scene.add(ground);

    // Spawn some compounds
    createMilitaryCompound(0,0);
    createMilitaryCompound(100,100);
    createMilitaryCompound(-150,50);

    animate();
}
init();

// ----------------- INPUT -----------------
document.addEventListener("keydown", e=>keys[e.code]=true);
document.addEventListener("keyup", e=>keys[e.code]=false);

// ----------------- PLAYER MOVEMENT -----------------
function updatePlayerMovement(delta){
    let speed = 20*delta;
    let dx=0,dz=0;
    if(keys["KeyW"]) dz -= speed;
    if(keys["KeyS"]) dz += speed;
    if(keys["KeyA"]) dx -= speed;
    if(keys["KeyD"]) dx += speed;

    const nextPos = {x:localPlayer.x + dx, y:localPlayer.y, z:localPlayer.z + dz};
    if(!checkCollisions(nextPos)){
        localPlayer.x = nextPos.x;
        localPlayer.z = nextPos.z;
        camera.position.set(localPlayer.x, localPlayer.y, localPlayer.z);
        socket.emit("move",{x:localPlayer.x,y:localPlayer.y,z:localPlayer.z});
    }
}

// ----------------- ANIMATE -----------------
function animate(){
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    updatePlayerMovement(delta);

    // Day/Night cycle
    timeOfDay += daySpeed;
    if(timeOfDay>1) timeOfDay=0;
    sun.position.x = Math.sin(timeOfDay*Math.PI*2)*200;
    sun.position.y = Math.cos(timeOfDay*Math.PI*2)*200;
    sun.position.z = 100;
    sun.intensity = Math.max(0.2, Math.cos(timeOfDay*Math.PI*2));
    if(timeOfDay<0.25||timeOfDay>0.75){ scene.background=new THREE.Color(0x001122); }else{ scene.background=new THREE.Color(0x88ccff); }

    renderer.render(scene,camera);
}
