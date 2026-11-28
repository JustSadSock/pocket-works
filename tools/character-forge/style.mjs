// Style controls proportion, material and light; LOD controls topology only.
export const styles=Object.freeze({
 'low-poly':{head:1.10,width:.94,faceted:true,roughness:.91,metallic:.12,light:[.58,.55],saturation:.90},
 'historical-miniature':{head:1.065,width:1.04,faceted:false,roughness:.67,metallic:.52,light:[.31,.81],saturation:1.12},
 'anatomical-realism':{head:1,width:1,faceted:false,roughness:.82,metallic:.34,light:[.48,.58],saturation:.77}
});
export const lods=Object.freeze({low:{sides:8,rings:5},medium:{sides:12,rings:8},high:{sides:24,rings:14}});
export function appearance(style,lod){if(!styles[style]||!lods[lod])throw Error('Unknown style or LOD');return {...styles[style],...lods[lod]}}
export function classifyPart(name){let n=name.toLowerCase();if(/blade|hilt|guard|shield|boss|buckle|saddle|howdah|rail|reins|bag|tool/.test(n))return 'equipment';if(/helmet|hair or helmet|crest|lamella|belt|shoe|cloak|tunic|skirt|coat|sleeve|mail/.test(n))return 'clothing';return 'body'}
