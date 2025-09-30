const socket = io();

// ----------------- PLAYER & CAMERA -----------------
let scene, camera, renderer;
let localPlayer = { x:0, y:20, z:0, hp:100, inventory:[], equipped:{}, username:"" };
let playersMeshes = {};
let zombiesMeshes = {};
let bullets = [];
let muzzleFlashes = [];
let damageNumbers = [];
let zombieAnimationData = {};
let keys = {};
let raycaster = new THREE.Raycaster();
let clock = new THREE.Clock();

// Recoil
let recoilAmount = 0;
let recoilRecovery = 0.05;

// Day/Night
let timeOfDay = 0;
let daySpeed = 0.001;

// ----------------- INITIALIZE SCENE -----------------
function init(){
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,0.1,1000);
    camera.position.set(localPlayer.x, localPlayer.y, localPlayer.z);

    renderer = new THREE.WebGLRenderer({canvas:document.getElementById("gameCanvas")});
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff,0.5);
    scene.add(ambient);
    window.sun = new THREE.DirectionalLight(0xffffff,1);
    sun.position.set(100,200,100);
    scene.add(sun);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(5000,5000,100,100);
    const groundMat = new THREE.MeshLambertMaterial({color:0x228B22});
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI/2;
    scene.add(ground);

    animate();
}
init();

// ----------------- LOGIN -----------------
document.getElementById("login-btn").onclick = () => login();
document.getElementById("register-btn").onclick = () => register();

function login(){
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    fetch("/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})})
    .then(r=>r.json()).then(r=>{
        if(r.ok){ startGame(username); }
        else document.getElementById("login-msg").innerText = r.msg;
    });
}
function register(){
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    fetch("/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})})
    .then(r=>r.json()).then(r=>{
        if(r.ok){ startGame(username); }
        else document.getElementById("login-msg").innerText = r.msg;
    });
}

// ----------------- START GAME -----------------
function startGame(username){
    localPlayer.username = username;
    document.getElementById("login-screen").style.display="none";
    document.getElementById("game-screen").style.display="block";
    socket.emit("login",{username});
}

// ----------------- INPUT -----------------
document.addEventListener("keydown", e => { keys[e.code]=true; });
document.addEventListener("keyup", e => { keys[e.code]=false; });

// ----------------- INVENTORY -----------------
let inventoryHUD = document.createElement("div");
inventoryHUD.style.position = "absolute";
inventoryHUD.style.bottom = "10px";
inventoryHUD.style.left = "10px";
inventoryHUD.style.background = "rgba(0,0,0,0.5)";
inventoryHUD.style.padding = "5px";
inventoryHUD.style.borderRadius = "5px";
inventoryHUD.style.color = "#fff";
inventoryHUD.innerHTML = "Inventory: Empty";
document.body.appendChild(inventoryHUD);

function updateInventoryHUD(){
    if(localPlayer.inventory.length===0){ inventoryHUD.innerHTML="Inventory: Empty"; }
    else{
        inventoryHUD.innerHTML="Inventory: "+localPlayer.inventory.map(i=>i.equipped?`[${i.name}]`:i.name).join(", ");
    }
}

// Equip weapons/armor
document.addEventListener("keydown", e => {
    if(e.code==="Digit1"){
        const weapon = localPlayer.inventory.find(i=>i.type==="gun");
        if(weapon){ if(localPlayer.equipped.weapon) localPlayer.equipped.weapon.equipped=false; weapon.equipped=true; localPlayer.equipped.weapon=weapon; updateInventoryHUD(); }
    }
    if(e.code==="Digit2"){
        const armor = localPlayer.inventory.find(i=>i.type==="armor");
        if(armor){ if(localPlayer.equipped.armor) localPlayer.equipped.armor.equipped=false; armor.equipped=true; localPlayer.equipped.armor=armor; updateInventoryHUD(); }
    }
});

// ----------------- SHOOTING -----------------
document.addEventListener("mousedown", e=>{
    const weapon = localPlayer.equipped.weapon;
    if(!weapon) return;

    // Recoil
    recoilAmount = 0.05;

    // Bullet
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const geometry = new THREE.SphereGeometry(0.2,6,6);
    const material = new THREE.MeshBasicMaterial({color:0xffff00});
    const mesh = new THREE.Mesh(geometry,material);
    mesh.position.copy(camera.position);
    scene.add(mesh);
    bullets.push({mesh,direction:dir.clone(),speed:2,damage:10});

    // Muzzle flash
    const flashGeo = new THREE.SphereGeometry(0.3,8,8);
    const flashMat = new THREE.MeshBasicMaterial({color:0xffffaa});
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(camera.position).add(dir.clone().multiplyScalar(1));
    scene.add(flash);
    muzzleFlashes.push({mesh:flash,lifetime:3});
});

// ----------------- SOCKET.IO HANDLERS -----------------
socket.on("players", data=>{
    Object.entries(data).forEach(([id,p])=>{
        if(id===socket.id) return;
        if(!playersMeshes[id]){
            const geo = new THREE.BoxGeometry(2,4,2);
            const mat = new THREE.MeshLambertMaterial({color:0x0000ff});
            const mesh = new THREE.Mesh(geo,mat);
            scene.add(mesh);
            playersMeshes[id]=mesh;
        }
        playersMeshes[id].position.set(p.x,2,p.z);
    });
});

socket.on("zombies", data=>{
    data.forEach(z=>{
        if(!zombiesMeshes[z.id]){
            const geo = new THREE.BoxGeometry(2,4,2);
            const mat = new THREE.MeshLambertMaterial({color:0x00ff00});
            const mesh = new THREE.Mesh(geo,mat);
            mesh.position.set(z.x,2,z.z);
            scene.add(mesh);
            zombiesMeshes[z.id]=mesh;
            zombieAnimationData[z.id]={angle:0};
        }
    });
});

socket.on("zombieUpdate", data=>{
    data.forEach(z=>{
        if(!zombiesMeshes[z.id]){
            const geo = new THREE.BoxGeometry(2,4,2);
            const mat = new THREE.MeshLambertMaterial({color:0x00ff00});
            const mesh = new THREE.Mesh(geo,mat);
            mesh.position.set(z.x,2,z.z);
            scene.add(mesh);
            zombiesMeshes[z.id]=mesh;
            zombieAnimationData[z.id]={angle:0};
        }
        zombiesMeshes[z.id].position.set(z.x,2,z.z);
    });
});

socket.on("zombieDamaged",({id,damage})=>{
    const zm = zombiesMeshes[id];
    if(zm){ spawnDamageNumber(damage, zm.position.clone().add(new THREE.Vector3(0,2,0))); }
});

socket.on("zombieKilled",({id})=>{
    if(zombiesMeshes[id]){
        scene.remove(zombiesMeshes[id]);
        delete zombiesMeshes[id];
    }
});

// ----------------- DAMAGE NUMBERS -----------------
function spawnDamageNumber(amount,position){
    const div = document.createElement("div");
    div.style.position="absolute";
    div.style.color="red";
    div.style.fontWeight="bold";
    div.textContent=amount;
    document.body.appendChild(div);
    damageNumbers.push({div,worldPos:position.clone(),lifetime:60});
}

// ----------------- ANIMATE -----------------
function animate(){
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Recoil
    if(recoilAmount>0){ camera.rotation.x-=recoilAmount; recoilAmount-=recoilRecovery; if(recoilAmount<0) recoilAmount=0; }

    // Day/Night cycle
    timeOfDay+=daySpeed;
    if(timeOfDay>1) timeOfDay=0;
    sun.position.x = Math.sin(timeOfDay*Math.PI*2)*200;
    sun.position.y = Math.cos(timeOfDay*Math.PI*2)*200;
    sun.position.z = 100;
    sun.intensity = Math.max(0.2, Math.cos(timeOfDay*Math.PI*2));
    if(timeOfDay<0.25||timeOfDay>0.75){ scene.background=new THREE.Color(0x001122); }else{ scene.background=new THREE.Color(0x88ccff); }

    // Bullet movement
    for(let i=bullets.length-1;i>=0;i--){
        const b = bullets[i];
        b.mesh.position.add(b.direction.clone().multiplyScalar(b.speed));
        Object.entries(zombiesMeshes).forEach(([id,zm])=>{
            if(b.mesh.position.distanceTo(zm.position)<2){
                socket.emit("attackZombie",{id,weaponName:localPlayer.equipped.weapon.name});
                scene.remove(b.mesh);
                bullets.splice(i,1);
            }
        });
        if(b.mesh.position.distanceTo(camera.position)>100){ scene.remove(b.mesh); bullets.splice(i,1); }
    }

    // Muzzle flashes
    for(let i=muzzleFlashes.length-1;i>=0;i--){
        muzzleFlashes[i].lifetime--;
        if(muzzleFlashes[i].lifetime<=0){ scene.remove(muzzleFlashes[i].mesh); muzzleFlashes.splice(i,1); }
    }

    // Floating damage numbers
    for(let






