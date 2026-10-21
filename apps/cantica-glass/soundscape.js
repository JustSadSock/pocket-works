// Hand-tuned procedural soundscape. No downloads, tracks or persistent audio loops.
export function createCanticaSoundscape(enabled=()=>true){
 let audio=null;
 const context=()=>{
   if(!enabled()||typeof window==='undefined')return null;
   const Audio=window.AudioContext||window.webkitAudioContext;
   if(!Audio)return null;
   try{
     if(!audio)audio=new Audio();
     if(audio.state==='suspended')void audio.resume().catch(()=>{});
     return audio;
   }catch{return null}
 };
 function note(ctx,freq,delay,duration,volume=.03,shape='sine'){
   const t=ctx.currentTime+delay;
   const tone=ctx.createOscillator(),gain=ctx.createGain();
   tone.type=shape;tone.frequency.setValueAtTime(freq,t);
   tone.frequency.exponentialRampToValueAtTime(freq*.997,t+duration);
   gain.gain.setValueAtTime(.0001,t);
   gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),t+.012);
   gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
   tone.connect(gain);gain.connect(ctx.destination);
   tone.start(t);tone.stop(t+duration+.012);
 }
 function noise(ctx,duration,volume,centre=1400){
   const length=Math.floor(ctx.sampleRate*duration);
   const buffer=ctx.createBuffer(1,length,ctx.sampleRate);
   const data=buffer.getChannelData(0);
   for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/length);
   const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
   source.buffer=buffer;filter.type='bandpass';filter.frequency.value=centre;filter.Q.value=.8;
   gain.gain.value=volume;
   source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);source.start();
 }
 return {
   play(kind){
     const ctx=context();if(!ctx)return;
     try{
       switch(kind){
         case 'rotate':
           note(ctx,420,0,.07,.025,'triangle');
           note(ctx,660,.034,.13,.017,'sine');break;
         case 'reverse':
           note(ctx,560,0,.06,.021,'triangle');
           note(ctx,355,.037,.15,.013);break;
         case 'light':
           note(ctx,660,0,.20,.033);
           note(ctx,990,.08,.28,.026);
           note(ctx,1320,.18,.38,.019);break;
         case 'sun':
           noise(ctx,.11,.022,850);
           note(ctx,760,0,.19,.010);break;
         case 'hint':
           note(ctx,523,0,.23,.022);
           note(ctx,784,.10,.38,.028);
           note(ctx,1047,.24,.48,.020);break;
         case 'page':
           noise(ctx,.16,.027,1200);
           note(ctx,320,.09,.13,.008);break;
         case 'restart':
           note(ctx,510,0,.12,.016);
           note(ctx,340,.09,.16,.017);break;
         case 'success':
           for(const [i,f] of [392,523,659,784,1047].entries())note(ctx,f,i*.105,.55,.033+i*.002,'sine');
           note(ctx,1568,.55,.85,.025);break;
         case 'award':
           for(const [i,f] of [587,740,880,1175].entries())note(ctx,f,i*.115,.46,.035,'triangle');break;
         default:break;
       }
     }catch{}
   },
   dispose(){if(audio){void audio.close().catch(()=>{});audio=null;}}
 };
}
