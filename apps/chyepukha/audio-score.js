// Notes are MIDI values; null is intentional silence. Each editorial
// ambience consists of phrases with rests, rather than a perpetual arpeggio.
export const SCORE={
 menu:{tempo:730,notes:[60,null,67,null,64,null,72,null,67,null,64,null,59,null,null,null],bass:[48,48,48,48,53,53,53,53,48,48,48,48,55,55,55,55]},
 lobby:{tempo:780,notes:[57,null,null,64,null,60,null,null,62,null,69,null,64,null,null,null],bass:[45,45,45,45,50,50,50,50,45,45,45,45,52,52,52,52]},
 writing:{tempo:830,notes:[60,null,null,63,null,null,67,null,65,null,null,60,null,null,null,null],bass:[48,48,48,48,46,46,46,46,53,53,53,53,48,48,48,48]},
 finished:{tempo:660,notes:[64,null,67,null,71,null,null,76,72,null,67,null,64,null,null,null],bass:[52,52,52,52,55,55,55,55,48,48,48,48,52,52,52,52]}
};
export const getScore=scene=>SCORE[scene]||SCORE.menu;
export const midiToHz=midi=>440*Math.pow(2,(midi-69)/12);
