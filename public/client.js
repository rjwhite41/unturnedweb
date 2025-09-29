const socket = io();
let myId=null,myPlayer={x:100,y:100,hp:100,hunger:100,inventory:{}};
let players={};
let inputs=[];
let world=[],tileSize=32;

const loginPanel=document.getElementById('loginPanel');
const usernameInp=document.getElementById('username');
const passwordInp=document.getElementById('password');
const btnLogin=document.getElementById('btnLogin');
const btnRegister=document.getElementById('btnRegister');
const loginMsg=document.getElementById('loginMsg');
const hud=document.getElementById('hud');
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const stats=document.getElementById('stats');
const shop=document.getElementById('shop');

btnRegister.onclick=async ()=>{
  const res=await fetch("/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:usernameInp.value,password:passwordInp.value})});
  const j=await res.json(); loginMsg.textContent=j.ok?"Registered!":"Failed";
};
btnLogin.onclick=async ()=>{
  const res=await fetch("/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:usernameInp.value,password:passwordInp.value})});
  const j=await res.json();
  if(j.ok){
    loginPanel.style.display='none';
    hud.style.display='block';
    myPlayer=Object.assign(myPlayer,j.save||{});
    socket.emit("login",{username:usernameInp.value});
  }else loginMsg.textContent=j.msg;
};

// movement
let keys={};
window.addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);
window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
function sendInput(){
  let dx=0,dy=0;
  if(keys['w'])dy-=2;if(keys['s'])dy+=2;if(keys['a'])dx-=2;if(keys['d'])dx+=2;
  myPlayer.x+=dx; myPlayer.y+=dy;
  inputs.push({dx,dy});
  socket.emit('move',{x:myPlayer.x,y:myPlayer.y});
}
setInterval(sendInput,1000/30);

// crafting buttons
shop.querySelectorAll("button").forEach(btn=>{
  btn.onclick=()=>socket.emit("craft",{item:btn.dataset.item});
});

// world interaction
canvas.addEventListener("click",e=>{
  const tileX=Math.floor(e.offsetX/tileSize);
  const tileY=Math.floor(e.offsetY/tileSize);
  socket.emit("gather",{x:tileX,y:tileY});
});

// socket events
socket.on("players",data=>players=data);
socket.on("update",data=>{
  if(!players[data.id])players[data.id]={};
  players[data.id].targetX=data.x; players[data.id].targetY=data.y;
});
socket.on("world",w=>world=w);
socket.on("worldUpdate",({x,y,type})=>{ if(world[y]) world[y][x]=type; });

// rendering
function drawWorld(){
  for(let y=0;y<world.length;y++){
    for(let x=0;x<world[0].length;x++){
      const tile=world[y][x];
      if(tile==="grass")ctx.fillStyle="#228822";
      else if(tile==="tree")ctx.fillStyle="#115511";
      else if(tile==="stone")ctx.fillStyle="#888888";
      ctx.fillRect(x*tileSize,y*tileSize,tileSize,tileSize);
    }
  }
}
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawWorld();
  for(let id in players){
    let p=players[id];
    if(p.targetX!==undefined){
      p.x=p.x?p.x+0.1*(p.targetX-p.x):p.targetX;
      p.y=p.y?p.y+0.1*(p.targetY-p.y):p.targetY;
    }
    ctx.fillStyle=(id===socket.id)?"#8f8":"#f88";
    ctx.fillRect((p.x||0)-10,(p.y||0)-10,20,20);
  }
  ctx.fillStyle="#8f8"; ctx.fillRect(myPlayer.x-10,myPlayer.y-10,20,20);

  stats.innerHTML=`HP:${myPlayer.hp} Hunger:${myPlayer.hunger} Inventory:${JSON.stringify(myPlayer.inventory)}`;
  requestAnimationFrame(render);
}
render();
