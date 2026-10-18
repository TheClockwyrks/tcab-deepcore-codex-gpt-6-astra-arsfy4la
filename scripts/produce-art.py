"""One-time pixel-art authoring. Requires the supplied draw / draw-sheet tools."""
import json, random, subprocess, pathlib, math
ROOT=pathlib.Path(__file__).resolve().parents[1]; random.seed(472)
TMP=pathlib.Path('/tmp/deepcore-art'); TMP.mkdir(exist_ok=True)
def rect(a,x,y,w,h,c):
 a.append(dict(op='fill_rect',x=int(x),y=int(y),width=max(1,int(w)),height=max(1,int(h)),color=c))
def line(a,x,y,xx,yy,c):
 # rasterize as authored rect operations
 n=max(abs(int(xx-x)),abs(int(yy-y)),1)
 for i in range(n+1): rect(a,round(x+(xx-x)*i/n),round(y+(yy-y)*i/n),1,1,c)
def poly(a,pts,c):
 for y in range(int(min(p[1] for p in pts)),int(max(p[1] for p in pts))+1):
  xs=[]
  for (x1,y1),(x2,y2) in zip(pts,pts[1:]+pts[:1]):
   if min(y1,y2)<=y<max(y1,y2): xs.append(x1+(y-y1)/(y2-y1)*(x2-x1))
  xs.sort()
  for i in range(0,len(xs)-1,2): rect(a,math.ceil(xs[i]),y,max(1,int(xs[i+1])-math.ceil(xs[i])+1),1,c)
def circle(a,x,y,r,c):
 for yy in range(-r,r+1):
  xx=int(math.sqrt(r*r-yy*yy));rect(a,x-xx,y+yy,2*xx+1,1,c)
def save(path,a,w=80,h=80,sheet=False):
 out=ROOT/'assets'/path;out.parent.mkdir(parents=True,exist_ok=True)
 log=TMP/(path.replace('/','_')+'.json');log.write_text(json.dumps(a))
 subprocess.run(['draw-sheet' if sheet else 'draw','render','--actions',str(log),'--out',str(out),'--width',str(w),'--height',str(h),'--no-layers'],check=True,stdout=subprocess.DEVNULL)
def rock(base,seed):
 rng=random.Random(seed);a=[];rect(a,0,0,80,80,base)
 rgb=tuple(int(base[i:i+2],16) for i in (1,3,5))
 for _ in range(1600):
  d=rng.randint(-14,14);c='#'+''.join(f'{max(0,min(255,v+d)):02x}' for v in rgb);rect(a,rng.randrange(80),rng.randrange(80),rng.choice([1,1,2,3]),1,c)
 for _ in range(8):
  x,y=rng.randrange(80),rng.randrange(80);line(a,x,y,x+rng.randrange(4,15),y-rng.randrange(0,4),'#ffffff10')
 return a
for k,base in enumerate(['#624c39','#454e54','#303b45','#4c3033']):
 for n in range(3):save(f'tiles/{["topsoil","rockbed","deepstone","coreshell"][k]}-{n}.png',rock(base,k*17+n))
save('tiles/tunnel.png',rock('#131d25',91));save('tiles/bedrock.png',rock('#222c37',71))
for n in range(2):
 a=[];poly(a,[(8+n*3,18),(28,5+n*5),(61,10),(76-n*4,34),(68,65),(42,77-n*4),(12,61)],'#152532');poly(a,[(10,18),(30,8),(60,13),(70,34),(50,58),(17,52)],'#657b87');poly(a,[(17,23),(31,13),(58,17),(63,30),(44,34)],'#96a7aa');poly(a,[(17,52),(50,58),(70,34),(65,63),(42,73),(15,59)],'#394e5e');line(a,25,23,51,19,'#c7d2cc');save(f'tiles/stone-{n}.png',a)
colors=['#c4a995','#c7be74','#de8b55','#cbdcdb','#6aa1d0','#b5ca61','#b28ac7','#eb8668','#d45561','#a7e8ed','#65e3a5','#f390bc','#f1cc63']
names=['ferron','marlite','cuprite','argenite','cobaltine','voltite','halcite','pyronium','cindrite','adamite','verdite','roselite','aurite']
for idx,(name,c) in enumerate(zip(names,colors)):
 a=[]
 if idx<10:
  for x in range(80):
   cy=38+int(8*math.sin(x/17));
   for _ in range(11):
    y=cy+random.randint(-14,14);rect(a,x,y,random.randint(1,4),random.randint(1,3),c+random.choice(['40','70','a0','d0','ff']))
  for _ in range(18):
   x=random.randrange(80);y=38+int(8*math.sin(x/17))+random.randint(-8,8);line(a,x,y,x+4,y-2,'#ffe7bdc0')
 else:
  poly(a,[(18,30),(30,18),(53,18),(65,32),(42,65)],'#182630');poly(a,[(20,30),(31,20),(52,20),(62,32),(42,61)],c);poly(a,[(20,31),(33,33),(42,61)],'#ffffff80');poly(a,[(52,20),(62,32),(43,61),(49,33)],'#00000060');poly(a,[(31,20),(52,20),(48,31),(33,31)],'#ffffffb0');line(a,26,17,26,31,'#ffffff');line(a,20,24,32,24,'#ffffff')
 save('ore/'+name+'.png',a)
for name,c in [('resonite','#7cf7c8'),('cryenite','#91c9ff'),('core','#ffbb68'),('core-sample','#fff49c')]:
 a=[]
 for r in range(33,13,-3):circle(a,40,40,r,c+'0a')
 for x,y,h in [(25,49,26),(38,52,43),(52,52,31)]:
  poly(a,[(x-8,y),(x-6,y-h+8),(x,y-h),(x+8,y-h+9),(x+6,y)],c);poly(a,[(x,y-h),(x+8,y-h+9),(x+6,y),(x,y-3)],'#00000055');line(a,x-5,y-6,x-4,y-h+9,'#ffffffc0')
 save('materials/'+name+'.png',a)
for f in range(4):
 a=[]
 for j in range(f+1):
  x=20+j*13;line(a,40,40,x,5+j*4,'#15171e');line(a,x,5+j*4,x-9,15+j*5,'#15171e');line(a,40,40,65-j*10,77,'#15171e');line(a,40,40,78,24+j*9,'#15171e')
 save(f'tiles/crack/frame{f:02}.png',a,sheet=True)
for f in range(4):
 a=rock('#a43824',f)
 for y in range(80):
  for x in range(80):
   v=math.sin(x/8+f)+math.sin(y/7-f)+math.sin((x+y)/12)
   if v>0.5:rect(a,x,y,1,1,'#ffbb4e' if v>1.7 else '#ed6b2f')
 save(f'hazards/lava/frame{f:02}.png',a,sheet=True)
# A single character design: teal pressure suit, ochre hard hat, luminous visor,
# articulated boots, riveted pack and a steel helical drill. All poses share parts.
for state,count in [('idle',4),('walk',8),('drill-down',4),('drill-side',4),('jetpack',4),('fall',4),('hurt',3),('fuel-out',3)]:
 for f in range(count):
  a=[]; bob=[0,1,0,-1][f%4]; shift=-3 if state=='hurt' and f<2 else 0
  if state=='fuel-out':bob+=5
  def R(x,y,w,h,c):rect(a,x+shift,y+bob,w,h,c)
  def P(p,c):poly(a,[(x+shift,y+bob) for x,y in p],c)
  # pack, nozzle and tubing
  R(13,29,15,30,'#0b1723');R(15,31,10,23,'#536c71');R(16,33,4,17,'#9fa59a');R(13,38,3,11,'#d6b678');R(17,55,9,6,'#1a2836')
  if state=='jetpack':
   P([(16,60),(28,60),(24,76-f%3*3),(20,70),(17,78)],'#f58c44');P([(19,60),(25,60),(22,72)],'#fff2a3')
  step=([-5,-2,3,6,4,1,-3,-6][f] if state=='walk' else 0)
  if state=='fall':step=5
  R(29-step,52,12,17,'#112b38');R(43+step,51,12,18,'#193a46');R(28-step,64,15,9,'#10212d');R(43+step,65,17,8,'#10212d');R(29-step,64,12,3,'#a3b5ad');R(45+step,65,12,3,'#a3b5ad')
  P([(29,28),(47,27),(55,37),(51,55),(29,56),(24,42)],'#142b35');R(29,31,20,20,'#438c8d');R(30,32,5,17,'#68b2a3');R(29,49,22,6,'#b6a77c');R(38,48,5,8,'#20333e');R(39,33,8,9,'#263e49');R(40,34,5,3,'#b5dbbd')
  circle(a,40+shift,21+bob,16,'#10212c');circle(a,40+shift,20+bob,14,'#ce963f');R(27,12,25,7,'#edbc5e');R(25,22,32,4,'#f3cd77');R(34,25,21,8,'#0e2c3b');R(37,26,17,4,'#8be2df');R(38,26,11,2,'#def4dd');R(48,15,10,8,'#233e49');R(51,16,7,6,'#fff2bc' if f%2==0 else '#cfdfad');R(27,27,6,8,'#756a4b')
  if state=='drill-down':
   R(45,39,9,18,'#64a1a0');R(43,51,18,10,'#e1b367');R(48,59,8,8,'#79959b');P([(47,66),(58,66),(52,79-f%2*2)],'#d2d9cb');R(48,69+f%2*2,10,2,'#3b5864')
  else:
   yy=42+(3 if state=='fall' else 0)+(f%2 if state=='drill-side' else 0)
   R(48,yy-6,10,11,'#539392');R(53,yy,13,8,'#d3a458');R(59,yy-3,10,11,'#344c56');P([(68,yy-2),(79,yy+2),(68,yy+7)],'#cbd0bc');R(69,yy,2,5,'#6d8184');R(73,yy+1,2,3,'#6d8184')
  save(f'miner/{state}/frame{f:02}.png',a,sheet=True)
# Surface: starfield, distant ridges and silent mining apparatus.
a=[];rect(a,0,0,1280,480,'#101d29')
for y in range(480):rect(a,0,y,1280,1,f'#{16+y//48:02x}{29+y//35:02x}{41+y//38:02x}')
for i in range(240):
 x=random.randrange(1280);y=random.randrange(350);rect(a,x,y,1 if i%8 else 2,1,'#8aabaf' if i%4 else '#c8c5ad')
circle(a,970,112,49,'#87928a');circle(a,985,103,47,'#263845')
for j,c in enumerate(['#243641','#1c303a','#162832']):
 pts=[(0,480)]+[(x,365+j*29+random.randrange(-42,20)) for x in range(0,1300,60)]+[(1280,480)];poly(a,pts,c)
save('surface/sky.png',a,1280,480)
a=rock('#39433f',3);save('surface/ground.png',a)
ids=['fuel-depot','ore-market','save-pad','upgrade-shop','supply-depot','launch-pad','cave-mouth']
for idx,name in enumerate(ids):
 a=[];W=240;H=180
 # platform and feet
 rect(a,7,164,226,13,'#14232b');rect(a,10,161,220,4,'#84938a');rect(a,22,174,20,6,'#121b24');rect(a,199,174,20,6,'#121b24')
 if name=='cave-mouth':
  poly(a,[(30,163),(42,49),(68,24),(181,24),(208,53),(218,163)],'#536267');rect(a,63,48,122,116,'#0a151e');rect(a,64,43,121,9,'#bd9b55')
  for x in range(68,184,23):poly(a,[(x,43),(x+9,43),(x+18,52),(x+9,52)],'#26303a')
 elif name=='launch-pad':
  rect(a,30,145,178,17,'#4f636b');rect(a,40,140,158,5,'#baa975');rect(a,28,28,13,115,'#586c73');rect(a,29,29,7,5,'#d2a85e');line(a,35,36,100,143,'#80938e')
 else:
  poly(a,[(26,160),(26,65),(47,42),(194,42),(214,64),(214,160)],'#132632');poly(a,[(30,64),(49,47),(190,47),(209,65)],'#71857e');rect(a,30,67,179,92,'#344f57');rect(a,32,69,175,6,'#91a49a');rect(a,41,83,83,61,'#192e3a');rect(a,47,89,71,32,'#4c9e9d');rect(a,50,91,65,4,'#9ad9bd');rect(a,132,84,63,75,'#1e303c')
  for x in range(137,194,8):rect(a,x,89,3,60,'#3b535b')
  rect(a,42,127,78,4,'#c6a45d');rect(a,37,151,90,7,'#586c70')
  for x in range(40,210,30):rect(a,x,71,2,2,'#d4ceb1')
  if idx==0:
   circle(a,157,70,25,'#1d303a');circle(a,157,68,21,'#b88b50');rect(a,144,58,24,20,'#d9b96d');rect(a,153,52,5,31,'#415e60');rect(a,140,65,31,5,'#415e60')
  elif idx==1:
   for x,y in [(60,100),(78,97),(94,104)]:poly(a,[(x-8,y),(x,y-12),(x+9,y),(x,y+10)],'#e2bc73')
  elif idx==2:circle(a,83,104,21,'#214852');circle(a,83,104,14,'#7edbc5');rect(a,77,96,13,17,'#284852');rect(a,79,97,9,5,'#d6edc6')
  elif idx==3:
   circle(a,84,104,22,'#c1aa76');circle(a,84,104,11,'#30515c');rect(a,80,77,8,54,'#c1aa76')
  elif idx==4:
   rect(a,65,88,35,31,'#d0aa61');rect(a,78,84,9,39,'#304d55');rect(a,61,99,43,8,'#304d55')
  rect(a,184,18,6,25,'#8a9a8e');rect(a,181,15,12,6,'#e9bc71');line(a,186,19,217,5,'#72958f')
 save('surface/'+name+'.png',a,W,H)
for stage in range(6):
 a=[];rect(a,15,218,170,12,'#536970');rect(a,25,212,150,7,'#c5aa72')
 if stage:
  poly(a,[(66,207),(70,90),(100,37),(130,90),(134,207)],'#213543');poly(a,[(75,202),(78,92),(100,49),(122,92),(125,202)],'#b3c4b8');rect(a,79,99,10,94,'#e0debb');rect(a,113,99,10,94,'#718f90')
 if stage>=2:rect(a,75,141,50,18,'#c59950');rect(a,92,145,16,9,'#253f4a')
 if stage>=3:circle(a,100,103,15,'#263f4b');circle(a,100,102,10,'#6dc3c1');rect(a,94,96,9,3,'#d2eed5')
 if stage>=4:
  poly(a,[(74,164),(49,201),(47,212),(77,201)],'#d0a155');poly(a,[(125,164),(151,201),(153,212),(124,201)],'#b78743');rect(a,85,200,30,14,'#344d5a')
 if stage>=5:poly(a,[(79,91),(100,49),(121,91)],'#cf9e51');rect(a,92,171,16,20,'#38545c');rect(a,97,175,6,11,'#9aefc1')
 save(f'rocket/stage{stage}.png',a,200,240)
for name in ['fuel','hull','cargo','credits','depth','resonite','cryenite','core-sample']:
 a=[];c='#e1ba70' if name in ['fuel','credits'] else '#8fcfc1'
 if name=='hull':poly(a,[(4,4),(12,2),(20,4),(18,16),(12,22),(6,16)],c);poly(a,[(8,7),(16,7),(15,14),(12,18),(9,14)],'#253e48')
 elif name=='depth':rect(a,10,2,4,14,c);poly(a,[(5,13),(19,13),(12,22)],c)
 elif name=='cargo':rect(a,3,7,18,15,c);rect(a,7,2,10,6,c);rect(a,9,4,6,3,'#253e48');rect(a,5,12,14,2,'#253e48')
 else:poly(a,[(6,3),(17,3),(21,12),(16,21),(7,21),(3,12)],c);rect(a,10,7,4,10,'#253e48')
 save('icons/'+name+'.png',a,24,24)
print('Authored art complete')
