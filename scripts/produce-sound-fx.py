"""One-time sound and particle authoring; never called by the build."""
import pathlib, subprocess, json
root=pathlib.Path(__file__).resolve().parents[1]; tmp=pathlib.Path('/tmp/deepcore-fx');tmp.mkdir(exist_ok=True)
def run(tool,c,*args):subprocess.run([tool,'--config',str(c),*map(str,args)],check=True,stdout=subprocess.DEVNULL)
def config(name,extra):
 c=tmp/(name+'.json');c.write_text(json.dumps(extra));return c
fx=['gas-seep','drill-debris','jetpack-exhaust','ore-sparkle','material-shimmer','gas-explosion','lava-embers','impact-dust','core-extract','core-detonation','launch-exhaust','death-burst']
(root/'assets/fx').mkdir(exist_ok=True);(root/'assets/audio').mkdir(exist_ok=True)
for i,name in enumerate(fx):
 c=config(name,dict(width=400,height=400,duration_ms=1200,fps=30,seed=13+i,actions=str(tmp/(name+'-ops.json')),preview=str(tmp/(name+'.png')),system=str(root/'assets/fx'/f'{name}.json')))
 run('particle-2d',c,'init')
 gas=name=='gas-seep';big='explosion' in name or 'detonation' in name;exhaust='exhaust' in name
 run('particle-2d',c,'add-emitter','--name','body','--shape','disc','--radius',30 if gas else 3,'--x',200,'--y',200,'--burst',8 if gas else 65 if big else 22,'--lifetime',1100 if gas else 650,'--lifetime-spread',200,'--speed',15 if gas else 230 if big else 90,'--speed-spread',10 if gas else 40,'--dir-y',-1 if exhaust else 1,'--cone-angle',22 if exhaust else 180 if big or 'sparkle' in name else 55)
 color='#bddcca' if gas else '#80f6da' if 'material' in name or 'core-extract' in name else '#ffc465'
 run('particle-2d',c,'set-particle','--emitter','body','--size-from',2 if big else 1,'--size-to',4 if gas else 0,'--opacity-from',0.16 if gas else 0.8,'--opacity-to',0,'--color-gradient',color+'@0,#876456@1')
 run('particle-2d',c,'set-forces','--drag',1.2,'--gravity',0 if gas else -60,'--turbulence','12,0.05')
 if big:
  run('particle-2d',c,'add-emitter','--name','shock','--shape','disc','--radius',5,'--x',200,'--y',200,'--burst',100,'--lifetime',300,'--speed',550 if 'core' in name else 320,'--cone-angle',180)
  run('particle-2d',c,'set-particle','--emitter','shock','--size-from',0.8,'--size-to',0.1,'--color-gradient','#fff8d4@0,#ff7040@1')
 run('particle-2d',c,'render','--frame',10)
cues=['drill','thrust','ore-pickup','material-chime','gas-explosion','lava-sizzle','impact','fabricate','launch','death','alarm-fuel','alarm-core']
for i,name in enumerate(cues):
 dur=1700 if name=='launch' else 650 if name in ['drill','thrust'] else 500
 c=config('audio-'+name,dict(sample_rate=22050,channels='mono',max_duration_ms=dur+400,seed=91+i,actions=str(tmp/(name+'-audio-ops.json')),preview=str(tmp/(name+'-wave.png')),wav=str(root/'assets/audio'/f'{name}.wav')))
 run('sfx-synth',c,'init')
 noisy=name in ['drill','thrust','gas-explosion','lava-sizzle','impact','launch','death']
 run('sfx-synth',c,'add-voice','--name','body','--wave','noise' if noisy else 'sine','--freq',120 if noisy else 520+i*32,'--gain=-23','--dur',dur)
 run('sfx-synth',c,'set-envelope','--voice','body','--env','gate' if name in ['drill','thrust'] else 'punch' if noisy else 'pluck')
 run('sfx-synth',c,'add-voice','--name','tone','--wave','triangle','--freq',74 if noisy else 780+i*40,'--gain=-25','--dur',dur,'--start',30)
 run('sfx-synth',c,'set-pitch','--voice','tone','--slide-to',32 if noisy else 1200,'--over',dur)
 run('sfx-synth',c,'render')
 if name in ['impact','fabricate']:
  run('sfx-sample',c,'add-sample','--name','impact_metal_hollow' if name=='impact' else 'impact_metal_dry','--t',0,'--gain=-23','--pitch',-5 if name=='impact' else 7)
  run('sfx-sample',c,'render')
c=config('music',dict(sample_rate=22050,channels='stereo',max_duration_ms=26000,seed=50,actions=str(tmp/'music-ops.json'),preview=str(tmp/'music.png'),wav=str(root/'assets/audio/music.wav'),mid=str(root/'assets/audio/music.mid')))
run('music',c,'init');run('music',c,'set-tempo','--bpm',76)
for name,instrument,gain in [('depth','synth_pad',-24),('signal','vibraphone',-30),('pulse','bass_electric',-30)]:
 run('music',c,'define-track','--name',name,'--instrument',instrument);run('music',c,'set-track-fx','--track',name,'--gain',gain,'--reverb',0.35,'--env','swell' if name=='depth' else 'pluck')
for bar,pitch in enumerate([38,34,36,33]):
 run('music',c,'add-note','--track','depth','--pitch',pitch,'--t',bar*8,'--dur',8)
 for j in range(8):run('music',c,'add-note','--track','pulse','--pitch',pitch+12,'--t',bar*8+j,'--dur',0.8,'--velocity',45)
 for j,p in enumerate([0,7,12,3]):run('music',c,'add-note','--track','signal','--pitch',pitch+24+p,'--t',bar*8+j*2+0.5,'--dur',2,'--velocity',65)
run('music',c,'render')
print('Sound and effects complete')
