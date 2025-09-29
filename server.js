const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");
const bcrypt = require("bcrypt");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static("public"));
app.use(express.json());

const USERS_FILE = "users.json";
let users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : {};
let players = {};

const worldWidth = 50, worldHeight = 30;
let world = [];
const tileTypes = ["grass","tree","stone"];
for (let y=0;y<worldHeight;y++){
  let row=[];
  for (let x=0;x<worldWidth;x++){
    const r=Math.random();
    if(r<0.1) row.push("tree");
    else if(r<0.15) row.push("stone");
    else row.push("grass");
  }
  world.push(row);
}

// --- Auth endpoints ---
app.post("/register", async (req,res)=>{
  const {username,password}=req.body;
  if(users[username]) return res.json({ok:false,msg:"User exists"});
  const hash = await bcrypt.hash(password,10);
  users[username]={password:hash,save:{}};
  fs.writeFileSync(USERS_FILE,JSON.stringify(users,null,2));
  res.json({ok:true});
});

app.post("/login", async (req,res)=>{
  const {username,password}=req.body;
  if(!users[username]) return res.json({ok:false,msg:"No such user"});
  const valid = await bcrypt.compare(password,users[username].password);
  if(!valid) return res.json({ok:false,msg:"Invalid credentials"});
  res.json({ok:true,save:users[username].save});
});

// --- Socket.IO multiplayer ---
io.on("connection",socket=>{
  const id = socket.id;
  players[id] = {x:100,y:100,hp:100,hunger:100,username:"anon",inventory:{}};
  
  socket.emit("world",world);

  socket.on("login",({username})=>{
    if(users[username]){
      players[id].username=username;
      Object.assign(players[id],users[username].save||{});
    }
    io.emit("players",players);
  });

  socket.on("move",({x,y})=>{
    if(!players[id]) return;
    players[id].x=x; players[id].y=y;
    io.emit("update",{id,x,y});
  });

  socket.on("craft",({item})=>{
    const recipes={
      campfire:{wood:3,cloth:1},
      sword:{wood:1,metal:2},
      bandage:{cloth:2}
    };
    const inv=players[id].inventory;
    const r=recipes[item];
    if(!r) return;
    for(let key in r) if((inv[key]||0)<r[key]) return;
    for(let key in r) inv[key]-=r[key];
    inv[item]=(inv[item]||0)+1;
  });

  socket.on("gather",({x,y})=>{
    const tile=world[y]?.[x];
    if(!tile) return;
    if(tile==="tree"){ players[id].inventory.wood=(players[id].inventory.wood||0)+1; world[y][x]="grass"; }
    if(tile==="stone"){ players[id].inventory.stone=(players[id].inventory.stone||0)+1; world[y][x]="grass"; }
    io.emit("worldUpdate",{x,y,type:world[y][x]});
  });

  socket.on("save",()=>{
    const username = players[id].username;
    if(!users[username]) return;
    users[username].save=players[id];
    fs.writeFileSync(USERS_FILE,JSON.stringify(users,null,2));
  });

  socket.on("disconnect",()=>{ delete players[id]; io.emit("players",players); });
});

server.listen(3000,()=>console.log("Server running on http://localhost:3000"));
