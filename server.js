const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const fs = require("fs");
const bodyParser = require("body-parser");

app.use(express.static("public"));
app.use(bodyParser.json());

let players = {};
let zombies = [];
let worldData = JSON.parse(fs.readFileSync("world.json","utf-8"));

const WEAPONS = {
  "pistol": { damage: 10, range: 30 },
  "rifle": { damage: 25, range: 60 },
  "alienRifle": { damage: 40, range: 80 }
};

function saveWorld(){
  fs.writeFileSync("world.json", JSON.stringify(worldData,null,2));
}

// Spawn zombies
for(let i=0;i<20;i++){
  zombies.push({ id:i, x:Math.random()*2000-1000, y:0, z:Math.random()*2000-1000, hp:50 });
}

// ---------------- LOGIN/REGISTER ----------------
let users = {};

app.post("/register",(req,res)=>{
  const {username,password} = req.body;
  if(users[username]) return res.json({ok:false,msg:"User exists"});
  users[username] = { password, inventory:[], equipped:{} };
  res.json({ok:true});
});

app.post("/login",(req,res)=>{
  const {username,password} = req.body;
  const u = users[username];
  if(u && u.password===password) return res.json({ok:true});
  res.json({ok:false,msg:"Invalid credentials"});
});

// ---------------- SOCKET.IO ----------------
io.on("connection", socket=>{
  socket.on("login", ({username})=>{
    players[socket.id] = { username, x:0, y:20, z:0, hp:100, inventory:[], equipped:{} };
    socket.emit("worldData", worldData);
    socket.emit("zombies", zombies);
  });

  socket.on("move", data=>{
    if(players[socket.id]) Object.assign(players[socket.id], data);
  });

  socket.on("attackZombie", ({id, weaponName})=>{
    const z = zombies.find(zz=>zz.id==id);
    if(!z) return;
    const weapon = WEAPONS[weaponName] || { damage:5, range:10 };
    z.hp -= weapon.damage;
    io.emit("zombieDamaged",{id,damage:weapon.damage});
    if(z.hp <=0){
      const lootTypes=["pistol","rifle","alienRifle","armor","medkit"];
      const loot=lootTypes[Math.floor(Math.random()*lootTypes.length)];
      worldData.crashSites.push({ x:z.x, z:z.z, loot:[{opened:false,loot}] });
      zombies=zombies.filter(zz=>zz.id!=id);
      saveWorld();
      io.emit("zombieKilled",{id,loot});
    }
  });
});

// ---------------- ZOMBIE AI ----------------
function applyArmor(player, damage){
  const armor = player.equipped?.armor;
  if(armor) return damage*0.5;
  return damage;
}

setInterval(()=>{
  zombies.forEach(z=>{
    let closest=null; let dist=Infinity;
    for(let pid in players){
      const p=players[pid];
      const d=Math.hypot(p.x-z.x,p.z-z.z);
      if(d<dist){ dist=d; closest=p; }
    }
    if(closest){
      const dx=closest.x-z.x;
      const dz=closest.z-z.z;
      const len=Math.hypot(dx,dz);
      if(len>0){ z.x+=dx/len*0.5; z.z+=dz/len*0.5; }
      if(dist<3){
        closest.hp -= applyArmor(closest,5);
        if(closest.hp<0) closest.hp=0;
      }
    }
  });
  io.emit("zombieUpdate",zombies);
  io.emit("players",players);
},100);

server.listen(3000, ()=>console.log("Server running on port 3000"));
